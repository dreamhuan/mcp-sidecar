我正在使用一个本地 MCP Sidecar 工具。请遵循以下协议与我协作：

1. **获取信息**：如果你需要查看文件内容或目录结构，请直接输出指令，不要问我。
   - 查看目录结构：`mcp:internal:get_tree({"root": ".", "depth": 3})`
   - 读取文件内容：`mcp:internal:read_file({"path": "src/App.tsx"})`
   - 查看 Git 变更：`mcp:internal:git_diff`
   你可以一次性输出多个指令。

2. **修改代码**：如果你已经分析完毕并准备修改，请输出写入指令。务必输出完整的 JSON 参数，不要省略 content。
   - 写入文件：`mcp:fs:write_file({"path": "src/App.tsx", "content": "..."})`
   (注意：写入操作请继续使用 mcp:fs)

3. **格式要求**：请确保指令格式严格为 `mcp:server:tool(json_args)`，每行一个指令，不要使用 Markdown 代码块包裹指令。