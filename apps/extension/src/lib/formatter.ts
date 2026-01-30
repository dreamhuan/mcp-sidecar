import { getLanguageFromPath } from "../data/config";

// 格式化 MCP 工具列表
export function formatToolList(data: any[]): string {
  const grouped: Record<string, any[]> = {};
  data.forEach((t: any) => {
    if (!grouped[t.server]) grouped[t.server] = [];
    grouped[t.server].push(t);
  });

  const lines: string[] = [];
  const isDetailed = data.length > 0 && typeof data[0] === 'object' && "inputSchema" in data[0];

  lines.push(
    isDetailed
      ? "📦 MCP TOOLS DETAILS (Full Schema)\n"
      : "📦 MCP TOOLS SUMMARY (Names Only)\n",
  );
  if (!isDetailed)
    lines.push("Tip: Click suggested commands above to see details.\n");

  for (const [server, tools] of Object.entries(grouped)) {
    lines.push(`SERVER: ${server}`);
    tools.forEach((t: any) => {
      lines.push(`  ├─ 🛠️  ${t.name}`);
      if (t.description)
        lines.push(`  │    Desc: ${t.description.replace(/\n/g, " ")}`);

      if (t.inputSchema) {
        const props = t.inputSchema?.properties || {};
        const propKeys = Object.keys(props);
        const required = new Set(t.inputSchema?.required || []);

        if (propKeys.length > 0) {
          lines.push(`  │    Args:`);
          propKeys.forEach((key) => {
            const prop = props[key];
            let argStr = `  │      └─ ${key}`;
            if (required.has(key)) argStr += "*";
            if (prop.type) argStr += ` (${prop.type})`;
            if (prop.description) argStr += `: ${prop.description}`;
            lines.push(argStr);
          });
        }
      }
      lines.push(`  │`);
    });
    lines.push("");
  }
  return lines.join("\n");
}

// 格式化单一命令执行结果
export function formatCommandResult(
  toolName: string,
  args: any,
  data: any,
): string {
  let contentStr = "";

  // 🔥 修复 1：优先处理简单的 Server 列表 (字符串数组)
  // 防止进入后续逻辑导致 'in' operator 报错
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
     return "📦 AVAILABLE SERVERS\n" + data.map((s: string) => `- mcp:${s}`).join("\n");
  }

  // 1. Tool List (必须确保 item 是对象)
  if (
    Array.isArray(data) && 
    data.length > 0 && 
    typeof data[0] === 'object' && 
    data[0] !== null &&
    "server" in data[0]
  ) {
    return formatToolList(data);
  }

  // 2. Directory List (ls)
  if (
    Array.isArray(data) && 
    data.length > 0 && 
    typeof data[0] === 'object' && 
    data[0] !== null &&
    "isDirectory" in data[0]
  ) {
    const dirs = data.filter((item: any) => item.isDirectory);
    const files = data.filter((item: any) => !item.isDirectory);
    contentStr = [
      ...dirs.map((d: any) => `${d.name}/`),
      ...files.map((f: any) => f.name),
    ].join("\n");

    const pathVal = args?.path || ".";
    return "fold: " + pathVal + "\n" + "```text\n" + contentStr + "\n```";
  }

  // 3. Object (JSON)
  if (typeof data === "object" && data !== null) {
    return JSON.stringify(data, null, 2);
  }

  // 4. String Content (Read File / Git Diff / Tree)
  contentStr = String(data);

  if (toolName === "read_file" && args?.path) {
    const lang = getLanguageFromPath(args.path);
    return (
      "file: " + args.path + "\n" + "```" + lang + "\n" + contentStr + "\n```"
    );
  }

  if (toolName === "get_tree") {
    const pathVal = args?.root || ".";
    return "fold: " + pathVal + "\n" + "```text\n" + contentStr + "\n```";
  }

  if (toolName === "git_status") {
    return "```text\n" + contentStr + "\n```";
  }

  if (toolName === "git_diff" || toolName === "get_file_diff") {
    const header = args?.path ? "file: " + args.path + " (diff)\n" : "";
    return header + "```diff\n" + contentStr + "\n```";
  }

  return contentStr;
}