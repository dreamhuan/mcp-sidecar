import { Terminal, Play, Hash } from "lucide-react";
import { cn } from "../lib/utils";

interface ServerShortcutsProps {
  servers: string[];
  onSelect: (cmd: string) => void;
  loading?: boolean;
}

export function ServerShortcuts({
  servers,
  onSelect,
  loading,
}: ServerShortcutsProps) {
  // 🔥 更新 1: 默认列表命令
  const commands = ["mcp:internal:list"];

  servers.forEach((s) => {
    if (s && s !== "all") {
      // 🔥 更新 2: 特定 Server 的列表命令 (参数化)
      // 如果你觉得 JSON 看起来太长，也可以简写，但标准 JSON 最稳妥
      // 这里生成: mcp:internal:list({"server":"git"})
      commands.push(`mcp:internal:list({"server":"${s}"})`);
    }
  });

  if (commands.length === 0) return null;

  return (
    <div className="flex flex-col items-start gap-1 w-full px-4 mt-2 animate-in fade-in duration-300">
      <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-0.5 select-none">
        Suggested Commands
      </div>

      {commands.map((cmd) => (
        <button
          key={cmd}
          onClick={() => onSelect(cmd)}
          disabled={loading}
          className={cn(
            "group flex items-center gap-2 text-left transition-colors duration-200",
            "text-[13px] font-mono text-slate-400 hover:text-blue-500",
            loading && "opacity-50 cursor-not-allowed",
          )}
        >
          <span className="opacity-30 group-hover:opacity-100 transition-opacity">
            ›
          </span>
          <span className="relative truncate max-w-[300px]">
            {cmd}
            <span className="absolute left-0 right-0 bottom-0 h-[1px] bg-blue-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
          </span>
        </button>
      ))}
    </div>
  );
}
