import fs from "fs/promises";
import path from "path";
import { PROJECT_ROOT } from "../config";

// Tree 生成逻辑
export async function generateTree(
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

// 文件列表逻辑
export async function listFilesWithTypes(dirPath: string) {
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