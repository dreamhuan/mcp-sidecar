import express from "express";
import cors from "cors";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const app = express();

app.use(cors());
app.use(express.json());

// --- 配置区域 ---
const PROJECT_ROOT = "/home/fkq/workspace/vibe/chorus";

const MCP_SERVERS: Record<string, any> = {
  fs: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", PROJECT_ROOT],
  },
  filesystem: {
    command: "npx",
    args: [
      "-y",
      "@modelcontextprotocol/server-filesystem",
      "/home/fkq/workspace/vibe/chorus/apps/web",
    ],
  },
  "vibeus-ds": {
    transport: "http",
    url: "http://192.168.51.31:3333/mcp",
  },
};

const mcpClients = new Map<string, Client>();

// --- 辅助函数 ---

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
  for (const [name, config] of Object.entries(MCP_SERVERS)) {
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
        { capabilities: { prompts: {}, resources: {}, tools: {} } },
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
    // 🔥 新增：处理 mcp:list 指令
    if (command && command.trim() === "mcp:list") {
      const allTools = [];

      // 1. 获取所有连接的 MCP Client 工具
      for (const [sName, client] of mcpClients.entries()) {
        try {
          const result = await client.listTools();
          const tools = result.tools.map((t) => ({
            server: sName,
            name: t.name,
            // 🟢 修改点：移除 description 的截断逻辑，如果有换行符也替换为空格，保持一行
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

      // 2. 添加内置 Git 工具
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

    // 常规指令解析
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

      // 针对 fs 服务，将相对路径转为绝对路径
      if (serverName === "fs" && args && typeof args.path === "string") {
        // 如果不是绝对路径，则拼接 PROJECT_ROOT
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

      // 提取文本内容
      // @ts-ignore
      resultData =
        result.content.find((c: any) => c.type === "text")?.text ||
        JSON.stringify(result);
    }

    res.json({ success: true, data: resultData });
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = 8080;
app.listen(PORT, async () => {
  console.log(`🚀 Sidecar Server running on port ${PORT}`);
  await connectMcp();
});
