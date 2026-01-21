import { useState } from "react";
import { Terminal, FileText, GitBranch, Copy } from "lucide-react";

// 类型定义
type ActionConfig = {
  label: string;
  server: string;
  tool: string;
  args?: Record<string, any>;
  promptPrefix?: string; // 自动加在 Prompt 前面的话
  icon: React.ReactNode;
};

const ACTIONS: ActionConfig[] = [
  {
    label: "获取 Git Diff",
    server: "git",
    tool: "diff",
    promptPrefix: "请分析以下代码变更并检查潜在Bug：\n\n",
    icon: <GitBranch className="w-4 h-4" />,
  },
  {
    label: "列出当前文件",
    server: "fs",
    tool: "list_directory",
    args: { path: "." },
    promptPrefix: "这是我当前的项目结构：\n\n",
    icon: <FileText className="w-4 h-4" />,
  },
  // 你可以在这里无限扩展
];

function App() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  // 动态参数输入 (简化版，比如读取特定文件)
  const [filePath, setFilePath] = useState("");

  const handleRun = async (action: ActionConfig, customArgs?: any) => {
    setLoading(true);
    setStatus("Running...");

    try {
      const res = await fetch("http://localhost:8080/api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverName: action.server,
          toolName: action.tool,
          args: { ...action.args, ...customArgs },
        }),
      });

      const json = await res.json();

      if (json.success) {
        // 组装最终文本
        const finalContent = `${action.promptPrefix || ""}\`\`\`\n${json.data}\n\`\`\``;
        await navigator.clipboard.writeText(finalContent);
        setStatus("Copied to Clipboard! ✅");
      } else {
        setStatus(`Error: ${json.error}`);
      }
    } catch (e) {
      setStatus("Connection Failed ❌");
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(""), 3000);
    }
  };

  return (
    <div className="w-full h-screen bg-slate-50 p-4 text-slate-800 flex flex-col gap-4">
      <header className="flex items-center gap-2 border-b pb-2 border-slate-200">
        <Terminal className="w-5 h-5 text-indigo-600" />
        <h1 className="font-bold text-lg">MCP Sidecar</h1>
      </header>

      {/* 预设按钮区域 */}
      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-slate-500 uppercase">
          Quick Actions
        </h2>
        {ACTIONS.map((act, idx) => (
          <button
            key={idx}
            onClick={() => handleRun(act)}
            disabled={loading}
            className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <span className="text-indigo-500">{act.icon}</span>
            <span className="text-sm font-medium">{act.label}</span>
          </button>
        ))}
      </div>

      {/* 带输入的区域 */}
      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-slate-500 uppercase">
          File Reader
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="src/App.tsx"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() =>
              handleRun(
                {
                  label: "Read File",
                  server: "fs",
                  tool: "read_file",
                  icon: <Copy />,
                  promptPrefix: `以下是文件 ${filePath} 的内容：\n\n`,
                },
                { path: filePath },
              )
            }
            className="bg-indigo-600 text-white px-3 rounded-md hover:bg-indigo-700"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 状态栏 */}
      {status && (
        <div
          className={`mt-auto p-2 text-center text-xs rounded-md font-medium animate-pulse ${status.includes("Error") || status.includes("Failed") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
        >
          {status}
        </div>
      )}
    </div>
  );
}

export default App;
