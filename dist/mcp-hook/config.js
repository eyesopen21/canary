import { fileURLToPath } from "node:url";
import { objectAt, writeJsonConfiguration, writeTextConfiguration,                   } from "../cli/init-files.js";

const BUILD_ENTRY = fileURLToPath(new URL("../../dist/cli/entry.js", import.meta.url));

                                               

export function isMcpAgent(agent        )                    {
  return agent === "claude-code" || agent === "codex";
}

/** Recognize a Canary mcp_tool hook already present in a host settings file. */
export function isMcpHook(entry                         )          {
  return entry?.type === "mcp_tool" && entry.server === "canary" && entry.tool === "canary_pre_tool_use";
}

/** The opt-in mcp_tool hook. The default init path never calls this function. */
export function mcpHook(agent          )                          {
  const hook                          = {
    type: "mcp_tool",
    server: "canary",
    tool: "canary_pre_tool_use",
    input: {
      agent,
      tool_name: "${tool_name}",
      command: "${tool_input.command}",
      cwd: "${cwd}",
    },
    timeout: 10,
  };
  if (agent === "claude-code") hook.onFailure = "block";
  else hook.statusMessage = "Canary: checking command";
  return hook;
}

export function planClaudeMcpServer(root        )               {
  const server = { command: process.execPath, args: [BUILD_ENTRY, "mcp-server"] };
  return writeJsonConfiguration(root, ".mcp.json", (config) => {
    const servers = objectAt(config, "mcpServers");
    const current = servers.canary;
    if (current !== undefined) {
      if (current && typeof current === "object" && !Array.isArray(current)
        && (current                           ).command === server.command
        && Array.isArray((current                           ).args)
        && ((current                           ).args             ).join("\0") === server.args.join("\0")) {
        return false;
      }
      throw new Error("MCP server 'canary' is already configured.");
    }
    servers.canary = server;
    return false;
  }, { mcpServers: { canary: server } });
}

export function planCodexMcpServer(root        )               {
  const command = JSON.stringify(process.execPath);
  const args = JSON.stringify([BUILD_ENTRY, "mcp-server"]);
  const addition = '# Added by canary init --mcp-tool.\n[mcp_servers.canary]\ncommand = '
    + command + '\nargs = ' + args;
  return writeTextConfiguration(root, ".codex/config.toml", (current) => {
    const source = current ?? "";
    const lines = source.split(/\r?\n/);
    const sectionIndex = lines.findIndex((line) => /^\s*\[mcp_servers\.(?:canary|"canary")\]\s*(?:#.*)?$/.test(line));
    if (sectionIndex >= 0) {
      const nextSection = lines.findIndex((line, index) => index > sectionIndex && /^\s*\[/.test(line));
      const section = lines.slice(sectionIndex + 1, nextSection < 0 ? undefined : nextSection).join("\n");
      if (section.includes("command = " + command) && section.includes("args = " + args)) {
        return { content: source, changed: false };
      }
      throw new Error("MCP server 'canary' is already configured.");
    }
    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    const suffix = addition.replace(/\n/g, newline);
    return {
      content: source + (source && !source.endsWith("\n") ? newline : "") + suffix + newline,
      changed: true,
    };
  }, addition);
}
