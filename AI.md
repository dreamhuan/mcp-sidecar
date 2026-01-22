# MCP Sidecar Project Summary (Technical Context)

**Project Name**: MCP Sidecar
**Type**: Monorepo (pnpm workspace)
**Description**: A "Human-in-the-Loop" AI Agent environment consisting of a Chrome Extension (Frontend) and a Node.js Server (Backend). It bridges the browser UI with local system capabilities via the Model Context Protocol (MCP), featuring a "Smart Executor" workflow for AI-driven operations.

## 1. Technology Stack

- **Package Manager**: `pnpm` (Workspace enabled)
- **Backend (`apps/server`)**: Node.js, Express, `@modelcontextprotocol/sdk`, `dotenv`, `tsx`.
- **Frontend (`apps/extension`)**: React, Vite, Tailwind CSS v4, Lucide React, Radix UI.
- **Build Tools**: Custom Vite plugin for Manifest injection & Env injection.

## 2. Directory Structure & Key Files

```text
.
├── .env                       # [Root] Shared env vars (PORT, PROJECT_ROOT)
├── mcp.config.json            # [Root] External MCP Server definitions (e.g. fs)
├── package.json               # [Root] Orchestration scripts
├── apps
│   ├── server
│   │   ├── src/index.ts       # Main entry, API routing, 'internal' server logic
│   │   └── package.json
│   └── extension
│       ├── manifest.json      # [Template] Source manifest
│       ├── vite.config.ts     # Build config (Manifest injection)
│       └── src
│           ├── App.tsx        # Main Logic: Smart Parser, Macro Execution, State
│           ├── vite-env.d.ts  # Types including *.md?raw support
│           ├── prompts
│           │   └── system.md  # Default "Sidecar Protocol" system prompt
│           ├── components
│           │   ├── CommandBar.tsx    # Input for Smart Commands
│           │   ├── FileSearch.tsx    # Project Explorer (uses internal:list_directory)
│           │   ├── QuickActions.tsx  # Compact vertical list of macros
│           │   ├── PromptManager.tsx # Template management with Custom Delete Modal
│           │   └── ServerShortcuts.tsx # Suggested commands list
│           └── common.ts      # Shared constants

```

## 3. Configuration Architecture

### A. Environment Variables (`.env`)

Located at project root.

```ini
PORT=8080
PROJECT_ROOT=/absolute/path/to/target/project

```

### B. Dual-Track Filesystem Strategy

1. **UI/Internal Operations (`internal`)**:

- Handled natively by the Sidecar Backend.
- Used for Project Explorer, Tree generation, and read-only context gathering.
- **Strictly** scoped to `PROJECT_ROOT` for security.

2. **AI Write Operations (`fs`)**:

- Handled by external `@modelcontextprotocol/server-filesystem` (defined in `mcp.config.json`).
- AI is instructed to use `mcp:fs:write_file` for modifications.

## 4. Module Architecture

### Backend (`apps/server`)

- **Internal Server ("Virtual")**:
  A native namespace `internal` implemented directly in `index.ts`. It does **not** use stdio transport but handles requests in-memory.
- `list`: Lists tools. Supports filtering (e.g., `{"server":"git"}`).
- `get_tree`: Generates project structure string (Args: `root`, `depth`).
- `list_directory`: Returns file list with types (used by UI).
- `read_file`: Reads text content (used by UI).
- `git_diff` / `git_status`: Native Git wrappers.

- **API `/api/invoke**`:
- Parses `mcp:server:tool` commands.
- Routes `serverName === 'internal'` to internal logic.
- Routes other names to connected MCP clients (via `mcp.config.json`).
- **No top-level interceptors**: `list` logic is now a standard tool (`internal:list`).

### Frontend (`apps/extension`)

- **Smart Executor (Parser)**:
- Parses commands in format `mcp:server:tool(json_args)`.
- Supports executing single commands or batch-parsing from AI responses.
- **Meta Commands**: Uses `mcp:internal:list` for discovering tools.

- **Macro: Init Context**:
- A specialized action (Rocket Icon) that aggregates:

1. **Protocol**: Loads `system.md` content.
2. **Tools**: Calls `internal:list` to get available capabilities.
3. **Context**: Calls `internal:get_tree` to get project structure.

- Copies the combined markdown to clipboard for one-shot AI initialization.

- **Components**:
- **PromptManager**:
- Loads default `system.md` via `?raw` import.
- Merges System Prompts with User Prompts (LocalStorage).
- Features a custom **Backdrop Blur Modal** for delete confirmation (UI consistency).

- **QuickActions**: Compact vertical layout with icons, descriptions, and hover-to-play interaction.
- **ServerShortcuts**: Generates parameterized list commands (e.g., `mcp:internal:list({"server":"git"})`).

## 5. Critical Implementation Details

1. **Naming Convention**: All commands strictly follow `mcp:{server}:{tool}` format.

- Example: `mcp:internal:get_tree`, `mcp:fs:write_file`.

2. **List Logic**: There is no longer a magic `mcp:list` command. The frontend must request `mcp:internal:list` to fetch capabilities.
3. **Path Security**:

- `internal` tools enforce `path.resolve(PROJECT_ROOT, relativePath)` and check `startsWith(PROJECT_ROOT)`.
- Frontend always sends relative paths.

4. **Prompt Strategy**:

- `system.md` is the source of truth for the "Protocol".
- User-defined prompts override/append to the list but System prompts (by ID) are protected/updated on build.

5. **Manifest Injection**: `vite.config.ts` dynamically injects the backend `PORT` into CSP and Host Permissions during build.

## 6. Development Workflow

- **Start All**: `pnpm start` (Root)
- **Backend Dev**: `cd apps/server && pnpm dev`
- **Frontend Dev**: `cd apps/extension && pnpm dev`
