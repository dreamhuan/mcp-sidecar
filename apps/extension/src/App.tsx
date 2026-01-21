import { useState, useRef, useEffect } from "react";
import {
  Terminal,
  GitBranch,
  FileText,
  BookTemplate,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import * as Toast from "@radix-ui/react-toast";
import { cn } from "./lib/utils";
import { FileSearch, type FileSearchRef } from "./components/FileSearch";
import { PromptManager } from "./components/PromptManager";
import { ResultPreview } from "./components/ResultPreview";
import { QuickActions } from "./components/QuickActions";
import { ActionItem, PromptTemplate, ToastType } from "./types";

// 配置
const ACTIONS: ActionItem[] = [
  {
    id: "git-diff",
    label: "Git Diff",
    server: "git",
    tool: "diff",
    promptPrefix:
      "Please analyze the following code changes and check for potential bugs:\n\n",
    icon: <GitBranch className="w-6 h-6 text-blue-500" />,
    desc: "View uncommitted changes",
  },
  {
    id: "ls",
    label: "List Files",
    server: "fs",
    tool: "list_directory",
    args: { path: "." },
    promptPrefix: "Here is my current project structure:\n\n",
    icon: <FileText className="w-6 h-6 text-indigo-500" />,
    desc: "View directory structure",
  },
];

function App() {
  const [loading, setLoading] = useState(false);
  const [resultPreview, setResultPreview] = useState("");
  const searchRef = useRef<FileSearchRef>(null);

  // 提示词状态
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [isPromptMgrOpen, setIsPromptMgrOpen] = useState(false);

  // Toast 状态
  const [open, setOpen] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    title: "",
    desc: "",
    type: "success" as ToastType,
  });
  const timerRef = useRef<number>(0);

  const showToast = (
    title: string,
    desc: string,
    type: ToastType = "success",
  ) => {
    setOpen(false);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setToastConfig({ title, desc, type });
      setOpen(true);
    }, 100);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // 本地存储加载/保存
  useEffect(() => {
    const saved = localStorage.getItem("mcp-prompts");
    if (saved) {
      try {
        setPrompts(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("mcp-prompts", JSON.stringify(prompts));
  }, [prompts]);

  // 执行核心逻辑
  const handleRun = async (
    serverName: string,
    toolName: string,
    args: any,
    promptPrefix: string = "",
  ) => {
    setLoading(true);
    setResultPreview("");

    try {
      const res = await fetch("http://localhost:8080/api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverName, toolName, args }),
      });

      const json = await res.json();

      if (json.success) {
        let contentStr = "";
        // 格式化目录列表
        if (
          Array.isArray(json.data) &&
          json.data.length > 0 &&
          "isDirectory" in json.data[0]
        ) {
          const dirs = json.data.filter((item: any) => item.isDirectory);
          const files = json.data.filter((item: any) => !item.isDirectory);
          contentStr = [
            ...dirs.map((d: any) => `${d.name}/`),
            ...files.map((f: any) => f.name),
          ].join("\n");
        } else if (typeof json.data === "object") {
          contentStr = JSON.stringify(json.data, null, 2);
        } else {
          contentStr = json.data;
        }

        setResultPreview(contentStr);
        showToast(
          "Execution Successful",
          "Result ready, please copy manually",
          "success",
        );
      } else {
        showToast("Execution Failed", json.error || "Unknown error", "error");
      }
    } catch (e) {
      showToast(
        "Connection Failed",
        "Please check local service (Port 8080)",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  // 处理 QuickAction 点击
  const handleActionClick = (act: ActionItem) => {
    let args = act.args || {};
    let promptPrefix = act.promptPrefix;

    if (act.id === "ls") {
      const currentInput = searchRef.current?.getValue() || "";
      const targetPath = currentInput || ".";
      args = { path: targetPath };
      promptPrefix = `Structure of directory ${targetPath}:\n\n`;
    }

    handleRun(act.server, act.tool, args, promptPrefix);
  };

  return (
    <Toast.Provider swipeDirection="right">
      {/* 背景光晕 */}
      <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-[100px] opacity-70"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[500px] h-[500px] bg-purple-200/30 rounded-full blur-[100px] opacity-70"></div>
      </div>

      <div className="min-h-screen flex flex-col p-5 gap-6 font-sans relative">
        {/* Header */}
        <header className="flex items-center justify-between pt-2 px-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center border border-black/5">
              <Terminal className="w-5 h-5 text-slate-700" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
                MCP Sidecar
              </h1>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
                <span className="text-[11px] font-medium text-slate-500">
                  Online
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsPromptMgrOpen(true)}
            className="p-2 rounded-lg hover:bg-white/50 active:scale-95 transition-all text-slate-600 border border-transparent hover:border-black/5 hover:shadow-sm"
            title="Manage Prompt Templates"
          >
            <BookTemplate className="w-5 h-5" />
          </button>
        </header>

        {/* 快捷动作 */}
        <QuickActions
          actions={ACTIONS}
          loading={loading}
          onRun={handleActionClick}
          getDynamicDesc={(id) => {
            if (id === "ls") {
              // 尝试获取当前输入框的值，如果获取不到则回退
              const val = searchRef.current?.getValue();
              return val ? val : "View root files";
            }
            return "";
          }}
        />

        {/* 文件阅读器 */}
        <section>
          <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
            File Reader
          </h2>
          <FileSearch
            ref={searchRef}
            loading={loading}
            onSelect={(path) => {
              const isDir = path.endsWith("/") || path === "." || path === "..";
              handleRun(
                "fs",
                isDir ? "list_directory" : "read_file",
                { path },
                isDir
                  ? `Structure of directory ${path}:\n\n`
                  : `Content of file ${path}:\n\n`,
              );
            }}
          />
        </section>

        {/* 结果预览 */}
        <ResultPreview
          content={resultPreview}
          prompts={prompts}
          showToast={showToast}
        />

        {/* 提示词管理弹窗 */}
        <PromptManager
          isOpen={isPromptMgrOpen}
          onClose={() => setIsPromptMgrOpen(false)}
          prompts={prompts}
          setPrompts={setPrompts}
          showToast={showToast}
        />
      </div>

      {/* 全局通知 */}
      <Toast.Root
        open={open}
        onOpenChange={setOpen}
        className={cn(
          "fixed bottom-4 right-4 z-[100] w-[300px] rounded-[16px] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/40 backdrop-blur-md",
          toastConfig.type === "error"
            ? "bg-red-50/95 text-red-900"
            : "bg-white/95 text-slate-900",
        )}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-full shrink-0 shadow-sm border border-black/5",
              toastConfig.type === "error"
                ? "bg-red-100 text-red-600"
                : "bg-emerald-100 text-emerald-600",
            )}
          >
            {toastConfig.type === "error" ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>

          <div className="flex-1 pt-0.5">
            <Toast.Title className="text-[14px] font-bold leading-none mb-1">
              {toastConfig.title}
            </Toast.Title>
            <Toast.Description className="text-[13px] opacity-80 leading-snug">
              {toastConfig.desc}
            </Toast.Description>
          </div>
        </div>
      </Toast.Root>
      <Toast.Viewport />
    </Toast.Provider>
  );
}

export default App;
