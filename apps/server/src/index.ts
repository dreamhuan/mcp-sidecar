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

// 解析命令，支持无参数时不加括号
// 匹配模式：mcp:server:tool 后面可选 (args)
function parseMcpCommand(command: string) {
  const regex = /^mcp:([^:]+):([^(]+?)(?:\((.*)\))?$/;
  const match = command.trim().match(regex);

  if (!match) {
    throw new Error(
      "Invalid command format. Expected: mcp:server:tool or mcp:server:tool(json_args)",
    );
  }

  const [_, serverName, toolName, argsStr] = match;

  let args = {};
  try {
    if (argsStr && argsStr.trim()) {
      args = JSON.parse(argsStr);
    }
  } catch (e) {
    throw new Error(`Invalid JSON arguments: ${argsStr}`);
  }

  return {
    serverName: serverName.trim(),
    toolName: toolName.trim(),
    args,
  };
}

async function listFilesWithTypes(dirPath: string) {
  const fullPath = path.isAbsolute(dirPath)
    ? dirPath
    : path.join(PROJECT_ROOT, dirPath);
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      path: path.join(dirPath, entry.name),
    }));
  } catch (e: any) {
    return [{ name: `Error: ${e.message}`, isDirectory: false, path: "" }];
  }
}

async function handleGitTool(toolName: string, args: any) {
  if (toolName === "diff") {
    const { stdout } = await execAsync("git diff", { cwd: PROJECT_ROOT });
    return stdout || "No changes detected.";
  }
  if (toolName === "status") {
    const { stdout } = await execAsync("git status", { cwd: PROJECT_ROOT });
    return stdout;
  }
  return "Unknown git tool";
}

const connectMcp = async () => {
  const mcpServers = await loadMcpConfig();

  for (const [name, config] of Object.entries(mcpServers) as [string, any][]) {
    try {
      let transport;
      if ("transport" in config && config.transport === "http") {
        console.log(`🔌 [${name}] Connecting via HTTP to ${config.url}...`);
        transport = new StreamableHTTPClientTransport(config.url);
      } else {
        console.log(
          `🔌 [${name}] Spawning: ${config.command} ${(config.args || []).join(" ")}`,
        );
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
    // 🔥 场景 1: mcp:list (及 mcp:list:xxx)
    if (command && command.trim().startsWith("mcp:list")) {
      const parts = command.trim().split(":");
      const targetServer = parts[2]; // mcp:list:git -> git

      const allTools = [];
      const gitTools = [
        { name: "diff", description: "Show changes", inputSchema: {} },
        { name: "status", description: "Show status", inputSchema: {} },
      ];

      // 🔥 格式化器优化：摘要模式下完全移除 description
      const formatTool = (t: any, sName: string, detailed: boolean) => ({
        server: sName,
        name: t.name,
        // 仅在详细模式下返回 description 和 inputSchema
        ...(detailed
          ? {
              description: t.description || "",
              inputSchema: t.inputSchema,
            }
          : {}),
      });

      if (targetServer) {
        // --- 详情模式 (Specific Server) ---
        if (targetServer === "git") {
          allTools.push(...gitTools.map((t) => formatTool(t, "git", true)));
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
        // --- 摘要模式 (All Servers, Names Only) ---
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
        allTools.push(...gitTools.map((t) => formatTool(t, "git", false)));
      }

      return res.json({ success: true, data: allTools, isToolList: true });
    }

    // 🔥 场景 2: 通用执行
    if (command) {
      const parsed = parseMcpCommand(command);
      serverName = parsed.serverName;
      toolName = parsed.toolName;
      args = parsed.args;
      console.log(`[Command] Parsed: ${serverName}:${toolName}`, args);
    }

    // --- 执行逻辑 ---
    let resultData: any = "";

    if (serverName === "fs" && toolName === "list_directory") {
      const targetPath = args.path || ".";
      const files = await listFilesWithTypes(targetPath);
      return res.json({ success: true, data: files, isStructured: true });
    }

    if (serverName === "git") {
      resultData = await handleGitTool(toolName, args);
    } else {
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
