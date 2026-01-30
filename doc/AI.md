# MCP Sidecar Project Context

> **SYSTEM NOTE**: This file is a technical reference for AI coding assistants. Use this context to understand the project structure, dependencies, and operational constraints.

## 1. Project Identity
- **Name**: MCP Sidecar
- **Type**: Monorepo (`pnpm workspace`)
- **Architecture**: Client-Server (Browser Extension UI <-> Local Node.js Backend)
- **Core Function**: "Human-in-the-Loop" AI Agent environment bridging Web UI with Local System via MCP (Model Context Protocol).

## 2. Technology Stack (Strict constraints)

### Backend (`apps/server`)
- **Runtime**: Node.js (Current LTS), `tsx` for execution.
- **Framework**: Express.js (`src/index.ts`).
- **MCP SDK**: `@modelcontextprotocol/sdk`.
- **Key Features**: 
  - **Virtual Server**: `services/internal.ts` (Git, FS reads).
  - **Gateway**: `services/mcp.ts` (Connects to external MCP servers defined in `mcp.config.json`).
  - **Security**: Enforces `PROJECT_ROOT` path validation (No access outside target dir).

### Frontend (`apps/extension`)
- **Framework**: React 19, Vite 7.
- **Styling**: Tailwind CSS v4 (No `postcss.config.js` needed), `clsx`, `tailwind-merge`.
- **UI Library**: Radix UI (Primitives), Lucide React (Icons).
- **State/Logic**: Custom `useMcpEngine` hook (Command orchestration).
- **Parser**: Custom State Machine parser (`lib/command-parser.ts`) handling nested brackets/quotes.

## 3. Directory Map

```text
.
├── mcp.config.json          # External MCP server config (e.g. fs, vibeus-ds)
├── .env                     # PROJECT_ROOT, PORT definition
├── apps
│   ├── server               # [Backend] Local Operations & MCP Gateway
│   │   └── src
│   │       ├── services/    # internal.ts (Git/Tree), mcp.ts (Connection)
│   │       └── utils/       # fs.ts (Tree Gen), command.ts (Parsing)
│   └── extension            # [Frontend] UI & Logic
│       └── src
│           ├── components/  # ExecutionPlan, CommandBar, FileSearch
│           ├── hooks/       # useMcpEngine (Core State Machine)
│           ├── lib/         # command-parser.ts (Text -> Command)
│           └── prompts/     # System prompts (system.md)
```

## 4. Operational Protocol (AI Instructions)

### Command Format
The system parses code blocks in Markdown. You MUST format commands as:
```javascript
mcp:<server_name>:<tool_name>(<json_args>)
```

### Available Namespaces & Tools

#### A. `internal` (Read-Only / Diagnostics)
*Implemented in `apps/server/src/services/internal.ts`*

| Tool | Arguments | Behavior |
| :--- | :--- | :--- |
| `get_tree` | `{ "root": ".", "depth": 3 }` | Returns recursive file structure. Always start here. |
| `read_file` | `{ "path": "src/App.tsx" }` | Reads text content. |
| `list` | `{}` | Lists all available tools from all connected servers. |
| `git_status` | `{}` | Runs `git status`. |
| `git_diff` | `{}` | Runs `git diff HEAD` (Staged + Unstaged). |
| `git_changed_files` | `{}` | **Smart List**: Combines `git diff` + `git ls-files --others` (Finds untracked files). |
| `get_file_diff` | `{ "path": "..." }` | Returns specific file diff OR "New File" status. |

#### B. `fs` (Write / Side-Effects)
*Proxied to `@modelcontextprotocol/server-filesystem`*

| Tool | Arguments | Behavior |
| :--- | :--- | :--- |
| `write_file` | `{ "path": "...", "content": "..." }` | **Auto-Mkdir**: Recursively creates parent dirs. Overwrites files. |
| `create_directory` | `{ "path": "..." }` | Recursively creates directories (`mkdir -p`). |
| `list_directory` | `{ "path": "..." }` | Lists files with metadata (size, time). |

## 5. Coding Guidelines for AI

1.  **Context Loading**: Before modifying code, ALWAYS check `mcp:internal:get_tree` and `mcp:internal:read_file` to match existing patterns.
2.  **Writing Files**: 
    - Provide full file content (no `// ... existing code` placeholders).
    - Ensure JSON strings in `write_file` arguments are properly escaped.
3.  **Frontend/Backend Split**:
    - **Frontend** handles UI, Parsing, and Prompt Management.
    - **Backend** handles File I/O, Git, and MCP connections.
    - *Do not* import Node.js `fs` modules in Frontend code.
4.  **Error Handling**: If a command fails, the backend returns HTTP 500 with a JSON error. The Frontend stops batch execution immediately.
