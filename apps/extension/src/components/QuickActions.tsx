import { Play } from "lucide-react"; // 🔥 改为引入 Play
import { cn } from "../lib/utils";
import { ActionItem } from "../types";

interface QuickActionsProps {
  actions: ActionItem[];
  onRun: (action: ActionItem) => void;
  loading?: boolean;
}

export function QuickActions({ actions, onRun, loading }: QuickActionsProps) {
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
        Quick Actions
      </h3>

      <div className="flex flex-col gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => onRun(action)}
            disabled={loading}
            className={cn(
              "group relative flex items-center gap-3 p-2 rounded-xl text-left transition-all duration-200",
              "bg-white border border-slate-100 hover:border-blue-200 hover:shadow-sm hover:bg-slate-50/50",
              "active:scale-[0.99]",
              loading && "opacity-50 cursor-not-allowed",
            )}
          >
            {/* 左侧图标容器 */}
            <div
              className={cn(
                "shrink-0 w-9 h-9 flex items-center justify-center rounded-[10px]",
                "bg-slate-50 border border-slate-100 group-hover:bg-white group-hover:border-slate-200 transition-colors",
              )}
            >
              <div className="scale-90 opacity-80 group-hover:scale-100 group-hover:opacity-100 transition-all">
                {action.icon}
              </div>
            </div>

            {/* 右侧文字区域 */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-slate-700 group-hover:text-slate-900 truncate">
                  {action.label}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium truncate group-hover:text-slate-500">
                {action.desc}
              </span>
            </div>

            {/* 🔥 最右侧执行图标：Hover 时出现，带实心填充效果 */}
            <Play className="w-3.5 h-3.5 text-slate-300 fill-current opacity-0 -translate-x-2 group-hover:text-blue-500 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
          </button>
        ))}
      </div>
    </div>
  );
}
