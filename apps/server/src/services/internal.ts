import path from "path";
import fs from "fs/promises";
import { PROJECT_ROOT, GIT_IGNORE_LIST } from "../config";
import { execAsync } from "../utils/exec";
import { generateTree, listFilesWithTypes } from "../utils/fs";
import { mcpClients } from "./mcp";

// 辅助：生成 Git Exclude 参数
const getGitExcludeArgs = () => {
  if (GIT_IGNORE_LIST.length === 0) return "";
  return GIT_IGNORE_LIST.map((file) => ` ":(exclude)${file}"`).join("");
};

// 辅助：去除 ANSI 颜色代码
const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

// 🔥 定义内部工具集
const internalTools = [
  {
    name: "list",
    description: "List available servers (default) or tools for a specific server.",
    inputSchema: {
      type: "object",
      properties: {
        server: {
          type: "string",
          description: "Filter tools by server name (e.g. 'git', 'fs'). If omitted, returns list of server names only.",
        },
      },
    },
  },
  {
    name: "get_tree",
    description:
      "Get project structure tree. Args: root (string, relative path), depth (number, default 3)",
    inputSchema: {
      type: "object",
      properties: {
        root: {
          type: "string",
          description:
            "Relative path to start tree from (e.g. 'src/components')",
        },
        depth: {
          type: "number",
          description: "Recursion depth (default 3)",
        },
      },
    },
  },
  {
    name: "list_directory",
    description: "List files in directory (Internal)",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path from project root",
        },
      },
    },
  },
  {
    name: "read_file",
    description: "Read file content (Internal)",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path from project root",
        },
      },
    },
  },
  {
    name: "execute",
    description: "Execute a shell command in the project root.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute (e.g. 'npm install')",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "git_diff",
    description: "Show uncommitted changes (git diff HEAD)",
    inputSchema: {},
  },
  {
    name: "git_status",
    description: "Show working tree status (git status)",
    inputSchema: {},
  },
  {
    name: "git_changed_files",
    description:
      "List files that have changed (modified/added) relative to HEAD",
    inputSchema: {},
  },
  {
    name: "get_file_diff",
    description: "Get git diff for a specific file (shows old vs new code)",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to file" },
      },
    },
  },
];

export async function handleInternalTool(toolName: string, args: any) {
  let resultData: any = "";
  let isToolList = false;
  let isStructured = false;

  if (toolName === "list") {
    const targetServer = args?.server;
    
    // 🔥 优化：如果没有指定 server，默认只返回 Server 名称列表
    if (!targetServer) {
       const servers = Array.from(mcpClients.keys()).sort();
       // 确保 internal 在列表中
       if (!servers.includes("internal")) servers.unshift("internal");
       return { data: servers, isStructured: true, isToolList: true };
    }

    // 如果指定了 Server，则查询该 Server 的具体工具
    const allTools: any[] = [];

    const formatTool = (t: any, sName: string, detailed: boolean) => ({
      server: sName,
      name: t.name,
      description: t.description || "",
      ...(detailed
        ? { inputSchema: t.inputSchema }
        : {}),
    });

    if (targetServer === "internal") {
      allTools.push(
        ...internalTools.map((t) => formatTool(t, "internal", true)),
      );
    } else {
      const client = mcpClients.get(targetServer);
      if (!client)
          throw new Error("Server not found");
      const result = await client.listTools();
      allTools.push(
        ...result.tools.map((t) => formatTool(t, targetServer, true)),
      );
    }
    
    return { data: allTools, isToolList: true };
  } else if (toolName === "get_tree") {
    const depth = args?.depth ? parseInt(args.depth) : 3;
    let relativeRoot = args?.root || ".";
    const targetPath = path.resolve(PROJECT_ROOT, relativeRoot);
    if (!targetPath.startsWith(PROJECT_ROOT))
      throw new Error("Access denied");
    const header =
      relativeRoot === "." ? `Project Root` : `${relativeRoot}/`;
    resultData = `${header}\n` + (await generateTree(targetPath, 0, depth));
  } else if (toolName === "execute") {
    const command = args?.command;
    if (!command) throw new Error("Command is required");
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: PROJECT_ROOT });
      resultData = stripAnsi(stdout);
      if (stderr) {
        resultData += `\n[stderr]:\n${stripAnsi(stderr)}`;
      }
      if (!resultData.trim()) {
        resultData = "Command executed successfully (no output).";
      }
    } catch (e: any) {
      // execAsync throws on non-zero exit code
      resultData = `Command failed:\n${e.message}`;
      if (e.stdout) resultData += `\n[stdout]:\n${stripAnsi(e.stdout)}`;
      if (e.stderr) resultData += `\n[stderr]:\n${stripAnsi(e.stderr)}`;
    }
  } else if (toolName === "git_diff") {
    const excludeArgs = getGitExcludeArgs();
    try {
      const { stdout } = await execAsync(`git diff HEAD -- . ${excludeArgs}`, { cwd: PROJECT_ROOT });
      resultData = stdout || "No changes detected.";
    } catch (e) {
      const { stdout } = await execAsync(`git diff -- . ${excludeArgs}`, { cwd: PROJECT_ROOT });
      resultData = stdout || "No changes detected (No HEAD).";
    }
  } else if (toolName === "git_status") {
    const excludeArgs = getGitExcludeArgs();
    const { stdout } = await execAsync(`git status -- . ${excludeArgs}`, { cwd: PROJECT_ROOT });
    resultData = stdout;
  } else if (toolName === "git_changed_files") {
    const excludeArgs = getGitExcludeArgs();
    let diffOut = "";
    try {
      const { stdout } = await execAsync(
        `git diff --name-only HEAD -- . ${excludeArgs}`,
        { cwd: PROJECT_ROOT },
      );
      diffOut = stdout;
    } catch (e) {
      diffOut = "";
    }

    const { stdout: untrackedOut } = await execAsync(
      `git ls-files --others --exclude-standard -- . ${excludeArgs}`,
      { cwd: PROJECT_ROOT },
    );

    const allFiles = new Set([
      ...diffOut
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f),
      ...untrackedOut
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f),
    ]);

    return { data: Array.from(allFiles) };
  } else if (toolName === "get_file_diff") {
    const targetPath = args.path;
    if (!targetPath) throw new Error("Path is required");

    try {
      const { stdout } = await execAsync(
        `git diff HEAD -- "${targetPath}"`,
        { cwd: PROJECT_ROOT },
      );

      if (!stdout || stdout.trim().length === 0) {
        const { stdout: cachedDiff } = await execAsync(
          `git diff --cached -- "${targetPath}"`,
          { cwd: PROJECT_ROOT },
        );
        resultData =
          cachedDiff ||
          "(No diff - File might be unchanged or new/untracked)";
      } else {
        resultData = stdout;
      }
    } catch (e) {
      resultData = "🟢 (New Untracked File) - Entire content is new.";
    }
  } else if (toolName === "list_directory") {
    const targetPath = args.path || ".";
    const files = await listFilesWithTypes(targetPath);
    return { data: files, isStructured: true };
  } else if (toolName === "read_file") {
    const targetPath = args.path;
    if (!targetPath) throw new Error("Path is required");
    const fullPath = path.resolve(PROJECT_ROOT, targetPath);
    if (!fullPath.startsWith(PROJECT_ROOT))
      throw new Error("Access denied");
    resultData = await fs.readFile(fullPath, "utf-8");
  } else {
    throw new Error(`Unknown internal tool: ${toolName}`);
  }

  return { data: resultData, isToolList, isStructured };
}
