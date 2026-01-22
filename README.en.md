# MCP Sidecar

> Empower web-based AI chat interfaces (DeepSeek, ChatGPT, Claude) with local Agent capabilities.

This is a developer tool built on the **Model Context Protocol (MCP)**, consisting of a Chrome Extension frontend and a local Node.js backend. It enables you to quickly inject local context (such as local files and Git changes) into AI conversations via a sidebar, while also managing frequently used prompt templates.

## ✨ Key Features

- **⚡️ Quick Actions**: One-click retrieval of `Git Diff` or project changes, automatically assembling the prompt and copying it to your clipboard.
- **📂 Project Explorer**:
  - Read local file content.
  - Smart path completion (press `Tab`).
  - Auto-detect folders (typing `src` and hitting `Enter` automatically lists the directory).
- **📝 Prompt Management**: Built-in template management with support for dynamic parameters.
- **🔌 Extensibility**: Connect to any standard MCP Server (FileSystem, Git, Databases, etc.) via `mcp.config.json`.

## 🛠 Prerequisites

- Node.js >= 18
- pnpm

## 🚀 Quick Start

### 1. Install Dependencies

```bash
git clone git@github.com:dreamhuan/mcp-sidecar.git
cd mcp-sidecar
pnpm install
```

### 2. Configuration

Modify the `.env` file in the root directory:

```ini
# Backend Service Port
PORT=8080

# Your target project root directory (Absolute Path)
PROJECT_ROOT=/absolute/path/to/target-project

# Frontend API URL
VITE_API_URL=http://localhost:8080

```

Modify `mcp.config.json` (MCP Service Configuration):

```json
{
  "fs": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "${PROJECT_ROOT}"]
  }
}
```

### 3. One-Click Run

```bash
pnpm start

```

> This command will automatically:
>
> 1. Build the frontend extension (`apps/extension`) and output to `dist`.
> 2. Start the backend service (`apps/server`) listening on port 8080.

### 4. Load Extension

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **"Developer mode"** in the top right corner.
3. Click **"Load unpacked"**.
4. Select the `apps/extension/dist` directory inside this project.
5. Click the plugin icon on any webpage to toggle the sidebar.

---

## 💻 Development Guide

If you need to modify the source code, use the following commands:

| Command      | Description                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`   | **UI Debug Mode**. Starts both backend and frontend dev servers (Vite). You can quickly debug the UI at `localhost:5173`.                                                                |
| `pnpm watch` | **Extension Debug Mode**. Backend runs normally, while frontend runs in `build --watch` mode. After modifying frontend code, simply refresh the extension in the Chrome extensions page. |
| `pnpm build` | **Compile Only**. Performs TypeScript type checks for both backend and frontend, and builds the production package for the frontend.                                                     |

## 🤝 FAQ

**Q: Why do I need to run a Node backend?**  
A: Browser extensions are restricted by sandbox security policies and cannot directly access your local file system or execute Git commands. The Node backend acts as a "Sidecar" proxy, handling interactions with the local system via the MCP protocol.

**Q: How do I use the file search?**  
A: Enter a file path (e.g., `src/App.tsx`) in the Input box and hit Enter to read its content. Enter a directory name (e.g., `src`) and hit Enter to list files within that directory. Press `Tab` to use path auto-completion.
