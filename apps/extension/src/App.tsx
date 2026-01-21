import { useState, useRef, useEffect } from "react";
import {
  Terminal,
  GitBranch,
  FileText,
  Loader2,
  Copy,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import * as Toast from "@radix-ui/react-toast";
import { cn } from "./lib/utils";
import { FileSearch, type FileSearchRef } from "./components/FileSearch";

// --- 配置区域 ---
const ACTIONS = [
  {
    id: "git-diff",
    label: "Git Diff",
    server: "git",
    tool: "diff",
    promptPrefix: "请分析以下代码变更并检查潜在Bug：\n\n",
    icon: <GitBranch className="w-6 h-6 text-blue-500" />,
    desc: "查看未提交变更",
  },
  {
    id: "ls",
    label: "List Files",
    server: "fs",
    tool: "list_directory",
    args: { path: "." }, // 默认参数，实际执行时会被 Search 输入框覆盖
    promptPrefix: "这是我当前的项目结构：\n\n",
    icon: <FileText className="w-6 h-6 text-indigo-500" />,
    desc: "查看目录结构",
  },
];

function App() {
  const [loading, setLoading] = useState(false);
  const [resultPreview, setResultPreview] = useState("");

  // 引用 Search 组件，用于获取当前输入框的值
  const searchRef = useRef<FileSearchRef>(null);

  // Toast 状态
  const [open, setOpen] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    title: "",
    desc: "",
    type: "success",
  });
  const timerRef = useRef<number>(0);

  const showToast = (
    title: string,
    desc: string,
    type: "success" | "error" = "success",
  ) => {
    setOpen(false);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setToastConfig({ title, desc, type });
      setOpen(true);
    }, 100);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

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

        // 🟢 针对文件列表的特殊格式化：纯文本风格
        if (
          Array.isArray(json.data) &&
          json.data.length > 0 &&
          "isDirectory" in json.data[0]
        ) {
          const dirs = json.data.filter((item: any) => item.isDirectory);
          const files = json.data.filter((item: any) => !item.isDirectory);

          // 文件夹加 / 后缀
          const dirLines = dirs.map((d: any) => `${d.name}/`);
          const fileLines = files.map((f: any) => f.name);

          contentStr = [...dirLines, ...fileLines].join("\n");
        }
        // 普通 JSON 对象 (转字符串)
        else if (typeof json.data === "object") {
          contentStr = JSON.stringify(json.data, null, 2);
        }
        // 普通文本
        else {
          contentStr = json.data;
        }

        const finalContent = `${promptPrefix}\`\`\`\n${contentStr}\n\`\`\``;
        await navigator.clipboard.writeText(finalContent);
        showToast("已复制", "内容已复制到剪贴板", "success");
        setResultPreview(contentStr);
      } else {
        showToast("执行失败", json.error || "未知错误", "error");
      }
    } catch (e) {
      showToast("连接失败", "请检查本地服务 (Port 8080)", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Toast.Provider swipeDirection="right">
      {/* 背景光晕 */}
      <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-[100px] opacity-70"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[500px] h-[500px] bg-purple-200/30 rounded-full blur-[100px] opacity-70"></div>
      </div>

      <div className="min-h-screen flex flex-col p-5 gap-6 font-sans">
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
        </header>

        {/* Quick Actions Grid */}
        <section>
          <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {ACTIONS.map((act) => (
              <button
                key={act.id}
                onClick={() => {
                  let args = act.args || {};
                  let promptPrefix = act.promptPrefix;

                  // 🔥 联动逻辑：点击 List Files 时，读取输入框的路径
                  if (act.id === "ls") {
                    const currentInput = searchRef.current?.getValue() || "";
                    const targetPath = currentInput || ".";

                    args = { path: targetPath };
                    promptPrefix = `目录 ${targetPath} 的结构：\n\n`;
                  }

                  handleRun(act.server, act.tool, args, promptPrefix);
                }}
                disabled={loading}
                className="group relative flex flex-col items-start p-4 h-32 rounded-[20px] text-left glass-button transition-all duration-200 active:scale-[0.98]"
              >
                <div className="mb-auto w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-sm border border-slate-100/50 group-hover:scale-110 transition-transform">
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  ) : (
                    act.icon
                  )}
                </div>
                <div className="z-10 mt-3">
                  <span className="block font-bold text-slate-800 text-[15px] mb-0.5 leading-tight">
                    {act.label}
                  </span>
                  <span className="block text-[12px] text-slate-500 font-medium leading-tight opacity-80">
                    {act.desc}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* File Reader (带搜索和自动补全) */}
        <section>
          <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
            File Reader
          </h2>

          <FileSearch
            ref={searchRef}
            loading={loading}
            // 🔥 核心修改：根据路径是否以 / 结尾，决定是列出目录还是读取文件
            onSelect={(path) => {
              if (path.endsWith("/") || path === "." || path === "..") {
                // 如果是目录 -> 执行 List Files
                handleRun(
                  "fs",
                  "list_directory",
                  { path },
                  `目录 ${path} 的结构：\n\n`,
                );
              } else {
                // 如果是文件 -> 执行 Read File
                handleRun(
                  "fs",
                  "read_file",
                  { path },
                  `文件 ${path} 内容：\n\n`,
                );
              }
            }}
          />
        </section>

        {/* Result Preview (Terminal Style) */}
        {resultPreview && (
          <section className="animate-in fade-in slide-in-from-bottom-6 duration-500 ease-out pb-6">
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">
                Preview
              </h2>

              {/* 独立的复制按钮 */}
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(resultPreview);
                  showToast("已复制", "内容已手动复制到剪贴板", "success");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/50 hover:bg-white border border-black/5 text-[11px] font-medium text-slate-600 transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Content
              </button>
            </div>

            {/* macOS Terminal Window */}
            <div className="bg-[#1e1e1e] rounded-[16px] shadow-2xl border border-white/10 overflow-hidden font-mono text-[12px]">
              {/* Window Title Bar */}
              <div className="bg-[#2d2d2d] px-4 py-2.5 flex items-center gap-2 border-b border-white/5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]"></div>
                </div>
                <div className="flex-1 text-center text-slate-400 text-[10px] font-medium ml-[-46px]">
                  bash — output
                </div>
              </div>

              {/* Content */}
              <div className="p-4 text-slate-300 max-h-80 overflow-y-auto scrollbar-hide leading-relaxed selection:bg-blue-500/30">
                <div className="flex gap-2">
                  <span className="text-emerald-400">➜</span>
                  <span className="text-blue-400">~</span>
                  <span className="text-slate-400">cat output.txt</span>
                </div>

                <div className="mt-3 text-slate-200 whitespace-pre-wrap break-all opacity-90 font-mono">
                  {resultPreview}
                </div>

                <div className="mt-2 flex items-center gap-1">
                  <span className="text-emerald-400">➜</span>
                  <span className="text-blue-400">~</span>
                  <span className="animate-pulse w-2 h-4 bg-slate-500 block"></span>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Modern Toast Notification */}
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
          {/* 固定宽高防止挤压 */}
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
