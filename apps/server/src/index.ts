import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs/promises";
// 引入 config 模块时会自动加载 .env
import { PORT, PROJECT_ROOT } from "./config";
import { parseMcpCommand } from "./utils/command";
import { connectMcp, mcpClients } from "./services/mcp";
import { handleInternalTool } from "./services/internal";

const app = express();

app.use(cors());
app.use(express.json());

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
    let isToolList = false;
    let isStructured = false;

    // 🔥 处理 Internal Server
    if (serverName === "internal") {
      const result = await handleInternalTool(toolName, args);
      resultData = result.data;
      isToolList = result.isToolList || false;
      isStructured = result.isStructured || false;

      // 如果是工具列表或结构化数据，直接返回 JSON 对象
      if (isToolList || isStructured) {
         return res.json({ success: true, data: resultData, isToolList, isStructured });
      }
      // 否则作为通用数据返回 (字符串或 JSON)
    }
    // 处理普通 MCP Clients
    else {
      const client = mcpClients.get(serverName);
      if (!client) throw new Error(`Server '${serverName}' not active`);

      // 1. 拦截 FS 操作：路径补全 & 自动创建目录
      if (serverName === "fs" && args && typeof args.path === "string") {
        if (!path.isAbsolute(args.path)) {
          args.path = path.join(PROJECT_ROOT, args.path);
        }
        // 自动创建父目录 (mkdir -p)
        if (toolName === "write_file") {
          const parentDir = path.dirname(args.path);
          try {
            await fs.mkdir(parentDir, { recursive: true });
          } catch (e: any) {
            // 仅警告，继续尝试写入，让 fs server 报出具体的权限错误
            console.warn(
              `⚠️ Warning: Failed to pre-create directory: ${e.message}`,
            );
          }
        }
      }

      // 2. 调用 MCP 工具
      const result = await client.callTool({
        name: toolName,
        arguments: args || {},
      });
      console.log("=====mcp call", serverName, toolName, "\n", result);

      // 🔥🔥🔥 核心修复：检查 MCP 协议层面的错误标记 🔥🔥🔥
      if (result.isError) {
        // 提取错误信息
        const errorContent = (result.content as any[]) || [];
        const errorMessage = errorContent
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");

        // 主动抛出异常，触发外层 catch，从而返回 500 给前端
        throw new Error(errorMessage || "Unknown MCP Tool Error");
      }

      // 3. 处理成功结果
      const content = (result.content as any[]) || [];

      // 1. 过滤出所有 type 为 'text' 的项
      const textBlocks = content
        .filter((c) => c.type === "text")
        .map((c) => c.text);

      // 2. 如果有文本内容，用换行符连接它们
      if (textBlocks.length > 0) {
        resultData = textBlocks.join("\n\n");
      } else {
        // 3. 如果没有文本（比如是图片或二进制），或者由其他格式组成，兜底显示 JSON
        resultData = JSON.stringify(result, null, 2);
      }
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