export interface ParsedCommand {
  original: string;
  server: string;
  tool: string;
  args: any;
  isValid: boolean;
}

/**
 * 改进后的 JSON 解析器
 * 相比旧版粗暴的 replaceAll("'", '"')，这里更谨慎，尽量只修复 Key 的格式
 */
const safeJsonParse = (str: string) => {
  if (!str || !str.trim()) return {};
  try {
    return JSON.parse(str);
  } catch (e) {
    try {
      // 容错策略：
      // 1. 尝试给没有引号的 Key 加上双引号 (例如 { path: "..." } -> { "path": "..." })
      // 2. 将单引号包裹的 Key/Value 转换为双引号，但尽量避开内容内部的单引号（这是一个复杂问题，这里做基础处理）
      // 注意：对于极其复杂的格式错误的 JSON，最好的办法还是提示用户修正，而不是过度猜测
      const fixed = str.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
      return JSON.parse(fixed);
    } catch (e2) {
      return null;
    }
  }
};

/**
 * 核心解析函数 (状态机版本)
 * 能够处理嵌套括号、忽略注释和字符串中的关键字
 */
export function parseCommandsFromText(text: string): ParsedCommand[] {
  const commands: ParsedCommand[] = [];
  const len = text.length;
  let i = 0;

  // 辅助函数：跳过空白
  const skipWhitespace = () => {
    while (i < len && /\s/.test(text[i])) i++;
  };

  // 辅助函数：提取平衡括号内的内容
  // 假设当前 i 指向的是 '(' 之后的一个字符
  const extractBalancedArgs = (): string | null => {
    let startContent = i;
    let balance = 1;
    let inString = false;
    let stringChar = ""; // 记录是 ' 还是 " 或 `
    let isEscaped = false;

    while (i < len) {
      const char = text[i];

      if (inString) {
        // --- 字符串内部状态 ---
        if (isEscaped) {
          isEscaped = false;
        } else {
          if (char === "\\") {
            isEscaped = true;
          } else if (char === stringChar) {
            inString = false;
          }
        }
      } else {
        // --- 普通代码状态 ---
        if (char === '"' || char === "'" || char === "`") {
          inString = true;
          stringChar = char;
        } else if (char === "(") {
          balance++;
        } else if (char === ")") {
          balance--;
          if (balance === 0) {
            // 找到结束位置
            return text.substring(startContent, i);
          }
        }
      }
      i++;
    }
    return null; // 未闭合
  };

  // --- 主循环：字符扫描 ---
  while (i < len) {
    const char = text[i];

    // 1. 处理字符串字面量 (跳过字符串内容，防止里面的 mcp: 被误判)
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      i++; // 跳过起始引号
      let isEscaped = false;
      while (i < len) {
        if (isEscaped) {
          isEscaped = false;
        } else {
          if (text[i] === "\\") isEscaped = true;
          else if (text[i] === quote) break;
        }
        i++;
      }
      i++; // 跳过结束引号
      continue;
    }

    // 2. 处理注释 (跳过注释内容)
    if (char === "/") {
      if (i + 1 < len && text[i + 1] === "/") {
        // 单行注释 //...
        i += 2;
        while (i < len && text[i] !== "\n") i++;
        continue;
      } else if (i + 1 < len && text[i + 1] === "*") {
        // 多行注释 /*...*/
        i += 2;
        while (i < len) {
          if (text[i] === "*" && i + 1 < len && text[i + 1] === "/") {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }
    }

    // 3. 检测指令头 mcp:
    // 简单的向前预读，确保以 "mcp:" 开头
    if (char === "m" && text.substring(i, i + 4) === "mcp:") {
      const startIdx = i;
      i += 4; // 跳过 'mcp:'

      // 提取 server (直到遇上 : )
      let server = "";
      while (
        i < len &&
        text[i] !== ":" &&
        text[i] !== "(" &&
        !/\s/.test(text[i])
      ) {
        server += text[i];
        i++;
      }

      if (text[i] !== ":") {
        // 格式不符合 mcp:s:t，可能是 mcp:s 就结束了或者其他文本，跳过
        continue;
      }
      i++; // 跳过中间的 :

      // 提取 tool (直到遇上 ( 或空白)
      let tool = "";
      while (i < len && text[i] !== "(" && !/\s/.test(text[i])) {
        tool += text[i];
        i++;
      }

      // 如果 server 或 tool 为空，视为无效匹配
      if (!server || !tool) continue;

      // 检查是否有参数
      skipWhitespace();
      let argsStr = "";
      let args = {};
      let isValid = true;
      let endIndex = i;

      if (i < len && text[i] === "(") {
        i++; // 消耗 '('
        const extracted = extractBalancedArgs();
        if (extracted !== null) {
          argsStr = extracted;
          endIndex = i + 1; // i 现在在 ')' 上，endIndex 包含这个 ')'
          i++; // 移动到 ')' 之后，方便主循环继续
        } else {
          // 括号未闭合
          isValid = false;
          endIndex = len;
        }
      }

      // 解析参数
      if (isValid && argsStr && argsStr.trim()) {
        const parsed = safeJsonParse(argsStr);
        if (parsed) {
          args = parsed;
        } else {
          isValid = false;
        }
      }

      commands.push({
        original: text.substring(startIdx, endIndex),
        server,
        tool,
        args,
        isValid,
      });

      continue; // 继续下一次循环
    }

    // 如果什么都不是，继续下一个字符
    i++;
  }

  return commands;
}
