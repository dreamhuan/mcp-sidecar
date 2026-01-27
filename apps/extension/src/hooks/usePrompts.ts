import { useState, useEffect } from "react";
import { PromptTemplate } from "../types";
import { SYSTEM_PROMPTS } from "../data/config";

export function usePrompts() {
  // 🔥 核心修复：使用惰性初始化 (Lazy Initialization)
  const [prompts, setPrompts] = useState<PromptTemplate[]>(() => {
    try {
      const saved = localStorage.getItem("mcp-prompts");
      let userPrompts: PromptTemplate[] = [];

      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const systemIds = new Set(SYSTEM_PROMPTS.map((p) => p.id));
          userPrompts = parsed.filter((p) => !systemIds.has(p.id));
        }
      }
      return [...SYSTEM_PROMPTS, ...userPrompts];
    } catch (e) {
      console.error("Failed to parse saved prompts", e);
      return SYSTEM_PROMPTS;
    }
  });

  useEffect(() => {
    if (prompts.length > 0) {
      localStorage.setItem("mcp-prompts", JSON.stringify(prompts));
    }
  }, [prompts]);

  return { prompts, setPrompts };
}
