import { useState } from "react";
import { Wand2, Play, Loader2, Clipboard } from "lucide-react";
import { cn } from "../lib/utils";
import { ToastType } from "../types";

interface CommandBarProps {
  onExecute: (command: string) => Promise<void>;
  loading: boolean;
  showToast: (title: string, desc: string, type: ToastType) => void;
}

export function CommandBar({ onExecute, loading, showToast }: CommandBarProps) {
  const [command, setCommand] = useState("");

  // 🪄 Magic Grab: Read from Clipboard
  const handleMagicGrab = async () => {
    try {
      // 读取剪切板内容
      const text = await navigator.clipboard.readText();
      const clipboardText = text?.trim();

      if (clipboardText) {
        // 简单的格式校验/提示
        if (!clipboardText.startsWith("mcp:")) {
          showToast(
            "Format Warning",
            "Clipboard content doesn't look like a standard 'mcp:' command",
            "error",
          );
        }
        setCommand(clipboardText);
        showToast("Pasted", "Command pasted from clipboard", "success");
      } else {
        showToast("Empty Clipboard", "Clipboard is empty", "error");
      }
    } catch (e) {
      console.error(e);
      showToast(
        "Access Denied",
        "Failed to read clipboard. Please allow permission.",
        "error",
      );
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!command.trim()) return;
    onExecute(command);
  };

  return (
    <div className="relative group">
      {/* Glow Effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-500 to-violet-500 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>

      <form
        onSubmit={handleSubmit}
        className="relative flex items-center gap-2 bg-white p-1.5 rounded-[14px] shadow-sm border border-slate-100"
      >
        {/* Magic Button (Now reads clipboard) */}
        <button
          type="button"
          onClick={handleMagicGrab}
          className="p-2 rounded-[10px] bg-gradient-to-br from-indigo-50 to-purple-50 text-indigo-600 hover:from-indigo-100 hover:to-purple-100 hover:scale-105 active:scale-95 transition-all border border-indigo-100/50"
          title="Paste from Clipboard"
        >
          {/* 这里换成了 Wand2，你也可以换成 Clipboard 图标，看你喜好 */}
          <Wand2 className="w-4 h-4" />
        </button>

        {/* Input */}
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="mcp:list or mcp:server:tool({...})"
          className="flex-1 bg-transparent border-none outline-none text-[13px] font-mono text-slate-700 placeholder:text-slate-400/60 h-9 px-1"
        />

        {/* Run Button */}
        <button
          type="submit"
          disabled={!command || loading}
          className={cn(
            "p-2 rounded-[10px] transition-all flex items-center justify-center min-w-[36px]",
            !command
              ? "bg-slate-100 text-slate-300 cursor-not-allowed"
              : "bg-slate-900 text-white hover:bg-slate-800 shadow-md shadow-slate-900/10 active:scale-95",
          )}
          title="Run Command"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4 fill-current" />
          )}
        </button>
      </form>
    </div>
  );
}
