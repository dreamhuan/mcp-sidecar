import { useState } from "react";
import { Copy, BookTemplate, ChevronDown, TerminalSquare } from "lucide-react";
import { cn } from "../lib/utils";
import { PromptTemplate, ToastType } from "../types";

interface ResultPreviewProps {
  content: string;
  prompts: PromptTemplate[];
  showToast: (title: string, desc: string, type: ToastType) => void;
}

export function ResultPreview({
  content,
  prompts,
  showToast,
}: ResultPreviewProps) {
  const [showPromptMenu, setShowPromptMenu] = useState(false);

  // 🔥 Empty State
  if (!content) {
      return (
          <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-slate-200 rounded-[16px] bg-slate-50/50">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                  <TerminalSquare className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-[13px] font-medium text-slate-500">No results yet</p>
              <p className="text-[11px] text-slate-400 mt-1">Execute a command to see output</p>
          </div>
      );
  }

  const copyToClipboard = async (text: string, template?: PromptTemplate) => {
    let final = text;
    if (template) {
      final = `${template.content}\n\n\`\`\`\n${text}\n\`\`\``;
    } else {
      final = `\`\`\`\n${text}\n\`\`\``;
    }
    await navigator.clipboard.writeText(final);
    showToast(
      "Copied",
      template ? `Template applied: ${template.title}` : "Raw content copied",
      "success",
    );
    setShowPromptMenu(false);
  };

  return (
    <section className="animate-in fade-in slide-in-from-bottom-6 duration-500 ease-out pb-6">
      {/* Inner Header Removed */}
      <div className="flex items-center justify-end px-1 mb-2">
        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => copyToClipboard(content)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/50 hover:bg-white border border-black/5 text-[11px] font-medium text-slate-600 transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </button>

          {prompts.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowPromptMenu(!showPromptMenu)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 text-[11px] font-medium text-indigo-600 transition-all active:scale-95 shadow-sm cursor-pointer",
                  showPromptMenu && "bg-indigo-100 border-indigo-200",
                )}
              >
                <BookTemplate className="w-3.5 h-3.5" />
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>

              {showPromptMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowPromptMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white/90 backdrop-blur-xl border border-white/50 shadow-xl rounded-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase border-b border-black/5 bg-slate-50/50">
                      Copy with Prompt
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                      {prompts.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => copyToClipboard(content, p)}
                          className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors truncate"
                        >
                          {p.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#1e1e1e] rounded-[16px] shadow-2xl border border-white/10 overflow-hidden font-mono text-[12px]">
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
        <div className="p-4 text-slate-300 max-h-80 overflow-y-auto scrollbar-hide leading-relaxed selection:bg-blue-500/30">
          <div className="flex gap-2">
            <span className="text-emerald-400">➜</span>
            <span className="text-blue-400">~</span>
            <span className="text-slate-400">cat output.txt</span>
          </div>
          <div className="mt-3 text-slate-200 whitespace-pre-wrap break-all opacity-90 font-mono">
            {content}
          </div>
          <div className="mt-2 flex items-center gap-1">
            <span className="text-emerald-400">➜</span>
            <span className="text-blue-400">~</span>
            <span className="animate-pulse w-2 h-4 bg-slate-500 block"></span>
          </div>
        </div>
      </div>
    </section>
  );
}
