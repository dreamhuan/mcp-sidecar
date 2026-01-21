import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";

const execAsync = util.promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

// =================配置区域=================
const PORT = 8080;
const PROJECT_ROOT = "/home/fkq/workspace/vibe/chorus";
// =========================================

// 🔥【核心修复】强制切换进程工作目录到目标项目 🔥
// 这样所有的 MCP 工具（包括 FS 和 Git）都会默认在 PROJECT_ROOT 下运行
try {
  if (fs.existsSync(PROJECT_ROOT)) {
    process.chdir(PROJECT_ROOT);
    console.log(`📂 Working directory changed to: ${PROJECT_ROOT}`);
  } else {
    console.error(`❌ Target directory does not exist: ${PROJECT_ROOT}`);
  }
} catch (err) {
  console.error(`❌ Failed to change directory: ${err}`);
}

// 外部 MCP 服务配置
const MCP_SERVERS = {
  fs: {
    command: "npx",
    // 这里的 args 依然需要传 PROJECT_ROOT 作为白名单
    args: ["-y", "@modelcontextprotocol/server-filesystem", PROJECT_ROOT],
  },
};

const mcpClients = new Map<string, Client>();

async function connectMcp() {
  for (const [name, config] of Object.entries(MCP_SERVERS)) {
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
      mcpClients.set(name, client);
      console.log(`✅ [${name}] Connected (Root: ${PROJECT_ROOT})`);
    } catch (e) {
      console.error(`❌ [${name}] Connection failed:`, e);
    }
  }
}

async function handleGitTool(toolName: string, args: any) {
  // 因为我们已经 process.chdir 了，这里其实可以不用传 cwd，但为了保险还是保留
  const options = { cwd: PROJECT_ROOT };
  try {
    switch (toolName) {
      case "diff":
        const { stdout: diffOut } = await execAsync("git diff", options);
        return diffOut || "No changes detected (Clean working tree).";
      case "status":
        const { stdout: statusOut } = await execAsync("git status", options);
        return statusOut;
      default:
        return `Git tool '${toolName}' not implemented.`;
    }
  } catch (error: any) {
    return `Git Error: ${error.message}`;
  }
}

// ==========================================
// 新增：专门用于 UI 自动补全的工具函数
// ==========================================
async function listFilesWithTypes(dirPath: string) {
  try {
    // 确保路径安全，防止跳出根目录 (简单的 .. 检查，生产环境可用更严格的 resolve)
    if (dirPath.includes("..")) throw new Error("Access denied");

    const fullPath = path.resolve(process.cwd(), dirPath);

    // 读取目录内容，withFileTypes: true 让我们可以判断是文件还是文件夹
    const dirents = await fs.promises.readdir(fullPath, {
      withFileTypes: true,
    });

    return dirents.map((dirent) => ({
      name: dirent.name,
      // 告诉前端这是文件夹还是文件
      isDirectory: dirent.isDirectory(),
      // 拼好完整相对路径传回前端
      path: path.join(dirPath, dirent.name),
    }));
  } catch (error) {
    return []; // 如果路径不存在或报错，返回空数组，不让前端炸裂
  }
}

app.post("/api/invoke", async (req, res) => {
  const { serverName, toolName, args } = req.body;
  try {
    let resultData = "";

    // 拦截 UI 的特殊请求：如果是 list_directory，我们返回增强版数据
    // 这样前端就能拿到 isDirectory 字段了
    if (serverName === "fs" && toolName === "list_directory") {
      // 默认列出当前目录
      const targetPath = args.path || ".";
      const files = await listFilesWithTypes(targetPath);
      // 直接返回 JSON 对象，而不是字符串，方便前端处理
      return res.json({ success: true, data: files, isStructured: true });
    }

    if (serverName === "git") {
      resultData = await handleGitTool(toolName, args);
    } else {
      const client = mcpClients.get(serverName);
      if (!client) throw new Error(`Server '${serverName}' not active`);

      const result = await client.callTool({
        name: toolName,
        arguments: args || {},
      });
      // @ts-ignore
      resultData =
        result.content.find((c: any) => c.type === "text")?.text ||
        JSON.stringify(result);
    }
    res.json({ success: true, data: resultData });
  } catch (error: any) {
    // 优化错误日志，方便调试
    console.error(`❌ Error [${serverName}/${toolName}]:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

connectMcp().then(() => {
  app.listen(PORT, () =>
    console.log(`🚀 Sidecar Server running on port ${PORT}`),
  );
});
