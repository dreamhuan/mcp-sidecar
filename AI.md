# MCP Sidecar Project Summary (Technical Context)

**Project Name**: MCP Sidecar
**Type**: Monorepo (pnpm workspace)
**Description**: A developer tool consisting of a Chrome Extension (Frontend) and a Node.js Server (Backend). It bridges the browser UI with local system capabilities (FileSystem, Git) via the Model Context Protocol (MCP).

## 1. Technology Stack

- **Package Manager**: `pnpm` (Workspace enabled)
- **Backend (`apps/server`)**: Node.js, Express, `@modelcontextprotocol/sdk`, `dotenv`, `tsx`.
- **Frontend (`apps/extension`)**: React, Vite, Tailwind CSS v4, Lucide React, Radix UI.

## 2. Directory Structure & Key Files

```text
.
├── .env                       # [Root] Shared env vars (PORT, PROJECT_ROOT)
├── mcp.config.json            # [Root] MCP Server definitions
├── package.json               # [Root] Orchestration scripts
├── apps
│   ├── server
│   │   ├── src/index.ts       # Main entry, API & MCP logic
│   │   └── package.json
│   └── extension
│       ├── manifest.json      # [Template] Source manifest (Note: NOT in public/)
│       ├── vite.config.ts     # Build config with manifest injection logic
│       └── src
│           ├── App.tsx        # Main UI, State, Execution Logic
│           ├── components
│           │   ├── CommandBar.tsx   # Magic command input
│           │   ├── FileSearch.tsx   # Project Explorer with auto-complete
│           │   ├── QuickActions.tsx # Shortcut buttons grid
│           │   └── ...
│           └── common.ts      # Shared constants (API_BASE_URL)

```

## 3. Configuration Architecture (Decoupled)

### A. Environment Variables (`.env`)

Located at project root. Used by both Server (runtime) and Extension (build-time).

```ini
PORT=8080
PROJECT_ROOT=/absolute/path/to/target/project
VITE_API_URL=http://localhost:8080

```

### B. MCP Server Config (`mcp.config.json`)

Located at project root. Defines external MCP servers to connect to. Supports `${PROJECT_ROOT}` placeholder.

```json
{
  "fs": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "${PROJECT_ROOT}"]
  },
  "git": { ... } // (Handled internally or via config)
}

```

## 4. Module Architecture

### Backend (`apps/server`)

- **Initialization**: Loads `.env`, parses `mcp.config.json`, replaces placeholders, and connects to MCP servers using `StdioClientTransport` or `StreamableHTTPClientTransport`.
- **Client Capability**: Explicitly sets `capabilities: {}` to avoid type errors (it acts as a Client, not a Host).
- **API `/api/invoke**`:
- **Standard Call**: Forwards requests to specific MCP clients.
- **Path Rebasing**: Intercepts `fs` calls. Converts relative paths from frontend to absolute paths using `PROJECT_ROOT`.
- **`mcp:list`**: Aggregates tools from all connected clients + internal Git tools, formats descriptions, and returns unified JSON.

- **Scripts**:
- `dev`: `tsx src/index.ts` (Run directly)
- `build`: `tsc --noEmit` (Type check only, do not block CI)

### Frontend (`apps/extension`)

- **Vite Strategy**:
- **Manifest Injection**: A custom Vite plugin reads `apps/extension/manifest.json`, injects the `PORT` from `.env` into `host_permissions`, and outputs to `dist/manifest.json`.

- **Core Logic (`App.tsx`)**:
- **Execution**: Sends POST to backend. On success -> auto-copies result to clipboard (`navigator.clipboard`) + Toast notification.
- **Prompt Prefixing**: Prepend context (e.g., "Analyze this bug:") to the MCP result before display/copy.

- **Components**:
- **Project Explorer (`FileSearch.tsx`)**:
- UX: Tab to complete.
- Smart Enter: If input has no extension (e.g., "src"), treats it as a directory list request; otherwise reads file.

- **Quick Actions**: Visual cards for common tasks (e.g., Git Diff). static `desc`.
- **Templates**: Toggleable "Templates" button in header.

## 5. Build & Run Workflow

- **One-Click Start**:

```bash
pnpm start

```

_Logic_: Runs `pnpm build` (Frontend) -> then runs `pnpm start` (Backend).

- **Development**:
- Server: `cd apps/server && pnpm dev`
- Extension: `cd apps/extension && pnpm dev` (Visit `http://localhost:5173`)

## 6. Critical Implementation Details (Do Not Break)

1. **Manifest Handling**: Do **not** put `manifest.json` in `public/`. It lives in `apps/extension/` root and is processed by `vite.config.ts`.
2. **TS Types**: Frontend `tsconfig` must include `"types": ["vite/client", "node"]` to support `import.meta.env` and Node modules in config.
3. **Path Logic**: The backend _must_ handle path resolution. The frontend sends relative paths (e.g., `src/App.tsx`), backend joins with `process.env.PROJECT_ROOT`.
4. **UX Polish**:

- **Tab Key** in FileSearch triggers autocomplete but keeps search active.
- **Enter Key** on a folder-like string triggers `list_directory`.
