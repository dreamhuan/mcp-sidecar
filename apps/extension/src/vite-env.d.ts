/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// 🔥 新增：支持 .md?raw 导入
declare module "*.md?raw" {
  const content: string;
  export default content;
}