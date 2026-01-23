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
├── .env                       # [Root] Shared env vars (PORT, PROJECT_ROOT, GIT_IGNORE_FILE)
├── mcp.config.json            # [Root] External MCP Server definitions (e.g. fs)
├── package.json               # [Root] Orchestration scripts
├── apps
│   ├── server
│   │   ├── src
│   │   │   ├── config.ts          # Env loading & Path resolution strategy
│   │   │   ├── index.ts           # Controller: API routing & Error handling
│   │   │   ├── services
│   │   │   │   ├── internal.ts    # "Virtual" MCP server logic (Git, FS read)
│   │   │   │   └── mcp.ts         # External MCP Client connection manager
│   │   │   └── utils
│   │   │       ├── command.ts     # Command parsing regex
│   │   │       ├── exec.ts        # Child Process wrapper
│   │   │       └── fs.ts          # Safe FS operations (Path traversal protection)
│   │   └── package.json
│   └── extension
│       ├── manifest.json      # [Template] Permissions: sidePanel, clipboardRead, clipboardWrite
│       ├── vite.config.ts     # Build config (Manifest injection)
│       └── src
│           ├── App.tsx        # Main Logic: Smart Parser, Macro Execution, State
│           ├── lib
│           │   └── command-parser.ts # Regex logic for extracting mcp commands
│           ├── prompts
│           │   └── system.md  # Default "Sidecar Protocol" (Strict Markdown Rules)
│           ├── components
│           │   ├── CommandBar.tsx    # Input for Smart Commands
│           │   ├── ExecutionPlan.tsx # Batch execution UI with progress tracking
│           │   ├── FileSearch.tsx    # Project Explorer
│           │   └── PromptManager.tsx # Template management

```

## 3. Configuration Architecture

### A. Environment Variables (`.env`)

Located at project root.

```ini
PORT=8080
PROJECT_ROOT=/absolute/path/to/target/project
# Custom ignore list for AI Context (avoids polluting context with huge lockfiles)
GIT_IGNORE_FILE=package-lock.json,pnpm-lock.yaml
```

### B. Dual-Track Filesystem Strategy

1. **UI/Internal Operations (`internal`)**:
   - **Read-Only / Diagnostic**: Used for Tree generation, File Reading, and Git inspection.
   - **Virtual Service**: Implemented in `services/internal.ts`, not a separate MCP process.
   - **Strict Scope**: Enforces `PROJECT_ROOT` checks via `utils/fs.ts`.

2. **AI Write Operations (`fs`)**:
   - **Write / Side-Effects**: Handled by external `@modelcontextprotocol/server-filesystem`.
   - **Protocol**: AI uses `mcp:fs:write_file` for modifications.

## 4. Module Architecture (Refactored)

### Backend (`apps/server`)

- **Controller Layer (`index.ts`)**:
  - Handles HTTP `POST /api/invoke`.
  - Routes `serverName === 'internal'` -> `services/internal`.
  - Routes other names -> `services/mcp` (External Clients).
  - **Global Error Handling**: Traps MCP errors and returns standard JSON responses.

- **Service Layer**:
  - **`internal.ts`**: Implements tools like `list`, `get_tree`, `git_diff`. 
  - **`mcp.ts`**: Manages `StdioClientTransport` connections based on `mcp.config.json`.

- **Git Logic (Enhanced)**:
  - `git_diff`: Executes `git diff HEAD` to show **both staged and unstaged** changes.
  - `git_changed_files`: Merges `git diff --name-only HEAD` and `git ls-files --others` to handle new/untracked files gracefully.
  - **Ignore Support**: Respects `GIT_IGNORE_FILE` env var using Git Pathspec `:(exclude)`.

### Frontend (`apps/extension`)

- **Smart Executor**:
  - Parses commands wrapped in Markdown code blocks (e.g., ` ```javascript ... ``` `).
  - **Batch Mode**: `ExecutionPlan` component handles multi-step instructions with "Stop-on-Failure" logic.

- **Macro: Init Context**:
  - Aggregates **Protocol** (`system.md`) + **Tools** (`internal:list`) + **Tree** (`internal:get_tree`).
  - Copies to clipboard for one-shot AI initialization.

## 5. Critical Implementation Details

1. **Naming Convention**: `mcp:{server}:{tool}`.
2. **Path Security**: All internal tools use `path.resolve(PROJECT_ROOT, relative)` + `startsWith` check.
3. **Git Reliability**: 
   - Handles "Empty Repository" (no HEAD) gracefully via try-catch.
   - Uses `execAsync` for shell commands.
4. **Extension Permissions**:
   - Requires `clipboardRead` and `clipboardWrite` in `manifest.json` to handle Copy/Paste interactions.

## 6. Development Workflow

- **Start All**: `pnpm start` (Root)
- **Backend Dev**: `cd apps/server && pnpm dev`
- **Frontend Dev**: `cd apps/extension && pnpm dev`