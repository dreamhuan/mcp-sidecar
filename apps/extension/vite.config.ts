import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

export default defineConfig(({ mode }) => {
  // 1. 加载根目录的环境变量 (.env 在 ../../)
  const envDir = path.resolve(__dirname, "../../");
  const env = loadEnv(mode, envDir, "");

  // 获取端口，默认为 8080
  const PORT = env.PORT || "8080";

  return {
    plugins: [
      react(),
      tailwindcss(),
      // 🔥 自定义插件：动态生成 manifest.json
      {
        name: "make-manifest",
        generateBundle() {
          // 读取移动后的模板文件
          const manifestPath = path.resolve(__dirname, "manifest.json");
          if (!fs.existsSync(manifestPath)) {
            throw new Error("❌ manifest.json not found in extension root!");
          }

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

          // 🎯 动态替换端口
          manifest.host_permissions = manifest.host_permissions.map(
            (perm: string) => {
              if (perm.includes("localhost")) {
                return `http://localhost:${PORT}/*`;
              }
              return perm;
            },
          );

          // 输出到 dist 目录
          this.emitFile({
            type: "asset",
            fileName: "manifest.json",
            source: JSON.stringify(manifest, null, 2),
          });

          console.log(`📦 Generated manifest.json with port ${PORT}`);
        },
      },
    ],
    envDir, // 让 Vite 代码也能识别 import.meta.env
    base: "./",
    build: {
      outDir: "dist",
      rollupOptions: {
        input: {
          sidepanel: "index.html",
        },
      },
    },
  };
});
