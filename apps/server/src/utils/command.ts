export function parseMcpCommand(command: string) {
  const regex = /^mcp:([^:]+):([^(]+?)(?:\((.*)\))?$/;
  const match = command.trim().match(regex);
  if (!match) throw new Error("Invalid command format");
  const [_, serverName, toolName, argsStr] = match;
  let args = {};
  try {
    if (argsStr && argsStr.trim()) args = JSON.parse(argsStr);
  } catch (e) {
    throw new Error(`Invalid JSON args`);
  }
  return { serverName: serverName.trim(), toolName: toolName.trim(), args };
}