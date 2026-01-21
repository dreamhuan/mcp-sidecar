import { Loader2 } from "lucide-react";
import { ActionItem } from "../types";

interface QuickActionsProps {
  actions: ActionItem[];
  loading: boolean;
  onRun: (action: ActionItem) => void;
  // 用于显示在卡片上的动态描述
  getDynamicDesc?: (actionId: string) => string;
}

export function QuickActions({
  actions,
  loading,
  onRun,
  getDynamicDesc,
}: QuickActionsProps) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
        Quick Actions
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {actions.map((act) => (
          <button
            key={act.id}
            onClick={() => onRun(act)}
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
                {getDynamicDesc ? getDynamicDesc(act.id) : act.desc}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
