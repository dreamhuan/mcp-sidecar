import express from "express";
import cors from "cors";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";

// 1. 加载根目录 .env
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const execAsync = promisify(exec);
const app = express();

app.use(cors());
app.use(express.json());

// --- 配置区域 ---
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const PROJECT_ROOT =
  process.env.PROJECT_ROOT || path.resolve(__dirname, "../../../");

console.log(`🔧 Config: PORT=${PORT}`);
console.log(`🔧 Config: PROJECT_ROOT=${PROJECT_ROOT}`);

const mcpClients = new Map<string, Client>();

// --- 辅助函数 ---

async function loadMcpConfig() {
  try {
    const configPath = path.resolve(__dirname, "../../../mcp.config.json");
    const rawData = await fs.readFile(configPath, "utf-8");
    const configStr = rawData.replace(/\$\{PROJECT_ROOT\}/g, PROJECT_ROOT);
    return JSON.parse(configStr);
  } catch (error) {
    console.error("❌ Failed to load mcp.config.json:", error);
    return {};
  }
}

// Tree 生成逻辑
async function generateTree(
  dir: string,
  currentDepth: number,
  maxDepth: number,
): Promise<string> {
  if (currentDepth >= maxDepth) return "";
  const indent = "  ".repeat(currentDepth);
  const prefix = currentDepth === 0 ? "" : "├── ";

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let result = "";
    const filtered = entries.filter(
      (e) =>
        ![
          "node_modules",
          ".git",
          "dist",
          ".DS_Store",
          "coverage",
          "build",
          ".next",
        ].includes(e.name),
    );
    filtered.sort((a, b) => {
      if (a.isDirectory() === b.isDirectory())
        return a.name.localeCompare(b.name);
      return a.isDirectory() ? -1 : 1;
    });

    for (const entry of filtered) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result += `${indent}${prefix}${entry.name}/\n`;
        result += await generateTree(fullPath, currentDepth + 1, maxDepth);
      } else {
        result += `${indent}${prefix}${entry.name}\n`;
      }
    }
    return result;
  } catch (e) {
    return `${indent}Error reading directory\n`;
  }
}

function parseMcpCommand(command: string) {
  const regex = /^mcp:([^:]+):([^(]+?)(?:\((.*)\))?$/;
  const match = command.trim().match(regex);
  if (!match) throw new Error("Invalid command format");
  const [_, serverName, toolName, argsStr] = match;
  let args = {};
  try {
    if (argsStr && argsStr.trim()) args = JSON.parse(argsStr);
  } catch (e) {
    throw new Error(`Invalid JSON args`);
  }
  return { serverName: serverName.trim(), toolName: toolName.trim(), args };
}

// 文件列表逻辑
async function listFilesWithTypes(dirPath: string) {
  // ✅ 安全性修改：强制使用 resolve 基于 PROJECT_ROOT，防止访问 /etc/passwd 等绝对路径
  const fullPath = path.resolve(PROJECT_ROOT, dirPath);

  // ✅ 安全性修改：增加越界检查
  if (!fullPath.startsWith(PROJECT_ROOT)) {
    throw new Error("Access denied: Cannot access paths outside PROJECT_ROOT");
  }

  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      // 返回给前端的 path 应该是相对路径，方便回填到 Command Input
      path: path.relative(PROJECT_ROOT, path.join(fullPath, entry.name)),
    }));
  } catch (e: any) {
    return [{ name: `Error: ${e.message}`, isDirectory: false, path: "" }];
  }
}

const connectMcp = async () => {
  const mcpServers = await loadMcpConfig();
  for (const [name, config] of Object.entries(mcpServers) as [string, any][]) {
    try {
      let transport;
      if ("transport" in config && config.transport === "http") {
        transport = new StreamableHTTPClientTransport(config.url);
      } else {
        transport = new StdioClientTransport({
          command: config.command!,
          args: config.args || [],
        });
      }
      const client = new Client(
        { name: "mcp-sidecar-server", version: "1.0.0" },
        { capabilities: {} },
      );
      await client.connect(transport);
      mcpClients.set(name, client);
      console.log(`✅ [${name}] Connected`);
    } catch (error: any) {
      console.error(`❌ [${name}] Connection failed: ${error.message}`);
    }
  }
};

// --- API 路由 ---

app.post("/api/invoke", async (req, res) => {
  let { serverName, toolName, args, command } = req.body;

  try {
    // 解析指令
    if (command) {
      const parsed = parseMcpCommand(command);
      serverName = parsed.serverName;
      toolName = parsed.toolName;
      args = parsed.args;
    }

    let resultData: any = "";
    let isToolList = false; // 标记是否为工具列表结果

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
    ];

    // 🔥 处理 Internal Server
    if (serverName === "internal") {
      if (toolName === "list") {
        const targetServer = args?.server;
        const allTools = [];

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
              return res
                .status(404)
                .json({ success: false, error: "Server not found" });
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

        // 直接返回列表数据，标记为 isToolList
        return res.json({ success: true, data: allTools, isToolList: true });
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
      } else if (toolName === "list_directory") {
        const targetPath = args.path || ".";
        const files = await listFilesWithTypes(targetPath);
        return res.json({ success: true, data: files, isStructured: true });
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
    }
    // 处理普通 MCP Clients
    else {
      const client = mcpClients.get(serverName);
      if (!client) throw new Error(`Server '${serverName}' not active`);

      if (serverName === "fs" && args && typeof args.path === "string") {
        if (!path.isAbsolute(args.path)) {
          args.path = path.join(PROJECT_ROOT, args.path);
        }
      }

      const result = await client.callTool({
        name: toolName,
        arguments: args || {},
      });
      // @ts-ignore
      resultData =
        (result.content as any[]).find((c) => c.type === "text")?.text ||
        JSON.stringify(result);
    }

    res.json({ success: true, data: resultData });
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Sidecar Server running on port ${PORT}`);
  await connectMcp();
});
