import { useState, useRef, useEffect } from "react";
import {
  Terminal,
  GitBranch,
  BookTemplate,
  CheckCircle2,
  AlertCircle,
  FolderTree,
  Rocket,
  ScanEye,
} from "lucide-react";
import * as Toast from "@radix-ui/react-toast";
import { cn } from "./lib/utils";

// Components
import { FileSearch } from "./components/FileSearch";
import { PromptManager } from "./components/PromptManager";
import { ResultPreview } from "./components/ResultPreview";
import { QuickActions } from "./components/QuickActions";
import { CommandBar, type CommandBarRef } from "./components/CommandBar";
import { ServerShortcuts } from "./components/ServerShortcuts";
import { ExecutionPlan } from "./components/ExecutionPlan";

// Logic & Types
import { ActionItem, PromptTemplate, ToastType } from "./types";
import { API_BASE_URL } from "./common";
import {
  parseCommandsFromText,
  type ParsedCommand,
} from "./lib/command-parser";

import systemPromptRaw from "./prompts/system.md?raw";
import crPromptRaw from "./prompts/code_review.md?raw";

// 配置快捷指令
const ACTIONS: ActionItem[] = [
  {
    id: "initialize-context", // 特殊 ID
    label: "Init Context",
    server: "internal", // 这里只是占位，会被拦截
    tool: "macro",
    promptPrefix: "",
    icon: <Rocket className="w-6 h-6 text-purple-500" />, // 紫色显眼
    desc: "Protocol + Tools + Tree (One Click)",
  },
  {
    id: "review-changes",
    label: "Review Changes",
    server: "internal",
    tool: "macro", // 宏标记
    promptPrefix: "",
    icon: <ScanEye className="w-6 h-6 text-orange-500" />,
    desc: "Diff Context + Code Review Prompt",
  },
  {
    id: "project-tree",
    label: "Copy Tree",
    server: "internal",
    tool: "get_tree",
    // 默认不传参即为 root=".", depth=3
    args: {},
    promptPrefix: "Current Project Structure:\n\n",
    icon: <FolderTree className="w-6 h-6 text-emerald-500" />,
    desc: "Copy project structure (Default depth: 3)",
  },
  {
    id: "git-diff",
    label: "Git Diff",
    // 🔥 修改：server 变更为 'internal', tool 变更为 'git_diff'
    server: "internal",
    tool: "git_diff",
    promptPrefix:
      "Please analyze the following code changes and check for potential bugs:\n\n",
    icon: <GitBranch className="w-6 h-6 text-blue-500" />,
    desc: "View uncommitted changes",
  },
];

// 🔥 2. 定义系统模板
const SYSTEM_PROMPTS: PromptTemplate[] = [
  {
    id: "init-protocol",
    title: "⚡️ Initialize Sidecar Protocol",
    content: systemPromptRaw, // 使用导入的文件内容
  },
  {
    id: "code-review",
    title: "Code Review",
    content: crPromptRaw,
  },
];

// Helper: 根据文件名推断语言
const getLanguageFromPath = (path: string) => {
  if (!path) return "";
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    html: "html",
    css: "css",
    md: "markdown",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    sh: "bash",
    yaml: "yaml",
    yml: "yaml",
  };
  return map[ext || ""] || "";
};

