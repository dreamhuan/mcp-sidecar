import { useState, useRef, useEffect } from "react";
import {
  Terminal,
  FileText,
  GitBranch,
  Copy,
  Loader2,
  Search,
  Command,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import * as Toast from "@radix-ui/react-toast";
import { cn } from "./lib/utils";

// --- 配置区域 ---
const ACTIONS = [
  {
    id: "git-diff",
    label: "Git Diff",
    server: "git",
    tool: "diff",
    promptPrefix: "请分析以下代码变更并检查潜在Bug：\n\n",
    icon: <GitBranch className="w-6 h-6 text-blue-500" />, // macOS 风格图标颜色
    desc: "查看未提交变更",
  },
  {
    id: "ls",
    label: "List Files",
    server: "fs",
    tool: "list_directory",
    args: { path: "." },
    promptPrefix: "这是我当前的项目结构：\n\n",
    icon: <FileText className="w-6 h-6 text-indigo-500" />,
    desc: "查看根目录结构",
  },
];

function App() {
  const [loading, setLoading] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [resultPreview, setResultPreview] = useState("");

  // Toast State
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
        const finalContent = `${promptPrefix}\`\`\`\n${json.data}\n\`\`\``;
        await navigator.clipboard.writeText(finalContent);
        showToast("已复制", "内容已复制到剪贴板", "success");
        setResultPreview(json.data);
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
      {/* 背景光晕 (Mesh Gradient) */}
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
                onClick={() =>
                  handleRun(
                    act.server,
                    act.tool,
                    act.args || {},
                    act.promptPrefix,
                  )
                }
                disabled={loading}
                className="group relative flex flex-col items-start p-4 h-32 rounded-[20px] text-left glass-button"
              >
                <div className="mb-auto p-2 bg-white rounded-full shadow-sm">
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  ) : (
                    act.icon
                  )}
                </div>
                <div className="z-10">
                  <span className="block font-bold text-slate-800 text-[15px] mb-0.5">
                    {act.label}
                  </span>
                  <span className="block text-[11px] text-slate-500 font-medium leading-tight">
                    {act.desc}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* File Reader (Spotlight Style) */}
        <section>
          <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
            File Reader
          </h2>
          <div className="glass-panel p-2 rounded-[18px] flex items-center gap-2 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <div className="pl-3 text-slate-400">
              <Search className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                filePath &&
                handleRun(
                  "fs",
                  "read_file",
                  { path: filePath },
                  `文件 ${filePath} 内容：\n\n`,
                )
              }
              placeholder="Search file path..."
              className="flex-1 bg-transparent border-none outline-none text-[14px] text-slate-700 placeholder:text-slate-400 font-medium h-10"
            />
            <button
              disabled={!filePath || loading}
              onClick={() =>
                handleRun(
                  "fs",
                  "read_file",
                  { path: filePath },
                  `以下是文件 ${filePath} 的内容：\n\n`,
                )
              }
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-white shadow-sm border border-black/5 hover:bg-slate-50 active:scale-90 transition-all disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              ) : (
                <Command className="w-4 h-4 text-slate-600" />
              )}
            </button>
          </div>
        </section>

        {/* Result Preview (Terminal Style) */}
        {resultPreview && (
          <section className="animate-in fade-in slide-in-from-bottom-6 duration-500 ease-out">
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider">
                Preview
              </h2>
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-100 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Copied
              </span>
            </div>

            {/* macOS Terminal Window */}
            <div className="bg-[#1e1e1e] rounded-[16px] shadow-2xl border border-white/10 overflow-hidden font-mono text-[12px]">
              {/* Window Title Bar */}
              <div className="bg-[#2d2d2d] px-4 py-2.5 flex items-center gap-2 border-b border-white/5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]"></div>{" "}
                  {/* Close */}
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]"></div>{" "}
                  {/* Minimize */}
                  <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]"></div>{" "}
                  {/* Maximize */}
                </div>
                <div className="flex-1 text-center text-slate-400 text-[10px] font-medium ml-[-46px]">
                  bash — 80x24
                </div>
              </div>

              {/* Content */}
              <div className="p-4 text-slate-300 max-h-60 overflow-y-auto scrollbar-hide leading-relaxed">
                <span className="text-emerald-400 mr-2">➜</span>
                <span className="text-blue-400">~</span>
                <span className="ml-2 text-slate-400">cat result.txt</span>
                <div className="mt-2 text-slate-200 whitespace-pre-wrap break-all opacity-90">
                  {resultPreview.slice(0, 600)}
                  {resultPreview.length > 600 && (
                    <span className="text-slate-500 block mt-2 italic">
                      ... (Content truncated)
                    </span>
                  )}
                </div>
                <div className="mt-2 animate-pulse text-slate-500">_</div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Modern Toast */}
      <Toast.Root
        open={open}
        onOpenChange={setOpen}
        className={cn(
          "fixed bottom-4 right-4 z-[100] w-[300px] rounded-[16px] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/40 backdrop-blur-md",
          toastConfig.type === "error"
            ? "bg-red-50/90 text-red-900"
            : "bg-white/90 text-slate-900",
        )}
      >
        <div className="flex gap-3">
          <div
            className={cn(
              "mt-0.5 p-1 rounded-full",
              toastConfig.type === "error" ? "bg-red-100" : "bg-emerald-100",
            )}
          >
            {toastConfig.type === "error" ? (
              <AlertCircle className="w-4 h-4 text-red-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            )}
          </div>
          <div>
            <Toast.Title className="text-[14px] font-bold">
              {toastConfig.title}
            </Toast.Title>
            <Toast.Description className="text-[12px] opacity-70 mt-0.5 leading-snug">
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
