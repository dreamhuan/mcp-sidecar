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
  // 基础命令 + 探测到的 Server 命令
  const commands = ["mcp:list"];

  servers.forEach((s) => {
    if (s && s !== "all") {
      commands.push(`mcp:list:${s}`);
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
          <span className="relative">
            {cmd}
            {/* 下划线动画效果 */}
            <span className="absolute left-0 right-0 bottom-0 h-[1px] bg-blue-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
          </span>
        </button>
      ))}
    </div>
  );
}
