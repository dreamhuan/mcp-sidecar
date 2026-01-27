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
          const newServers = json.data.map((t: any) => t.server);
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
      showToast("Connection Failed", "Please check local service", "error");
    } finally {
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
        invokeAPI({ serverName: "internal", toolName: "list" }),
        invokeAPI({
          serverName: "internal",
          toolName: "get_tree",
          args: { root: ".", depth: 3 },
        }),
      ]);

      let toolsSection = "";
      if (listRes.success && Array.isArray(listRes.data)) {
        toolsSection =
          "## Available Tools\n" +
          listRes.data
            .map(
              (t: any) => `- \`mcp:${t.server}:${t.name}\`: ${t.description}`,
            )
            .join("\n");
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
      showToast("Context Ready!", "Protocol, Tools & Tree copied.", "success");
      setResultPreview(fullContext);
    } catch (e: any) {
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
