import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // 关键：插件中引用资源必须是相对路径
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        sidepanel: "index.html", // 入口文件
      },
    },
  },
});
