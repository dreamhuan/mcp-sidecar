import { useState } from "react";
import {
  BookTemplate,
  Plus,
  Trash2,
  Edit2,
  X,
  Copy,
  AlertCircle, // 🔥 新增引用
} from "lucide-react";
import { PromptTemplate, ToastType } from "../types";

interface PromptManagerProps {
  isOpen: boolean;
  onClose: () => void;
  prompts: PromptTemplate[];
  setPrompts: (prompts: PromptTemplate[]) => void;
  showToast: (title: string, desc: string, type: ToastType) => void;
}

export function PromptManager({
  isOpen,
  onClose,
  prompts,
  setPrompts,
  showToast,
}: PromptManagerProps) {
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(
    null,
  );
  // 🔥 新增：记录正在请求删除的 ID
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSavePrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrompt) return;

    const newPrompts = prompts.some((p) => p.id === editingPrompt.id)
      ? prompts.map((p) => (p.id === editingPrompt.id ? editingPrompt : p))
      : [...prompts, editingPrompt];

    setPrompts(newPrompts);
    setEditingPrompt(null);
    showToast("Saved Successfully", "Prompt template updated", "success");
  };

  // 🔥 修改：不再直接删除，而是触发弹窗
  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
  };

  // 🔥 新增：确认删除逻辑
  const confirmDelete = () => {
    if (deletingId) {
      setPrompts(prompts.filter((p) => p.id !== deletingId));
      showToast("Deleted", "Template removed", "success");
      setDeletingId(null);
    }
  };

  const copyContent = (content: string) => {
    navigator.clipboard.writeText(content);
    showToast("Copied", "Prompt content copied to clipboard", "success");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 主卡片容器 */}
      <div className="relative w-full max-w-md bg-white/90 backdrop-blur-xl rounded-[24px] shadow-2xl border border-white/50 p-6 flex flex-col max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Prompt Templates</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-black/5 rounded-full transition-colors text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 编辑模式 */}
        {editingPrompt ? (
          <form
            onSubmit={handleSavePrompt}
            className="flex flex-col gap-4 flex-1 overflow-hidden"
          >
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto px-1">
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">
                  Title
                </label>
                <input
                  className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g., Code Review"
                  value={editingPrompt.title}
                  onChange={(e) =>
                    setEditingPrompt({
                      ...editingPrompt,
                      title: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div className="space-y-1.5 flex-1 flex flex-col">
                <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">
                  Content
                </label>
                <textarea
                  className="w-full flex-1 min-h-[150px] px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none font-mono text-slate-600 leading-relaxed"
                  placeholder="Enter prompt content..."
                  value={editingPrompt.content}
                  onChange={(e) =>
                    setEditingPrompt({
                      ...editingPrompt,
                      content: e.target.value,
                    })
                  }
                  required
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t border-black/5">
              <button
                type="button"
                onClick={() => setEditingPrompt(null)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold shadow-md shadow-blue-500/20 transition-all active:scale-95"
              >
                Save
              </button>
            </div>
          </form>
        ) : (
          /* 列表模式 */
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2">
              {prompts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                  <BookTemplate className="w-8 h-8 opacity-50" />
                  <span className="text-sm">No templates yet</span>
                </div>
              ) : (
                prompts.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all"
                  >
                    <div className="flex-1 truncate pr-3">
                      <h3 className="text-sm font-semibold text-slate-700 truncate">
                        {p.title}
                      </h3>
                      <p className="text-[11px] text-slate-400 truncate opacity-80">
                        {p.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => copyContent(p.content)}
                        title="Copy prompt"
                        className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingPrompt(p)}
                        className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(p.id)} // 🔥 修改调用
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              onClick={() =>
                setEditingPrompt({
                  id: Date.now().toString(),
                  title: "",
                  content: "",
                })
              }
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-900/20 font-semibold text-sm"
            >
              <Plus className="w-4 h-4" />
              Create New Template
            </button>
          </div>
        )}

        {/* 🔥🔥🔥 新增：内部删除确认弹窗 Overlay 🔥🔥🔥 */}
        {deletingId && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[2px] animate-in fade-in duration-200 rounded-[24px]">
            <div className="w-[85%] bg-white rounded-xl shadow-2xl border border-slate-100 p-5 transform transition-all animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-800">
                    Delete Template?
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed px-2">
                    Are you sure you want to remove this?
                  </p>
                </div>
                <div className="flex items-center gap-3 w-full mt-2">
                  <button
                    onClick={() => setDeletingId(null)}
                    className="flex-1 py-2 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="flex-1 py-2 px-3 rounded-lg bg-red-500 text-xs font-semibold text-white shadow-sm hover:bg-red-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
