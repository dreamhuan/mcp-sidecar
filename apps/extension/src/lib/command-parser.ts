import * as acorn from "acorn";

export interface ParsedCommand {
  original: string;
  server: string;
  tool: string;
  args: any;
  isValid: boolean;
}

/**
 * 将 Acorn AST 节点转换为纯 JavaScript 对象
 */
function astToValue(node: any): any {
  if (!node) return null;

  switch (node.type) {
    case "Literal":
      return node.value;
    case "ObjectExpression":
      const obj: any = {};
      for (const prop of node.properties) {
        // 支持 key: val (Identifier) 和 "key": val (Literal)
        const key =
          prop.key.type === "Identifier" ? prop.key.name : prop.key.value;
        obj[key] = astToValue(prop.value);
      }
      return obj;
    case "ArrayExpression":
      return node.elements.map(astToValue);
    case "UnaryExpression":
      // 处理负数参数
      if (node.operator === "-" && node.argument.type === "Literal") {
        return -node.argument.value;
      }
      return undefined;
    case "TemplateLiteral":
      // 支持简单的模板字符串参数
      return node.quasis.map((q: any) => q.value.raw).join("");
    default:
      return undefined;
  }
}

/**
 * 检查当前位置是否是 mcp:server:tool 格式的头部
 * 返回匹配信息或 null
 */
function matchMcpHeader(text: string, index: number) {
  // 快速预检
  if (text[index] !== "m" || !text.startsWith("mcp:", index)) return null;

  // 提取头部，例如 mcp:server:tool
  // 正则仅用于提取名称，不负责查找位置
  const substr = text.slice(index);
  const match = substr.match(/^mcp:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)/);

  if (match) {
    return {
      full: match[0],
      server: match[1],
      tool: match[2],
      length: match[0].length,
    };
  }
  return null;
}

export function parseCommandsFromText(text: string): ParsedCommand[] {
  const commands: ParsedCommand[] = [];
  const len = text.length;
  let i = 0;

  // --- 主循环：逐字扫描，跳过注释和常规字符串 ---
  while (i < len) {
    const char = text[i];
    const next = text[i + 1] || "";

    // 1. 🛡️ 跳过单行注释 // ... \n
    if (char === "/" && next === "/") {
      i += 2;
      while (i < len && text[i] !== "\n") i++;
      continue;
    }

    // 2. 🛡️ 跳过多行注释 /* ... */
    if (char === "/" && next === "*") {
      i += 2;
      while (i < len - 1) {
        if (text[i] === "*" && text[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    // 3. 🛡️ 跳过普通字符串 "..." 或 '...'
    // ⚠️ 注意：这里故意【不跳过】反引号 (`)
    // 因为 AI 通常会在 Markdown 代码块 (```js ... ```) 中输出命令。
    // 如果我们跳过反引号区域，就会导致代码块内的有效命令被忽略。
    // 只跳过 " 和 ' 足以防止大部分误判 (如 const x = "mcp:...").
    if (char === '"' || char === "'") {
      const quote = char;
      i++;
      while (i < len) {
        if (text[i] === "\\" && i + 1 < len) {
          i += 2; // 跳过转义字符
          continue;
        }
        if (text[i] === quote) {
          i++; // 闭合
          break;
        }
        i++;
      }
      continue;
    }

    // 4. 🎯 检测 MCP 命令
    // 只有到了这里，才说明我们不在注释里，也不在普通字符串里
    if (char === "m") {
      const header = matchMcpHeader(text, i);

      if (header) {
        const startIndex = i;
        // 寻找紧随其后的左括号 '('
        let current = i + header.length;
        let parenIndex = -1;

        // 允许头部和参数之间有空白
        for (let j = current; j < len; j++) {
          const c = text[j];
          if (c === "(") {
            parenIndex = j;
            break;
          }
          if (!/\s/.test(c)) break; // 遇到非空白且非(，说明无参数
        }

        let args = {};
        let isValid = true;
        let endIndex = startIndex + header.length;

        if (parenIndex !== -1) {
          try {
            // ✨ Acorn 接管：解析参数表达式
            // 从 '(' 位置开始解析
            const ast = acorn.parseExpressionAt(text, parenIndex, {
              ecmaVersion: 2020,
            });
            args = astToValue(ast);
            endIndex = (ast as any).end;
          } catch (e) {
            // 解析失败，可能是 AI 没写完，或者格式错误
            console.warn("Parsing error:", e);
            isValid = false;
            // 错误回退：尽量取到行尾作为展示
            const nextLine = text.indexOf("\n", startIndex);
            endIndex = nextLine === -1 ? len : nextLine;
          }
        }

        commands.push({
          original: text.substring(startIndex, endIndex),
          server: header.server,
          tool: header.tool,
          args,
          isValid,
        });

        // 关键：移动指针到命令结束处，继续扫描后续内容
        i = endIndex;
        continue;
      }
    }

    i++;
  }

  return commands;
}
