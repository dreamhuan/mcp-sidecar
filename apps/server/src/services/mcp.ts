import fs from "fs/promises";
import path from "path";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { PROJECT_ROOT, WORKSPACE_ROOT } from "../config";

export const mcpClients = new Map<string, Client>();

// --- 辅助函数 ---
async function loadMcpConfig() {
  try {
    // ✅ 修复：直接使用 WORKSPACE_ROOT 拼接，不再手动算 ../
    const configPath = path.join(WORKSPACE_ROOT, "mcp.config.json");
    const rawData = await fs.readFile(configPath, "utf-8");
    
    // 替换配置文件中的 ${PROJECT_ROOT} 占位符
    const configStr = rawData.replace(/\$\{PROJECT_ROOT\}/g, PROJECT_ROOT);
    return JSON.parse(configStr);
  } catch (error) {
    console.error(`❌ Failed to load mcp.config.json at ${path.join(WORKSPACE_ROOT, "mcp.config.json")}:`, error);
    return {};
  }
}

export const connectMcp = async () => {
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