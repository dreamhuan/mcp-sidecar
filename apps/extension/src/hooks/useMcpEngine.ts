import { useState } from "react";
import { ParsedCommand } from "../lib/command-parser";
import { ToastType, PromptTemplate } from "../types";
import { invokeAPI } from "../lib/api";
import { formatCommandResult } from "../lib/formatter";
import { getLanguageFromPath } from "../data/config";

export function useMcpEngine(
  showToast: (title: string, desc: string, type?: ToastType) => void,
) {
  const [loading, setLoading] = useState(false);
  const [resultPreview, setResultPreview] = useState("");
  const [availableServers, setAvailableServers] = useState<string[]>([]);
  const [pendingCommands, setPendingCommands] = useState<ParsedCommand[]>([]);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [failedIndex, setFailedIndex] = useState<number | null>(null);

  // --- Core: 单条执行 ---
  const executeCommand = async (
    serverName: string | null,
    toolName: string | null,
    args: any | null,
    promptPrefix: string = "",
    commandStr?: string,
  ) => {
    setLoading(true);
    setResultPreview("");

    try {
      const payload = commandStr
        ? { command: commandStr }
        : { serverName, toolName, args };
      const json = await invokeAPI(payload);

      if (json.success) {
        // 更新 Server 列表 (Side Effect)
        if (json.isToolList && Array.isArray(json.data)) {
          let newServers: string[] = [];
          // 🔥 兼容处理：data 可能是 Server 名字数组 (string[]) 或 Tool 对象数组 ({server: string})
          if (json.data.length > 0 && typeof json.data[0] === 'string') {
            newServers = json.data;
          } else {
            newServers = json.data.map((t: any) => t.server);
          }
          
          setAvailableServers((prev) =>
            Array.from(new Set([...prev, ...newServers])).sort(),
          );
        }

        const contentStr = formatCommandResult(toolName || "", args, json.data);
        const finalResult = promptPrefix
          ? `${promptPrefix}${contentStr}`
          : contentStr;

        setResultPreview(finalResult);
        await navigator.clipboard.writeText(finalResult);
        showToast("Copied & Executed", "Result copied to clipboard", "success");
      } else {
        showToast("Execution Failed", json.error || "Unknown error", "error");
        setResultPreview(`❌ EXECUTION FAILED:\n${json.error}`);
      }
    } catch (e: any) {
      console.error("❌ Execute Command Error:", e);
      const errorMsg = e.message || "Unknown error occurred";
      showToast("Execution Error", errorMsg, "error");
      setResultPreview(`❌ CLIENT ERROR:\n${errorMsg}\n\nCheck console for details.`);
    }
 finally {
      setLoading(false);
    }
  };

  // --- Core: 批量执行 ---
  const executeBatch = async () => {
    setLoading(true);
    setExecutionProgress(0);
    setFailedIndex(null);
    const results: string[] = [];

    try {
      for (let i = 0; i < pendingCommands.length; i++) {
        setExecutionProgress(i);
        const cmd = pendingCommands[i];
        const json = await invokeAPI({
          serverName: cmd.server,
          toolName: cmd.tool,
          args: cmd.args,
        });

        if (json.success) {
          const output = formatCommandResult(cmd.tool, cmd.args, json.data);
          results.push(
            `### [CMD] ${cmd.tool} (Args: ${JSON.stringify(cmd.args)})\n${output}\n`,
          );
          setExecutionProgress(i + 1);
        } else {
          results.push(`### [CMD FAILED] ${cmd.tool}\nERROR: ${json.error}\n`);
          setFailedIndex(i);
          showToast("Batch Stopped", `Command '${cmd.tool}' failed.`, "error");
          break;
        }
      }

      const finalReport = results.join("\n" + "=".repeat(40) + "\n\n");
      setResultPreview(finalReport);
      await navigator.clipboard.writeText(finalReport);

      if (failedIndex === null) {
        showToast("Batch Complete", "All results copied", "success");
        setPendingCommands([]);
      } else {
        showToast("Batch Complete", "Results ready (Copy failed)", "success");
      }
    } catch (e: any) {
      console.error("❌ Batch Execution Error:", e);
      showToast("Batch Error", e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // --- Action 3: 宏命令 (Macros) ---

  const generateContext = async (
    prompts: PromptTemplate[],
    commandBarSetter: (v: string) => void,
  ) => {
    commandBarSetter("");
    setLoading(true);
    try {
      const protocolPrompt =
        prompts.find((p) => p.id === "init-protocol")?.content ||
        "Protocol not found.";
      
      const [listRes, treeRes] = await Promise.all([
        invokeAPI({
          serverName: "internal",
          toolName: "list",
          args: {},
        }),
        invokeAPI({
          serverName: "internal",
          toolName: "get_tree",
          args: { root: ".", depth: 3 },
        }),
      ]);

      let toolsSection = "";
      if (listRes.success && Array.isArray(listRes.data)) {
        const servers = listRes.data as string[];
        toolsSection =
          "## Available Servers\n" +
          servers.map((s) => `- \`mcp:${s}\``).join("\n") +
          "\n\n> **Tip**: To see tools for a specific server, use `mcp:internal:list({\"server\": \"fs\"})` (replace \"fs\" with the server name).";
      }

      const treeSection =
        "## Project Structure\n```\n" + treeRes.data + "\n```";

      const fullContext = [
        "# System Context Initialization",
        "",
        "## Protocol & Instructions",
        protocolPrompt,
        "",
        toolsSection,
        "",
        treeSection,
        "",
        "Ready.",
      ].join("\n");

      await navigator.clipboard.writeText(fullContext);
      showToast("Context Ready!", "Protocol, Servers & Tree copied.", "success");
      setResultPreview(fullContext);
    } catch (e: any) {
      console.error("❌ Context Generation Error:", e);
      showToast("Init Failed", e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const generateReview = async (
    prompts: PromptTemplate[],
    commandBarSetter: (v: string) => void,
  ) => {
    commandBarSetter("");
    setLoading(true);
    try {
      const reviewPromptTemplate =
        prompts.find((p) => p.id === "code-review")?.content ||
        "Review these changes:\n";
      const filesRes = await invokeAPI({
        serverName: "internal",
        toolName: "git_changed_files",
      });

      if (
        !filesRes.success ||
        !Array.isArray(filesRes.data) ||
        filesRes.data.length === 0
      ) {
        showToast("No Changes", "No modified files found.", "error");
        setLoading(false);
        return;
      }

      const files = filesRes.data as string[];
      showToast(
        "Analyzing Files",
        `Gathering Diff & Content for ${files.length} files...`,
      );

      const fileContexts = await Promise.all(
        files.map(async (filePath) => {
          try {
            const [diffRes, contentRes] = await Promise.all([
              invokeAPI({
                serverName: "internal",
                toolName: "get_file_diff",
                args: { path: filePath },
              }),
              invokeAPI({
                serverName: "internal",
                toolName: "read_file",
                args: { path: filePath },
              }),
            ]);
            return [
              `\n=== FILE REPORT: ${filePath} ===`,
              `\n[PART 1: CHANGES (Git Diff)]`,
              `file: ${filePath} (diff)`,
              "```diff",
              diffRes.data || "(No diff info)",
              "```",
              `\n[PART 2: FULL CURRENT CONTENT]`,
              `file: ${filePath}`,
              "```" + getLanguageFromPath(filePath),
              contentRes.data || "(Error reading content)",
              "```",
            ].join("\n");
          } catch (e) {
            console.error(`❌ Review File Error (${filePath}):`, e);
            return `\n=== FILE: ${filePath} ===\n(Error info)`;
          }
        }),
      );

      const fullContext = [
        "# Code Review Request",
        "",
        reviewPromptTemplate,
        "",
        "## File Analysis",
        ...fileContexts,
      ].join("\n");
      await navigator.clipboard.writeText(fullContext);
      showToast("Ready for Review!", "Diffs & Content copied.", "success");
      setResultPreview(fullContext);
    } catch (e: any) {
      console.error("❌ Review Generation Error:", e);
      showToast("Review Init Failed", e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    setLoading,
    resultPreview,
    setResultPreview,
    availableServers,
    pendingCommands,
    setPendingCommands,
    executionProgress,
    setExecutionProgress,
    failedIndex,
    setFailedIndex,
    executeCommand,
    executeBatch,
    generateContext,
    generateReview,
  };
}