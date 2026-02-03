import { useState, useImperativeHandle, type Ref } from "react";
import { ClipboardPaste, Play, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { ToastType } from "../types";

// 🔥 定义暴露给父组件的 Ref 方法
export interface CommandBarRef {
  setValue: (value: string) => void;
  getValue: () => string;
}

interface CommandBarProps {
  onExecute: (command: string) => Promise<void>;
  loading: boolean;
  showToast: (title: string, desc: string, type: ToastType) => void;
  // React 19 中 ref 可以直接作为 prop 传递
  ref?: Ref<CommandBarRef>;
}

export function CommandBar({
  onExecute,
  loading,
  showToast,
  ref,
}: CommandBarProps) {
  const [command, setCommand] = useState("");

  // 🔥 暴露方法给外部使用
  useImperativeHandle(ref, () => ({
    setValue: (val: string) => setCommand(val),
    getValue: () => command,
  }));

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
        {/* Paste Button */}
        <button
          type="button"
          onClick={handleMagicGrab}
          className="p-2 rounded-[10px] bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:scale-105 active:scale-95 transition-all border border-slate-200 hover:border-blue-200"
          title="Paste from Clipboard"
        >
          <ClipboardPaste className="w-4 h-4" />
        </button>

        {/* Input */}
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="mcp:server:tool({...})"
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
