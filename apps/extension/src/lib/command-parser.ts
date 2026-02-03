export interface ParsedCommand {
  original: string;
  server: string;
  tool: string;
  args: any;
  isValid: boolean;
  error?: string;
}

/**
 * JS 对象字面量解析器 (修复版)
 * 修复了字符串内包含 mcp: 指令导致重复解析/误解析的 Bug
 */
export function parseCommandsFromText(text: string): ParsedCommand[] {
  const commands: ParsedCommand[] = [];
  const headerRegex = /mcp:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)\s*\(/g;
  
  let match;
  // 注意：我们不依赖 while 的自动步进，而是手动控制 lastIndex
  while ((match = headerRegex.exec(text)) !== null) {
    const [fullHeader, server, tool] = match;
    const startIndex = match.index;
    const argsStartIndex = headerRegex.lastIndex; 
    
    // --- 状态机提取部分 ---
    let balance = 1;
    let i = argsStartIndex;
    let inString = false;
    let stringChar = ''; 
    let isEscaped = false;
    const len = text.length;
    let argsEndIndex = -1;

    while (i < len) {
      const char = text[i];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else {
          if (char === '\\') {
            isEscaped = true;
          } else if (char === stringChar) {
            inString = false;
          }
        }
      } else {
        if (char === '"' || char === '\'' || char === '`') {
          inString = true;
          stringChar = char;
        } 
        else if (char === '(') {
          balance++;
        } 
        else if (char === ')') {
          balance--;
          if (balance === 0) {
            argsEndIndex = i;
            break;
          }
        }
      }
      i++;
    }

    if (argsEndIndex === -1) continue;

    // === 关键修复 ===
    // 告诉正则引擎：“这段内容我已经解析过了，请直接跳到这里之后再开始找下一个”
    headerRegex.lastIndex = argsEndIndex + 1;
    // ===============

    const argsStr = text.substring(argsStartIndex, argsEndIndex).trim();
    const original = text.substring(startIndex, argsEndIndex + 1);

    let args = {};
    let isValid = false;
    let errorMsg = undefined;

    try {
      if (!argsStr) {
        args = {};
      } else {
        // 使用 new Function 解析 JS 对象字面量
        const parseFn = new Function(`return ${argsStr};`);
        args = parseFn();
      }
      isValid = true;
    } catch (e: any) {
      isValid = false;
      errorMsg = e.message;
      console.error('JS Object Parse Failed:', e.message);
    }

    commands.push({
      original,
      server,
      tool,
      args,
      isValid,
      error: errorMsg
    });
  }

  return commands;
}
