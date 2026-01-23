import path from "path";
import fs from "fs/promises";
import { PROJECT_ROOT } from "../config";
import { execAsync } from "../utils/exec";
import { generateTree, listFilesWithTypes } from "../utils/fs";
import { mcpClients } from "./mcp";

// 🔥 定义内部工具集
const internalTools = [
  {
    name: "list",
    description: "List available tools. Args: server (string, optional)",
    inputSchema: {
      type: "object",
      properties: {
        server: {
          type: "string",
          description: "Filter tools by server name (e.g. 'git', 'fs')",
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
    name: "git_diff",
    description: "Show uncommitted changes (git diff)",
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
    const allTools: any[] = [];

    // 🔥 修改：始终返回 description，只根据 detailed 决定是否返回 inputSchema
    const formatTool = (t: any, sName: string, detailed: boolean) => ({
      server: sName,
      name: t.name,
      description: t.description || "", // ✅ 移到外面，始终可见
      ...(detailed
        ? { inputSchema: t.inputSchema } // 只有 Schema 是按需加载的
        : {}),
    });

    if (targetServer) {
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
    } else {
      // 列出摘要
      for (const [sName, client] of mcpClients.entries()) {
        try {
          const result = await client.listTools();
          allTools.push(
            ...result.tools.map((t) => formatTool(t, sName, false)),
          );
        } catch (e) {
          allTools.push({ server: sName, name: `Error: ${e}` });
        }
      }
      allTools.push(
        ...internalTools.map((t) => formatTool(t, "internal", false)),
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
  } else if (toolName === "git_diff") {
    const { stdout } = await execAsync("git diff", { cwd: PROJECT_ROOT });
    resultData = stdout || "No changes detected.";
  } else if (toolName === "git_status") {
    const { stdout } = await execAsync("git status", { cwd: PROJECT_ROOT });
    resultData = stdout;
  } else if (toolName === "git_changed_files") {
    // 1. 获取已追踪文件的变更 (修改 + 暂存 + 删除)
    const { stdout: diffOut } = await execAsync(
      "git diff --name-only HEAD",
      { cwd: PROJECT_ROOT },
    );

    // 2. 获取未追踪文件 (Untracked / New files)，排除 .gitignore
    const { stdout: untrackedOut } = await execAsync(
      "git ls-files --others --exclude-standard",
      { cwd: PROJECT_ROOT },
    );

    // 3. 合并并去重
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

    // 返回数组
    return { data: Array.from(allFiles) };
  }
  // 🔥 新增：获取单个文件的 Diff
  else if (toolName === "get_file_diff") {
    const targetPath = args.path;
    if (!targetPath) throw new Error("Path is required");

    try {
      // 尝试获取 Diff
      const { stdout } = await execAsync(
        `git diff HEAD -- "${targetPath}"`,
        {
          cwd: PROJECT_ROOT,
        },
      );

      if (!stdout || stdout.trim().length === 0) {
        // 可能是 Staged 新文件
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
      // 🔥 捕获错误：通常是 Untracked 文件会导致 git diff HEAD 报错
      // 我们直接标记为新文件
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