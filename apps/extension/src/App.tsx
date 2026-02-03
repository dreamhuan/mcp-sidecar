import { useState, useRef, useEffect } from "react";
import {
  Terminal,
  BookTemplate,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  FolderOpen,
  PlaySquare,
  FileText,
} from "lucide-react";
import * as Toast from "@radix-ui/react-toast";
import { cn } from "./lib/utils";

// Components
import { FileSearch, type FileSearchRef } from "./components/FileSearch";
import { PromptManager } from "./components/PromptManager";
import { ResultPreview } from "./components/ResultPreview";
import { QuickActions } from "./components/QuickActions";
import { CommandBar, type CommandBarRef } from "./components/CommandBar";
import { ServerShortcuts } from "./components/ServerShortcuts";
import { ExecutionPlan } from "./components/ExecutionPlan";
import { CollapsibleSection } from "./components/CollapsibleSection";

// Logic & Types
import { ActionItem, ToastType } from "./types";
import { parseCommandsFromText } from "./lib/command-parser";
import { ACTIONS } from "./data/config";
import { usePrompts } from "./hooks/usePrompts";
import { useMcpEngine } from "./hooks/useMcpEngine";

function App() {
  // --- Refs ---
  const searchRef = useRef<FileSearchRef>(null);
  const commandBarRef = useRef<CommandBarRef>(null);

  // --- Toast Management (UI Layer) ---
  const [open, setOpen] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    title: "",
    desc: "",
    type: "success" as ToastType,
  });
  const timerRef = useRef<number>(0);
  const [isPromptMgrOpen, setIsPromptMgrOpen] = useState(false);

  const showToast = (
    title: string,
    desc: string,
    type: ToastType = "success",
  ) => {
    setOpen(false);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setToastConfig({ title, desc, type });
      setOpen(true);
    }, 100);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // --- Core Hooks ---
  // 1. 数据层: 管理 Prompt
  const { prompts, setPrompts } = usePrompts();
  // 2. 执行层: 管理所有 API 交互和状态
  const engine = useMcpEngine(showToast);

  // --- Event Handlers ---
  const handleCommandExecute = async (inputStr: string) => {
    const commands = parseCommandsFromText(inputStr);
    if (commands.length > 0) {
      if (
        commands.length === 1 &&
        !commands[0].tool.includes("write") &&
        !commands[0].tool.includes("delete") &&
        !commands[0].tool.includes("move")
      ) {
        commandBarRef.current?.setValue(commands[0].original);
        await engine.executeCommand(
          commands[0].server,
          commands[0].tool,
          commands[0].args,
        );
        return;
      }
      engine.setPendingCommands(commands);
      engine.setFailedIndex(null);
      engine.setExecutionProgress(0);
      return;
    }
    await engine.executeCommand(null, null, null, "", inputStr);
  };

  const handleActionClick = (act: ActionItem) => {
    if (act.id === "initialize-context") {
      // 将 prompts 状态传给引擎的宏命令
      engine.generateContext(prompts, (val) =>
        commandBarRef.current?.setValue(val),
      );
      return;
    }
    if (act.id === "review-changes") {
      engine.generateReview(prompts, (val) =>
        commandBarRef.current?.setValue(val),
      );
      return;
    }
    // 🔥 Project Explorer Logic
    if (act.id === "project-tree") {
      // 从 Ref 获取当前浏览的路径
      const currentPath = searchRef.current?.getValue() || ".";
      // 如果是搜索模式，getValue 返回的是 query，这里做一个简单的判断或者默认为根目录
      const safePath = currentPath.startsWith(".") || currentPath.includes("/") ? currentPath : ".";
      
      const args = { root: safePath, depth: 3 };
      const commandStr = `mcp:internal:get_tree(${JSON.stringify(args)})`;

      commandBarRef.current?.setValue(commandStr);
      engine.executeCommand(
        "internal",
        "get_tree",
        args,
        `Current Project Structure (${safePath}):\n\n`,
      );
      return;
    }

    const args = act.args || {};
    const hasArgs = Object.keys(args).length > 0;
    const argsSuffix = hasArgs ? `(${JSON.stringify(args)})` : "";
    const commandStr = `mcp:${act.server}:${act.tool}${argsSuffix}`;

    commandBarRef.current?.setValue(commandStr);
    engine.executeCommand(act.server, act.tool, args, act.promptPrefix);
  };

  // --- Render ---
  return (
    <Toast.Provider swipeDirection="right">
      {/* Background */}
      <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-[100px] opacity-70"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[500px] h-[500px] bg-purple-200/30 rounded-full blur-[100px] opacity-70"></div>
      </div>

      <div className="min-h-screen flex flex-col p-5 gap-6 font-sans relative">
        {/* Header */}
        <header className="flex items-center justify-between pt-2 px-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center border border-black/5">
              <Terminal className="w-5 h-5 text-slate-700" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
                MCP Sidecar
              </h1>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
                <span className="text-[11px] font-medium text-slate-500">
                  Online
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsPromptMgrOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-[14px] bg-white shadow-sm border border-slate-200/60 text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:shadow-md active:scale-95 transition-all duration-200 group"
          >
            <BookTemplate className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-[13px] font-semibold">Templates</span>
          </button>
        </header>

        {/* Command Section (Always Visible) */}
        <section className="animate-in fade-in slide-in-from-top-4 duration-500 flex flex-col gap-0">
            <CommandBar
                ref={commandBarRef}
                onExecute={handleCommandExecute}
                loading={engine.loading}
                showToast={showToast}
            />

            <div className="mt-3 px-0.5">
                {engine.pendingCommands.length > 0 ? (
                <ExecutionPlan
                    commands={engine.pendingCommands}
                    isExecuting={engine.loading}
                    progress={engine.executionProgress}
                    failedIndex={engine.failedIndex}
                    onConfirm={engine.executeBatch}
                    onRemove={engine.removeCommand}
                    onCancel={() => {
                        engine.setPendingCommands([]);
                        engine.setFailedIndex(null);
                        engine.setExecutionProgress(0);
                    }}
                />
                ) : (
                <ServerShortcuts
                    servers={engine.availableServers}
                    onSelect={handleCommandExecute}
                    loading={engine.loading}
                />
                )}
            </div>
        </section>

        {/* Quick Actions */}
        <CollapsibleSection 
            title="Quick Actions" 
            defaultOpen={true} 
            icon={<LayoutGrid className="w-4 h-4" />}
        >
            <QuickActions
                actions={ACTIONS}
                loading={engine.loading}
                onRun={handleActionClick}
            />
        </CollapsibleSection>

        {/* File Explorer */}
        <CollapsibleSection 
            title="Project Explorer" 
            defaultOpen={true} 
            icon={<FolderOpen className="w-4 h-4" />}
        >
            {/* 🔥 绑定 ref */}
            <FileSearch
                ref={searchRef}
                loading={engine.loading}
                onSelect={(path) => {
                const isDir = path.endsWith("/") || path === "." || path === "..";
                const tool = isDir ? "list_directory" : "read_file";
                const args = { path };
                const commandStr = `mcp:internal:${tool}(${JSON.stringify(args)})`;
                commandBarRef.current?.setValue(commandStr);
                engine.executeCommand(
                    "internal",
                    tool,
                    args,
                    isDir
                    ? `Structure of directory ${path}:\n\n`
                    : `Content of file ${path}:\n\n`,
                );
                }}
            />
        </CollapsibleSection>

        {/* Results */}
        <CollapsibleSection 
            title="Results Preview" 
            defaultOpen={true} 
            icon={<FileText className="w-4 h-4" />}
        >
            <ResultPreview
                content={engine.resultPreview}
                prompts={prompts}
                showToast={showToast}
            />
        </CollapsibleSection>

        {/* Prompt Manager Modal */}
        <PromptManager
          isOpen={isPromptMgrOpen}
          onClose={() => setIsPromptMgrOpen(false)}
          prompts={prompts}
          setPrompts={setPrompts}
          showToast={showToast}
        />
      </div>

      {/* Toast Notification */}
      <Toast.Root
        duration={3000}
        open={open}
        onOpenChange={setOpen}
        className={cn(
          "fixed bottom-4 right-4 z-[100] w-[300px] rounded-[16px] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/40 backdrop-blur-md",
          toastConfig.type === "error"
            ? "bg-red-50/95 text-red-900"
            : "bg-white/95 text-slate-900",
        )}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-full shrink-0 shadow-sm border border-black/5",
              toastConfig.type === "error"
                ? "bg-red-100 text-red-600"
                : "bg-emerald-100 text-emerald-600",
            )}
          >
            {toastConfig.type === "error" ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 pt-0.5">
            <Toast.Title className="text-[14px] font-bold leading-none mb-1">
              {toastConfig.title}
            </Toast.Title>
            <Toast.Description className="text-[13px] opacity-80 leading-snug">
              {toastConfig.desc}
            </Toast.Description>
          </div>
        </div>
      </Toast.Root>
      <Toast.Viewport />
    </Toast.Provider>
  );
}

export default App;
