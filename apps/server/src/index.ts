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

// 1. 加载根目录 .env (假设 server 在 apps/server，.env 在根目录，即 ../../.env)
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const execAsync = promisify(exec);
const app = express();

app.use(cors());
app.use(express.json());

// --- 配置区域 (从环境变量读取) ---
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const PROJECT_ROOT =
  process.env.PROJECT_ROOT || path.resolve(__dirname, "../../../");

console.log(`🔧 Config: PORT=${PORT}`);
console.log(`🔧 Config: PROJECT_ROOT=${PROJECT_ROOT}`);

const mcpClients = new Map<string, Client>();

// --- 辅助函数 ---

// 🔥 新增：加载并解析 mcp.config.json
async function loadMcpConfig() {
  try {
    const configPath = path.resolve(__dirname, "../../../mcp.config.json");
    const rawData = await fs.readFile(configPath, "utf-8");

    // 简单的变量替换：将配置文件中的 ${PROJECT_ROOT} 替换为实际环境变量
    const configStr = rawData.replace(/\$\{PROJECT_ROOT\}/g, PROJECT_ROOT);

    return JSON.parse(configStr);
  } catch (error) {
    console.error("❌ Failed to load mcp.config.json:", error);
    return {}; // 返回空对象防止崩溃
  }
}

function parseMcpCommand(command: string) {
  const regex = /^mcp:([^:]+):([^(]+)\((.*)\)$/;
  const match = command.trim().match(regex);

  if (!match) {
    throw new Error(
      "Invalid command format. Expected: mcp:server:tool(json_args)",
    );
  }

  const [_, serverName, toolName, argsStr] = match;

  let args = {};
  try {
    args = argsStr.trim() ? JSON.parse(argsStr) : {};
  } catch (e) {
    throw new Error(`Invalid JSON arguments: ${argsStr}`);
  }

  return { serverName, toolName, args };
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
  // 🔥 动态加载配置
  const mcpServers = await loadMcpConfig();

  for (const [name, config] of Object.entries(mcpServers) as [string, any][]) {
    try {
      let transport;
      if ("transport" in config && config.transport === "http") {
        console.log(`🔌 [${name}] Connecting via HTTP to ${config.url}...`);
        transport = new StreamableHTTPClientTransport(config.url);
      } else {
        console.log(
          `🔌 [${name}] Spawning process: ${config.command} ${(config.args || []).join(" ")}`,
        );
        transport = new StdioClientTransport({
          command: config.command!,
          args: config.args || [],
        });
      }

      const client = new Client(
        { name: "mcp-sidecar-server", version: "1.0.0" },
        {
          // 🔥 修复点：Client 不应该声明 prompts/resources/tools
          // 如果不需要特殊能力（如 sampling 或 roots），留空即可
          capabilities: {},
        },
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
    if (command && command.trim() === "mcp:list") {
      const allTools = [];

      for (const [sName, client] of mcpClients.entries()) {
        try {
          const result = await client.listTools();
          const tools = result.tools.map((t) => ({
            server: sName,
            name: t.name,
            description: (t.description || "(No description)").replace(
              /\n/g,
              " ",
            ),
            inputSchema: t.inputSchema,
          }));
          allTools.push(...tools);
        } catch (e) {
          console.error(`Failed to list tools for ${sName}`, e);
        }
      }

      allTools.push(
        {
          server: "git",
          name: "diff",
          description: "Show changes between commits",
          inputSchema: {},
        },
        {
          server: "git",
          name: "status",
          description: "Show the working tree status",
          inputSchema: {},
        },
      );

      return res.json({ success: true, data: allTools, isToolList: true });
    }

    if (command) {
      const parsed = parseMcpCommand(command);
      serverName = parsed.serverName;
      toolName = parsed.toolName;
      args = parsed.args;
      console.log(`[Command] Parsed: ${serverName} -> ${toolName}`, args);
    }

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
          const originalPath = args.path;
          args.path = path.join(PROJECT_ROOT, originalPath);
          console.log(
            `[Path Fix] Resolved '${originalPath}' -> '${args.path}'`,
          );
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
