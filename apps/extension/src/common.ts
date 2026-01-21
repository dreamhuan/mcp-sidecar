// 从环境变量读取 API 地址，如果未设置则回退到默认值
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8080";
