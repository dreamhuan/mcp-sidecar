import { useState, useRef, useEffect } from "react";
import {
  Terminal,
  GitBranch,
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
// 🔥 引入 CommandBarRef 类型
import { CommandBar, type CommandBarRef } from "./components/CommandBar";
import { ServerShortcuts } from "./components/ServerShortcuts";
import { ActionItem, PromptTemplate, ToastType } from "./types";
import { API_BASE_URL } from "./common";

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
];

function App() {
  const [loading, setLoading] = useState(false);
  const [resultPreview, setResultPreview] = useState("");
  // 存储探测到的 Server 列表
  const [availableServers, setAvailableServers] = useState<string[]>([]);

  const searchRef = useRef<FileSearchRef>(null);
  // 🔥 新增：引用 CommandBar 实例
  const commandBarRef = useRef<CommandBarRef>(null);

  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [isPromptMgrOpen, setIsPromptMgrOpen] = useState(false);

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

  const handleRun = async (
    serverName: string | null,
    toolName: string | null,
    args: any | null,
    promptPrefix: string = "",
    commandStr?: string,
  ) => {
    setLoading(true);
    setResultPreview("");

    try {
      const body = commandStr
        ? { command: commandStr }
        : { serverName, toolName, args };

      const res = await fetch(`${API_BASE_URL}/api/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (json.success) {
        let contentStr = "";

        // 🔥 解析 Server 列表逻辑
        if (json.isToolList && Array.isArray(json.data)) {
          // 使用 Set 进行合并，防止覆盖
          const newServers = json.data.map((t: any) => t.server);
          setAvailableServers((prev) => {
            const combined = new Set([...prev, ...newServers]);
            return Array.from(combined).sort();
          });

          // 列表渲染逻辑
          const grouped: Record<string, any[]> = {};
          json.data.forEach((t: any) => {
            if (!grouped[t.server]) grouped[t.server] = [];
            grouped[t.server].push(t);
          });

          const lines: string[] = [];
          const isDetailed =
            json.data.length > 0 && "inputSchema" in json.data[0];

          lines.push(
            isDetailed
              ? "📦 MCP TOOLS DETAILS (Full Schema)\n"
              : "📦 MCP TOOLS SUMMARY (Names Only)\n",
          );

          if (!isDetailed) {
            lines.push("Tip: Click suggested commands above to see details.\n");
          }

          for (const [server, tools] of Object.entries(grouped)) {
            lines.push(`SERVER: ${server}`);
            tools.forEach((t: any) => {
              lines.push(`  ├─ 🛠️  ${t.name}`);
              if (t.description)
                lines.push(`  │   Desc: ${t.description.replace(/\n/g, " ")}`);

              if (t.inputSchema) {
                const props = t.inputSchema?.properties || {};
                const propKeys = Object.keys(props);
                if (propKeys.length > 0) {
                  lines.push(`  │   Args:`);
                  propKeys.forEach((key) => lines.push(`  │      └─ ${key}`));
                }
              }
              lines.push(`  │`);
            });
            lines.push("");
          }
          contentStr = lines.join("\n");
        } else if (
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
          contentStr = String(json.data);
        }

        contentStr = contentStr.replace(/`/g, "'");
        const finalResult = promptPrefix
          ? `${promptPrefix}${contentStr}`
          : contentStr;
        setResultPreview(finalResult);

        try {
          await navigator.clipboard.writeText(finalResult);
          showToast(
            "Copied & Executed",
            "Result copied to clipboard automatically",
            "success",
          );
        } catch (err) {
          showToast("Executed", "Result displayed (Copy failed)", "success");
        }
      } else {
        showToast("Execution Failed", json.error || "Unknown error", "error");
      }
    } catch (e) {
      showToast("Connection Failed", "Please check local service", "error");
    } finally {
      setLoading(false);
    }
  };

  // 🔥 核心修改：通过 Ref 控制 CommandBar 的输入框
  const handleCommandExecute = async (cmd: string) => {
    // 1. 命令上屏 (Imperative)
    commandBarRef.current?.setValue(cmd);
    // 2. 执行逻辑
    await handleRun(null, null, null, "", cmd);
  };

  const handleActionClick = (act: ActionItem) => {
    handleRun(act.server, act.tool, act.args || {}, act.promptPrefix);
  };

  return (
    <Toast.Provider swipeDirection="right">
      <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-[100px] opacity-70"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[500px] h-[500px] bg-purple-200/30 rounded-full blur-[100px] opacity-70"></div>
      </div>

      <div className="min-h-screen flex flex-col p-5 gap-6 font-sans relative">
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
            className="flex items-center gap-2 px-3 py-2 rounded-[14px] bg-white shadow-sm border border-slate-200/60 text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:shadow-md active:scale-95 transition-all duration-200 group"
          >
            <BookTemplate className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-[13px] font-semibold">Templates</span>
          </button>
        </header>

        {/* Command Area */}
        <section className="animate-in fade-in slide-in-from-top-4 duration-500 flex flex-col gap-0">
          <CommandBar
            // 🔥 绑定 Ref
            ref={commandBarRef}
            onExecute={handleCommandExecute}
            loading={loading}
            showToast={showToast}
          />

          <ServerShortcuts
            servers={availableServers}
            onSelect={handleCommandExecute}
            loading={loading}
          />
        </section>

        <QuickActions
          actions={ACTIONS}
          loading={loading}
          onRun={handleActionClick}
        />

        <section>
          <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
            Project Explorer
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

        <ResultPreview
          content={resultPreview}
          prompts={prompts}
          showToast={showToast}
        />
        <PromptManager
          isOpen={isPromptMgrOpen}
          onClose={() => setIsPromptMgrOpen(false)}
          prompts={prompts}
          setPrompts={setPrompts}
          showToast={showToast}
        />
      </div>

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
