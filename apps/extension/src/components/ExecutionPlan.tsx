import {
  Play,
  FileText,
  AlertTriangle,
  Check,
  Loader2,
  XCircle,
} from "lucide-react";
import { ParsedCommand } from "../lib/command-parser";
import { cn } from "../lib/utils";

interface ExecutionPlanProps {
  commands: ParsedCommand[];
  onConfirm: () => void;
  onCancel: () => void;
  isExecuting: boolean;
  progress: number; // 当前执行到第几个
}

export function ExecutionPlan({
  commands,
  onConfirm,
  onCancel,
  isExecuting,
  progress,
}: ExecutionPlanProps) {
  // 区分读取和写入，给写入操作加警告色
  const getIcon = (cmd: ParsedCommand) => {
    if (!cmd.isValid) return <XCircle className="w-4 h-4 text-red-500" />;
    if (cmd.tool.includes("write") || cmd.tool === "diff") {
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    }
    return <FileText className="w-4 h-4 text-blue-500" />;
  };

  const getStatusIcon = (idx: number) => {
    if (idx < progress) return <Check className="w-4 h-4 text-emerald-500" />;
    if (idx === progress && isExecuting)
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    return null;
  };

  return (
    <div className="w-full bg-slate-50/50 border border-slate-200 rounded-[16px] overflow-hidden animate-in zoom-in-95 duration-200 shadow-lg">
      <div className="bg-slate-100/80 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <h3 className="text-[13px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <Play className="w-3.5 h-3.5" />
          Execution Plan ({commands.length})
        </h3>
        {isExecuting && (
          <span className="text-[12px] font-mono text-slate-500">
            {progress} / {commands.length}
          </span>
        )}
      </div>

      <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
        {commands.map((cmd, idx) => (
          <div
            key={idx}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border text-[13px] transition-all",
              idx === progress && isExecuting
                ? "bg-blue-50 border-blue-200"
                : "bg-white border-slate-100",
              !cmd.isValid && "bg-red-50 border-red-100",
            )}
          >
            <div className="mt-0.5 shrink-0">
              {isExecuting ? getStatusIcon(idx) || getIcon(cmd) : getIcon(cmd)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">{cmd.tool}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                  {cmd.server}
                </span>
              </div>

              {/* 参数预览 */}
              <div className="mt-1 font-mono text-[11px] text-slate-500 break-all leading-relaxed opacity-80">
                {JSON.stringify(cmd.args).slice(0, 100)}
                {JSON.stringify(cmd.args).length > 100 && "..."}
              </div>

              {!cmd.isValid && (
                <div className="mt-1 text-red-500 text-[11px] font-medium">
                  Invalid JSON arguments
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
        <button
          onClick={onCancel}
          disabled={isExecuting}
          className="flex-1 py-2 rounded-xl text-[13px] font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isExecuting || commands.some((c) => !c.isValid)}
          className={cn(
            "flex-[2] py-2 rounded-xl text-[13px] font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100",
            commands.some((c) => c.tool.includes("write"))
              ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600" // 写入操作用橙色警示
              : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700",
          )}
        >
          {isExecuting ? "Executing..." : `Run ${commands.length} Commands`}
        </button>
      </div>
    </div>
  );
}
