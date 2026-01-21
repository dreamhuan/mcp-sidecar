import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// 定义配置接口
interface McpConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

const app = express();
app.use(cors());
app.use(express.json());

const PROJ = "/home/fkq/workspace/vibe/chorus";

// === 配置 MCP 工具 (修改为你本地的实际路径) ===
const SERVERS: Record<string, McpConfig> = {
  // === 修正：使用官方 Python 版 Git Server ===
  git: {
    // 方式 A: 如果你安装了 uv (推荐，速度快)
    command: "uvx",
    args: ["mcp-server-git", "--repository", PROJ],

    // 方式 B: 如果你只有标准的 python/pip
    // 这一步前提是你已经在终端运行过: pip install mcp-server-git
    // command: "python", // 或者 "python3"
    // args: ["-m", "mcp_server_git", "--repository", "/home/fkq/workspace/vibe"],
  },

  // === 保持不变：Node 版 Filesystem Server ===
  fs: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", PROJ],
  },
};

const clients = new Map<string, Client>();

async function connectMcp() {
  for (const [name, config] of Object.entries(SERVERS)) {
    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env },
      });

      const client = new Client(
        { name: "SidecarHost", version: "1.0" },
        { capabilities: {} },
      );
      await client.connect(transport);
      clients.set(name, client);
      console.log(`✅ [${name}] Connected`);
    } catch (e) {
      console.error(`❌ [${name}] Failed to connect:`, e);
    }
  }
}

// === 通用调用接口 ===
app.post("/api/invoke", async (req, res) => {
  const { serverName, toolName, args } = req.body;

  const client = clients.get(serverName);
  if (!client) {
    res.status(404).json({ error: `Server '${serverName}' not active` });
    return;
  }

  try {
    const result = await client.callTool({
      name: toolName,
      arguments: args || {},
    });

    // 简化返回结构，提取文本内容
    // @ts-ignore - SDK 类型可能有变动，视实际返回而定
    const textContent =
      result.content.find((c: any) => c.type === "text")?.text ||
      JSON.stringify(result);

    res.json({ success: true, data: textContent });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

connectMcp().then(() => {
  app.listen(8080, () => console.log("🚀 Server running on port 8080"));
});
