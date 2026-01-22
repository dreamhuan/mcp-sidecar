export interface ParsedCommand {
  original: string;
  server: string;
  tool: string;
  args: any;
  isValid: boolean;
}

// 简单的 JSON 解析容错处理
const safeJsonParse = (str: string) => {
  try {
    // 尝试直接解析
    return JSON.parse(str);
  } catch (e) {
    try {
      // 尝试修复常见错误（例如 AI 有时会把 key 的引号漏掉，或者用单引号）
      // 注意：这里只是简单处理，生产环境可能需要更强的 JSON 修复库
      // 这里的逻辑主要处理简单的单引号替换
      const fixed = str
        .replace(/'/g, '"')
        .replace(/([a-zA-Z0-9_]+):/g, '"$1":');
      return JSON.parse(fixed);
    } catch (e2) {
      return null;
    }
  }
};

export function parseCommandsFromText(text: string): ParsedCommand[] {
  const commands: ParsedCommand[] = [];

  // 正则逻辑：
  // 1. 匹配 mcp:server:tool
  // 2. 可选匹配 (...参数...)
  // 3. 全局匹配 (g)，多行 (m)
  const regex = /mcp:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)(?:\(([\s\S]*?)\))?/gm;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const [original, server, tool, argsStr] = match;
    let args = {};
    let isValid = true;

    if (argsStr && argsStr.trim()) {
      const parsed = safeJsonParse(argsStr);
      if (parsed) {
        args = parsed;
      } else {
        isValid = false; // 参数 JSON 格式错误
      }
    }

    commands.push({
      original,
      server,
      tool,
      args,
      isValid,
    });
  }

  return commands;
}
