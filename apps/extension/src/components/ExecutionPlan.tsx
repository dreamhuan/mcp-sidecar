import {
  Play,
  FileText,
  AlertTriangle,
  Check,
  Loader2,
  XCircle,
  Trash2,
} from "lucide-react";
import { ParsedCommand } from "../lib/command-parser";
import { cn } from "../lib/utils";

interface ExecutionPlanProps {
  commands: ParsedCommand[];
  onConfirm: () => void;
  onCancel: () => void;
  onRemove: (index: number) => void;
  isExecuting: boolean;
  progress: number; // 当前执行到第几个
  failedIndex: number | null; // 标记出错的索引
}

export function ExecutionPlan({
  commands,
  onConfirm,
  onCancel,
  onRemove,
  isExecuting,
  progress,
  failedIndex,
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
    // 🔥 优先判断是否是失败的那一行
    if (failedIndex !== null && idx === failedIndex) {
      return <XCircle className="w-4 h-4 text-red-500 animate-pulse" />;
    }

    // 如果还没有执行到这里
    if (idx > progress) return getIcon(commands[idx]);

    // 如果是当前行，且正在执行中 (且没有报错)
    if (idx === progress && isExecuting && failedIndex === null)
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;

    // 剩下的就是已完成的 (idx < progress) 或者是当前行但已经结束
    if (idx < progress) {
      return <Check className="w-4 h-4 text-emerald-500" />;
    }

    return getIcon(commands[idx]);
  };

  return (
    <div className="w-full bg-slate-50/50 border border-slate-200 rounded-[16px] overflow-hidden animate-in zoom-in-95 duration-200 shadow-lg">
      <div className="bg-slate-100/80 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <h3 className="text-[13px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <Play className="w-3.5 h-3.5" />
          Execution Plan ({commands.length})
        </h3>
        {(isExecuting || failedIndex !== null) && (
          <span
            className={cn(
              "text-[12px] font-mono",
              failedIndex !== null
                ? "text-red-500 font-bold"
                : "text-slate-500",
            )}
          >
            {failedIndex !== null
              ? "FAILED"
              : `${progress} / ${commands.length}`}
          </span>
        )}
      </div>

      <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
        {commands.map((cmd, idx) => {
          // 判断是否是错误行，用于背景染色
          const isFailed = failedIndex === idx;
          const isCurrent = idx === progress && isExecuting && !isFailed;

          return (
            <div
              key={idx}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border text-[13px] transition-all group",
                isCurrent ? "bg-blue-50 border-blue-200" : "",
                isFailed ? "bg-red-50 border-red-200 ring-1 ring-red-200" : "",
                !isCurrent && !isFailed ? "bg-white border-slate-100" : "",
                !cmd.isValid && "bg-red-50 border-red-100",
              )}
            >
              <div className="mt-0.5 shrink-0">{getStatusIcon(idx)}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-bold",
                      isFailed ? "text-red-700" : "text-slate-700",
                    )}
                  >
                    {cmd.tool}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                    {cmd.server}
                  </span>
                </div>

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

              {/* 🔥 Delete Button */}
              {!isExecuting && (
                <button
                  onClick={() => onRemove(idx)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                  title="Remove command"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
        <button
          onClick={onCancel}
          disabled={isExecuting && failedIndex === null}
          className="flex-1 py-2 rounded-xl text-[13px] font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          {failedIndex !== null ? "Close" : "Cancel"}
        </button>

        {failedIndex === null && (
          <button
            onClick={onConfirm}
            disabled={isExecuting || commands.some((c) => !c.isValid)}
            className={cn(
              "flex-[2] py-2 rounded-xl text-[13px] font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100",
              commands.some((c) => c.tool.includes("write"))
                ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700",
            )}
          >
            {isExecuting ? "Executing..." : `Run ${commands.length} Commands`}
          </button>
        )}
      </div>
    </div>
  );
}
