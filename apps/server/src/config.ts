import path from "path";
import dotenv from "dotenv";

// 计算单仓库根目录 (从 src/config.ts 往上找 3 层: src -> server -> apps -> root)
export const WORKSPACE_ROOT = path.resolve(__dirname, "../../../");

// 1. 从根目录加载 .env
dotenv.config({ path: path.join(WORKSPACE_ROOT, ".env") });

// --- 配置区域 ---
export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

// PROJECT_ROOT 指向要操作的目标项目，如果没有指定环境变量，默认就是当前 Workspace 根目录
export const PROJECT_ROOT =
  process.env.PROJECT_ROOT || WORKSPACE_ROOT;

// 解析自定义忽略列表 (逗号分隔)
export const GIT_IGNORE_LIST = (process.env.GIT_IGNORE_FILE || "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`🔧 Config: WORKSPACE_ROOT=${WORKSPACE_ROOT}`);
console.log(`🔧 Config: PROJECT_ROOT=${PROJECT_ROOT}`);
console.log(`🔧 Config: GIT_IGNORE_LIST=${JSON.stringify(GIT_IGNORE_LIST)}`);