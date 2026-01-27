import { Rocket, ScanEye, FolderTree, GitBranch } from "lucide-react";
import { ActionItem, PromptTemplate } from "../types";
import systemPromptRaw from "../prompts/system.md?raw";
import crPromptRaw from "../prompts/code_review.md?raw";

// 🔥 定义系统模板
export const SYSTEM_PROMPTS: PromptTemplate[] = [
  {
    id: "init-protocol",
    title: "⚡️ Initialize Sidecar Protocol",
    content: systemPromptRaw,
  },
  {
    id: "code-review",
    title: "Code Review",
    content: crPromptRaw,
  },
];

// 配置快捷指令
export const ACTIONS: ActionItem[] = [
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
    // 默认不传参即为 root=".", depth=3，但会被 handleActionClick 动态拦截覆盖
    args: {},
    promptPrefix: "",
    icon: <FolderTree className="w-6 h-6 text-emerald-500" />,
    desc: "Copy project structure (From Explorer)",
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

// Helper: 根据文件名推断语言
export const getLanguageFromPath = (path: string) => {
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