function App() {
  // --- Global State ---
  const [loading, setLoading] = useState(false);
  const [resultPreview, setResultPreview] = useState("");
  const [availableServers, setAvailableServers] = useState<string[]>([]);

  // --- Batch Execution State ---
  const [pendingCommands, setPendingCommands] = useState<ParsedCommand[]>([]);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [failedIndex, setFailedIndex] = useState<number | null>(null); // 🔥 新增：失败状态

  // --- Refs ---
  const searchRef = useRef(null);
  const commandBarRef = useRef<CommandBarRef>(null);

  // --- Prompt & Toast State ---
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [isPromptMgrOpen, setIsPromptMgrOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    title: "",
    desc: "",
    type: "success" as ToastType,
  });
  const timerRef = useRef<number>(0);

  // --- Helpers ---
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

  // Load/Save Prompts
  // 🔥 3. 修改加载逻辑：合并 System + User
  useEffect(() => {
    const saved = localStorage.getItem("mcp-prompts");
    let userPrompts: PromptTemplate[] = [];

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // 过滤掉 ID 与系统模板冲突的旧数据 (确保系统模板始终使用最新的 system.md)
          const systemIds = new Set(SYSTEM_PROMPTS.map((p) => p.id));
          userPrompts = parsed.filter((p) => !systemIds.has(p.id));
        }
      } catch (e) {
        console.error("Failed to parse saved prompts", e);
      }
    }

    // 合并：系统模板在前，用户模板在后
    setPrompts([...SYSTEM_PROMPTS, ...userPrompts]);
  }, []);

  // 保存逻辑保持不变，它会将合并后的结果存回去
  useEffect(() => {
    if (prompts.length > 0) {
      localStorage.setItem("mcp-prompts", JSON.stringify(prompts));
    }
  }, [prompts]);

  // --- Core Logic: API Invocation ---

  // 基础 API 调用封装
  const invokeAPI = async (payload: any) => {
    const res = await fetch(`${API_BASE_URL}/api/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  };

  // 🔥 核心逻辑 1: 批量执行 (Smart Executor)
  const handleBatchExecution = async () => {
    setLoading(true);
    setExecutionProgress(0);
    setFailedIndex(null); // 重置失败状态
    const results: string[] = [];

    try {
      for (let i = 0; i < pendingCommands.length; i++) {
        // 更新进度 UI：当前正在执行第 i 个
        setExecutionProgress(i);

        const cmd = pendingCommands[i];

        // 执行单个命令
        const json = await invokeAPI({
          serverName: cmd.server,
          toolName: cmd.tool,
          args: cmd.args,
        });

        // 格式化结果
        let output = "";

        // 🔥🔥🔥 核心修复：检查业务逻辑是否成功
        if (json.success) {
          if (typeof json.data === "string") output = json.data;
          else output = JSON.stringify(json.data, null, 2);

          // 为批量执行的 read_file 结果包裹代码块，使用普通字符串拼接，避免转义地狱
          if (cmd.tool === "read_file" && cmd.args?.path) {
            const lang = getLanguageFromPath(cmd.args.path);
            output = "```" + lang + "\n" + output + "\n```";
          } else if (cmd.tool === "git_diff" || cmd.tool === "get_file_diff") {
            output = "```diff\n" + output + "\n```";
          } else if (cmd.tool === "list_directory" || cmd.tool === "get_tree") {
            output = "```text\n" + output + "\n```";
          }

          results.push(
            `### [CMD] ${cmd.tool} (Args: ${JSON.stringify(cmd.args)})\n${output}\n`,
          );

          // 如果成功，进度加 1，准备进入下一次循环
          // 只有全部成功，最后 progress 才会等于 length
          setExecutionProgress(i + 1);
        } else {
          // 🔥 发现错误，停止执行
          output = `Error: ${json.error}`;

          results.push(`### [CMD FAILED] ${cmd.tool}\nERROR: ${json.error}\n`);

          // 标记当前索引为失败
          setFailedIndex(i);

          showToast("Batch Stopped", `Command '${cmd.tool}' failed.`, "error");

          // 关键：跳出循环，不再执行后续指令
          break;
        }
      }

      // 合并结果
      const finalReport = results.join("\n" + "=".repeat(40) + "\n\n");
      setResultPreview(finalReport);

      // 无论成功还是中途失败，都把当前的报告复制出去
      try {
        await navigator.clipboard.writeText(finalReport);
        if (failedIndex === null) {
          showToast(
            "Batch Complete",
            "All results copied to clipboard",
            "success",
          );
        }
      } catch (e) {
        showToast("Batch Complete", "Results ready (Copy failed)", "success");
      }

      // 🔥 修改：只有在完全成功时才清空 plan
      // 如果失败了，保留 pendingCommands，让用户看到是哪一个红了
      if (failedIndex === null) {
        setPendingCommands([]);
      }
    } catch (e: any) {
      showToast("Batch Error", e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // 🔥 核心逻辑 2: 通用单次执行 (Legacy & Single Command)
  // 同时也负责更新 Server 列表和处理 mcp:list 的特殊 UI
  const handleRun = async (
    serverName: string | null,
    toolName: string | null,
    args: any | null,
    promptPrefix: string = "",
    commandStr?: string,
  ) => {
    setLoading(true);
    setResultPreview("");

    try {
      const payload = commandStr
        ? { command: commandStr }
        : { serverName, toolName, args };
      const json = await invokeAPI(payload);

      if (json.success) {
        let contentStr = "";

        // 特殊处理：更新 Server 列表
        if (json.isToolList && Array.isArray(json.data)) {
          const newServers = json.data.map((t: any) => t.server);
          setAvailableServers((prev) => {
            const combined = new Set([...prev, ...newServers]);
            return Array.from(combined).sort();
          });

          // 格式化 Tool List 输出
          const grouped: Record<string, any[]> = {};
          json.data.forEach((t: any) => {
            if (!grouped[t.server]) grouped[t.server] = [];
            grouped[t.server].push(t);
          });

          const lines: string[] = [];
          const isDetailed =
            json.data.length > 0 && "inputSchema" in json.data[0];

          lines.push(
            isDetailed
              ? "📦 MCP TOOLS DETAILS (Full Schema)\n"
              : "📦 MCP TOOLS SUMMARY (Names Only)\n",
          );

          if (!isDetailed)
            lines.push("Tip: Click suggested commands above to see details.\n");

          for (const [server, tools] of Object.entries(grouped)) {
            lines.push(`SERVER: ${server}`);
            tools.forEach((t: any) => {
              lines.push(`  ├─ 🛠️  ${t.name}`);
              if (t.description)
                lines.push(`  │   Desc: ${t.description.replace(/\n/g, " ")}`);

              if (t.inputSchema) {
                const props = t.inputSchema?.properties || {};
                const propKeys = Object.keys(props);
                const required = new Set(t.inputSchema?.required || []);

                if (propKeys.length > 0) {
                  lines.push(`  │   Args:`);
                  propKeys.forEach((key) => {
                    const prop = props[key];
                    // 🔥 修改开始：构建详细的参数描述字符串
                    let argStr = `  │      └─ ${key}`;

                    // 1. 标记必填 (*)
                    if (required.has(key)) argStr += "*";

                    // 2. 显示类型 (type)
                    if (prop.type) argStr += ` (${prop.type})`;

                    // 3. 显示描述 (description)
                    if (prop.description) {
                      argStr += `: ${prop.description}`;
                    }

                    lines.push(argStr);
                    // 🔥 修改结束
                  });
                }
              }
              lines.push(`  │`);
            });
            lines.push("");
          }
          contentStr = lines.join("\n");
        }
        // 格式化文件列表
        else if (
          Array.isArray(json.data) &&
          json.data.length > 0 &&
          "isDirectory" in json.data[0]
        ) {
          const dirs = json.data.filter((item: any) => item.isDirectory);
          const files = json.data.filter((item: any) => !item.isDirectory);
          contentStr = [
            ...dirs.map((d: any) => `${d.name}/`),
            ...files.map((f: any) => f.name),
          ].join("\n");

          // 自动包裹文件列表 (双引号拼接)
          contentStr = "```text\n" + contentStr + "\n```";
        }
        // 格式化普通对象
        else if (typeof json.data === "object") {
          contentStr = JSON.stringify(json.data, null, 2);
        } else {
          contentStr = String(json.data);

          // 🔥 自动包裹读取内容 (双引号拼接)
          if (toolName === "read_file" && args?.path) {
            const lang = getLanguageFromPath(args.path);
            contentStr = "```" + lang + "\n" + contentStr + "\n```";
          } else if (toolName === "get_tree" || toolName === "git_status") {
            contentStr = "```text\n" + contentStr + "\n```";
          } else if (toolName === "git_diff" || toolName === "get_file_diff") {
            contentStr = "```diff\n" + contentStr + "\n```";
          }
        }

        const finalResult = promptPrefix
          ? `${promptPrefix}${contentStr}`
          : contentStr;
        setResultPreview(finalResult);

        try {
          await navigator.clipboard.writeText(finalResult);
          showToast(
            "Copied & Executed",
            "Result copied to clipboard automatically",
            "success",
          );
        } catch (err) {
          showToast("Executed", "Result displayed (Copy failed)", "success");
        }
      } else {
        // 后端返回 success: false (例如 500 错误)
        showToast("Execution Failed", json.error || "Unknown error", "error");
        // 也可以在预览区显示错误
        setResultPreview(`❌ EXECUTION FAILED:\n${json.error}`);
      }
    } catch (e) {
      showToast("Connection Failed", "Please check local service", "error");
    } finally {
      setLoading(false);
    }
  };

  // 🔥 核心入口: 处理用户输入 (Smart Parser Entry)
  const handleCommandExecute = async (inputStr: string) => {
    // 1. 尝试从文本中解析出一个或多个 mcp: 指令
    const commands = parseCommandsFromText(inputStr);

    // 2. 如果解析出有效指令
    if (commands.length > 0) {
      // 场景 A: 只有 1 个指令，且是安全的 (read/list)，直接执行，跳过确认 UI
      if (
        commands.length === 1 &&
        !commands[0].tool.includes("write") &&
        !commands[0].tool.includes("delete") &&
        !commands[0].tool.includes("move")
      ) {
        // 利用 Ref 设置输入框内容，保持视觉同步
        commandBarRef.current?.setValue(commands[0].original);
        // 执行
        await handleRun(commands[0].server, commands[0].tool, commands[0].args);
        return;
      }

      // 场景 B: 多个指令 OR 包含副作用(write)的指令 -> 进入 Execution Plan
      setPendingCommands(commands);
      // 🔥 重置状态，确保新的 Plan 是干净的
      setFailedIndex(null);
      setExecutionProgress(0);
      return;
    }

    // 3. 没解析出 mcp:server:tool 格式 (例如用户输入 mcp:list 或其他非标指令)
    // 走 Legacy 逻辑
    await handleRun(null, null, null, "", inputStr);
  };

  // 🔥 修改：聚合上下文生成逻辑
  const generateFullContext = async () => {
    // 1. 立即清空指令区，提供视觉反馈
    commandBarRef.current?.setValue("");

    setLoading(true);
    try {
      // Step A: 获取协议 (优先从当前加载的 Prompts 中找，找不到用默认)
      const protocolPrompt =
        prompts.find((p) => p.id === "init-protocol")?.content ||
        "Protocol not found.";

      // Step B: 获取工具列表 (调用后端 internal:list)
      const listRes = await invokeAPI({
        serverName: "internal",
        toolName: "list",
      });

      let toolsSection = "";
      if (listRes.success && Array.isArray(listRes.data)) {
        // 简单格式化工具列表
        const lines = ["## Available Tools"];
        listRes.data.forEach((t: any) => {
          // 格式: - mcp:server:tool (description)
          lines.push(
            `- \`mcp:${t.server}:${t.name}\`: ${t.description || "No description"}`,
          );
        });
        toolsSection = lines.join("\n");
      }

      // Step C: 获取项目结构 (调用后端 internal:get_tree)
      // 默认深度 3，这对 AI 理解上下文通常足够
      const treeRes = await invokeAPI({
        serverName: "internal",
        toolName: "get_tree",
        args: { root: ".", depth: 3 },
      });
      // 使用双引号拼接，避免反引号转义错误
      const treeSection =
        "## Project Structure\n```\n" + treeRes.data + "\n```";

      // Step D: 组装终极 Prompt
      const fullContext = [
        "# System Context Initialization",
        "",
        "## Protocol & Instructions",
        protocolPrompt,
        "",
        toolsSection,
        "",
        treeSection,
        "",
        "Ready for instructions.",
      ].join("\n");

      // Step E: 复制并提示
      await navigator.clipboard.writeText(fullContext);
      showToast(
        "Context Ready!",
        "Protocol, Tools & Tree copied to clipboard.",
        "success",
      );

      // 同时也显示在预览区，方便查看
      setResultPreview(fullContext);
    } catch (e: any) {
      showToast("Init Failed", e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const generateReviewContext = async () => {
    commandBarRef.current?.setValue("");
    setLoading(true);

    try {
      const reviewPromptTemplate =
        prompts.find((p) => p.title === "Code Review")?.content ||
        "Please review the following code changes for bugs, security, and style:\n";

      // 1. 获取变更文件列表
      const filesRes = await invokeAPI({
        serverName: "internal",
        toolName: "git_changed_files",
      });

      if (
        !filesRes.success ||
        !Array.isArray(filesRes.data) ||
        filesRes.data.length === 0
      ) {
        showToast("No Changes", "No modified files found in git.", "error");
        setLoading(false);
        return;
      }

      const files = filesRes.data as string[];
      showToast(
        "Analyzing Files",
        `Gathering Diff & Content for ${files.length} files...`,
      );

      // 2. 🔥 并发获取：Diff (老代码信息) + ReadFile (新代码上下文)
      const fileContexts = await Promise.all(
        files.map(async (filePath) => {
          try {
            // 并行请求：获取 Diff 和 获取完整内容
            const [diffRes, contentRes] = await Promise.all([
              invokeAPI({
                serverName: "internal",
                toolName: "get_file_diff",
                args: { path: filePath },
              }),
              invokeAPI({
                serverName: "internal",
                toolName: "read_file",
                args: { path: filePath },
              }),
            ]);

            // 使用双引号字符串拼接，规避模板字符串中反引号转义丢失的问题
            return [
              `\n=== FILE REPORT: ${filePath} ===`,
              `\n[PART 1: CHANGES (Git Diff)]`,
              `Shows lines removed (-) and added (+) id: ${filePath}-diff`,
              "```diff",
              diffRes.data || "(No diff info)",
              "```",
              `\n[PART 2: FULL CURRENT CONTENT]`,
              `Full context of the file after changes id: ${filePath}-content`,
              "```" + getLanguageFromPath(filePath),
              contentRes.data || "(Error reading content)",
              "```",
            ].join("\n");
          } catch (e) {
            return `\n=== FILE: ${filePath} ===\n(Error gathering info)`;
          }
        }),
      );

      // 3. 组装最终文本
      const fullContext = [
        "# Code Review Request",
        "",
        reviewPromptTemplate,
        "",
        "## File Analysis",
        ...fileContexts,
      ].join("\n");

      await navigator.clipboard.writeText(fullContext);
      showToast(
        "Ready for Review!",
        "Diffs & Content copied to clipboard.",
        "success",
      );
      setResultPreview(fullContext);
    } catch (e: any) {
      showToast("Review Init Failed", e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // 🔥 3. 修改 Action 点击处理：拦截 initialize-context
  const handleActionClick = (act: ActionItem) => {
    // 拦截特殊宏命令
    if (act.id === "initialize-context") {
      generateFullContext();
      return;
    }
    if (act.id === "review-changes") {
      generateReviewContext();
      return;
    }

    // 常规逻辑
    // 1. 构造标准指令字符串 mcp:server:tool(args)
    const args = act.args || {};
    const hasArgs = Object.keys(args).length > 0;

    // 如果有参数，序列化为 JSON；如果没有参数，为了简洁可以省略括号，或者加上 ()
    // 这里我们选择：如果有参数才加括号，保持界面清爽
    const argsSuffix = hasArgs ? `(${JSON.stringify(args)})` : "";
    const commandStr = `mcp:${act.server}:${act.tool}${argsSuffix}`;

    // 2. 利用 Ref 将指令回填到 CommandBar
    commandBarRef.current?.setValue(commandStr);

    // 3. 执行逻辑
    handleRun(act.server, act.tool, args, act.promptPrefix);
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

        {/* Command Section */}
        <section className="animate-in fade-in slide-in-from-top-4 duration-500 flex flex-col gap-0">
          <CommandBar
            ref={commandBarRef}
            onExecute={handleCommandExecute}
            loading={loading}
            showToast={showToast}
          />

          {/* Conditional UI: Execution Plan OR Shortcuts */}
          <div className="mt-3 px-0.5">
            {pendingCommands.length > 0 ? (
              <ExecutionPlan
                commands={pendingCommands}
                isExecuting={loading}
                progress={executionProgress}
                failedIndex={failedIndex} // 🔥 传递 Prop
                onConfirm={handleBatchExecution}
                onCancel={() => {
                  setPendingCommands([]);
                  setFailedIndex(null);
                  setExecutionProgress(0);
                }}
              />
            ) : (
              <ServerShortcuts
                servers={availableServers}
                onSelect={handleCommandExecute}
                loading={loading}
              />
            )}
          </div>
        </section>

        {/* Quick Actions */}
        <QuickActions
          actions={ACTIONS}
          loading={loading}
          onRun={handleActionClick}
        />

        {/* File Explorer */}
        <section>
          <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
            Project Explorer
          </h2>
          <FileSearch
            ref={searchRef}
            loading={loading}
            onSelect={(path) => {
              // 1. 判断类型
              const isDir = path.endsWith("/") || path === "." || path === "..";
              const tool = isDir ? "list_directory" : "read_file";
              const args = { path };

              // 2. 🔥 构造指令字符串并回填到输入框
              const commandStr = `mcp:internal:${tool}(${JSON.stringify(args)})`;
              commandBarRef.current?.setValue(commandStr);

              // 3. 执行
              handleRun(
                "internal",
                tool,
                args,
                isDir
                  ? `Structure of directory ${path}:\n\n`
                  : `Content of file ${path}:\n\n`,
              );
            }}
          />
        </section>

        {/* Results */}
        <ResultPreview
          content={resultPreview}
          prompts={prompts}
          showToast={showToast}
        />

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
