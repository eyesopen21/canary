                                           
import { fileURLToPath } from "node:url";
import { FAIL_OPEN_NOTICE } from "../adapters/config.js";
import {
  applyPlannedWrites, displayPreview, readConfiguration, writeJsonConfiguration, writeOpenCodeJsonc,
  writeTextConfiguration,
                    
} from "./init-files.js";

const BUILD_ENTRY = fileURLToPath(new URL("../../dist/cli/entry.js", import.meta.url));

function shellQuote(value        )         {
  return process.platform === "win32"
    ? `"${value}"`
    : "'" + value.replace(/'/g, "'\\''") + "'";
}

const COMMAND = (agent           ) => "node " + shellQuote(BUILD_ENTRY) + " hook --agent " + agent;

function objectAt(parent                         , key        )                          {
  const value = parent[key];
  if (value === undefined) return (parent[key] = {})                           ;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid hook configuration.");
  return value                           ;
}

function arrayAt(parent                         , key        )            {
  const value = parent[key];
  if (value === undefined) return (parent[key] = [])             ;
  if (!Array.isArray(value)) throw new Error("Invalid hook configuration.");
  return value;
}

function upsertGroupedHook(
  config                         ,
  eventName        ,
  matcher        ,
  agent           ,
  hook                         ,
)          {
  const hooks = objectAt(config, "hooks");
  const eventHooks = arrayAt(hooks, eventName)                             ;
  let group = eventHooks.find((entry) => entry?.matcher === matcher);
  if (!group) {
    group = { matcher, hooks: [] };
    eventHooks.push(group);
  }
  if (!Array.isArray(group.hooks)) throw new Error("Invalid hook configuration.");
  const entries = group.hooks                             ;
  const command = COMMAND(agent);
  const old = entries.findIndex((entry) => entry?.command === command || isCanaryHook(entry, agent));
  if (old >= 0) entries[old] = hook;
  else entries.push(hook);
  return old >= 0;
}

function upsertFlatHook(
  config                         ,
  eventName        ,
  agent           ,
  hook                         ,
)          {
  const hooks = objectAt(config, "hooks");
  const eventHooks = arrayAt(hooks, eventName)                             ;
  const command = COMMAND(agent);
  const old = eventHooks.findIndex((entry) => entry?.command === command || isCanaryHook(entry, agent));
  if (old >= 0) eventHooks[old] = hook;
  else eventHooks.push(hook);
  return old >= 0;
}

function isCanaryHook(entry                         , agent           )          {
  const args = Array.isArray(entry?.args) ? entry.args.map(String) : [];
  const suffix = "hook --agent " + agent;
  return args.slice(-3).join(" ") === suffix
    || entry?.command === "canary hook --agent " + agent
    || (typeof entry?.command === "string" && entry.command.endsWith(" " + suffix))
    || (agent !== "cursor" && agent !== "gemini-cli" && agent !== "opencode"
      && entry?.type === "mcp_tool" && entry.server === "canary" && entry.tool === "canary_pre_tool_use");
}

function mcpHook(agent                         )                          {
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

function planClaudeMcpServer(root        )               {
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

function planCodexMcpServer(root        )               {
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

function planClaude(root        , useMcpTool = false)               {
  const path = ".claude/settings.json";
  const hook = useMcpTool ? mcpHook("claude-code") : {
    type: "command",
    command: "node",
    args: [BUILD_ENTRY, "hook", "--agent", "claude-code"],
    timeout: 10,
    onFailure: "block",
  };
  const group = { matcher: "Bash|PowerShell", hooks: [hook] };
  return writeJsonConfiguration(root, path, (config) => {
    return upsertGroupedHook(config, "PreToolUse", "Bash|PowerShell", "claude-code", hook);
  }, { hooks: { PreToolUse: [group] } });
}

function planCodex(root        , useMcpTool = false)               {
  const path = ".codex/hooks.json";
  const hook = useMcpTool ? mcpHook("codex") : {
    type: "command",
    command: COMMAND("codex"),
    timeout: 10,
    statusMessage: "Canary: checking command",
  };
  const group = { matcher: "^Bash$", hooks: [hook] };
  return writeJsonConfiguration(root, path, (config) => {
    return upsertGroupedHook(config, "PreToolUse", "^Bash$", "codex", hook);
  }, { hooks: { PreToolUse: [group] } });
}

function planCursor(root        )               {
  const path = ".cursor/hooks.json";
  const hook = {
    command: COMMAND("cursor"),
    matcher: "Shell",
    timeout: 10,
    failClosed: true,
  };
  return writeJsonConfiguration(root, path, (config) => {
    if (config.version === undefined) config.version = 1;
    return upsertFlatHook(config, "preToolUse", "cursor", hook);
  }, { version: 1, hooks: { preToolUse: [hook] } });
}

function planGemini(root        )               {
  const path = ".gemini/settings.json";
  const hook = {
    name: "canary",
    type: "command",
    command: COMMAND("gemini-cli"),
    timeout: 10000,
    description: "Blocks irreversible shell commands",
  };
  const group = { matcher: "run_shell_command", hooks: [hook] };
  return writeJsonConfiguration(root, path, (config) => {
    return upsertGroupedHook(config, "BeforeTool", "run_shell_command", "gemini-cli", hook);
  }, { hooks: { BeforeTool: [group] } });
}

function planOpenCode(root        )                 {
  const permissionRule = {
    action: "shell",
    resource: "git push --force *",
    effect: "deny",
  };
  const path = ".opencode/plugins/canary/index.ts";
  const header = "// Generated by canary init.\n";
  const current = readConfiguration(root, path);
  if (current !== undefined && !current.startsWith(header)) {
    throw new Error("Existing OpenCode Canary plugin is managed outside init.");
  }
  const plugin = header + `import { execFileSync } from "node:child_process"\nimport { Plugin } from "@opencode/plugin"\n\nexport default Plugin.define({\n  id: "canary",\n  async setup(ctx) {\n    await ctx.permission.hook("evaluate", async (event) => {\n      if (event.action !== "shell") return\n      try {\n        const output = execFileSync(process.execPath, [${JSON.stringify(BUILD_ENTRY)}, "hook", "--agent", "opencode"], {\n          input: JSON.stringify({ action: event.action, resources: event.resources }),\n          encoding: "utf8",\n          stdio: ["pipe", "pipe", "ignore"],\n          cwd: ctx.location.directory,\n          timeout: 10000,\n          windowsHide: true,\n        })\n        if (!output.trim()) return\n        const result = JSON.parse(output) as { effect?: "ask" | "deny"; message?: string }\n        if (result.effect === "deny" || result.effect === "ask") {\n          event.effect = result.effect\n          event.message = result.message\n        }\n      } catch {\n        // The hook is a guardrail; command failures leave OpenCode's decision unchanged.\n      }\n    })\n  },\n})\n`;
  return [
    {
      ...writeOpenCodeJsonc(root, "opencode.jsonc", permissionRule),
    },
    {
      relativePath: path,
      content: plugin,
      preview: (current === undefined ? "" : "- Previous generated plugin [omitted]\n")
        + plugin.trimEnd().split("\n").map((line) => "+" + line).join("\n") + "\n",
    },
  ];
}

function failOpenNotice(agent           )       {
  if (agent === "codex" || agent === "gemini-cli" || agent === "opencode") {
    process.stdout.write(FAIL_OPEN_NOTICE[agent] + "\n");
  }
  if (agent === "gemini-cli") {
    process.stdout.write(
      "Canary cannot install Gemini CLI policy rules in the user-level ~/.gemini/policies/ directory. " +
      "Add the documented deny rules there manually for shell commands such as force pushes and " +
      "auto-approved infrastructure changes.\n",
    );
  }
}

export function initAgent(agent           , root        , options                        = {})       {
  const useMcpTool = options.mcpTool === true;
  if (useMcpTool && agent !== "claude-code" && agent !== "codex") {
    throw new Error("The MCP tool prototype supports Claude Code and Codex only.");
  }
  let writes                ;
  switch (agent) {
    case "claude-code": writes = [planClaude(root, useMcpTool), ...(useMcpTool ? [planClaudeMcpServer(root)] : [])]; break;
    case "codex": writes = [planCodex(root, useMcpTool), ...(useMcpTool ? [planCodexMcpServer(root)] : [])]; break;
    case "cursor": writes = [planCursor(root)]; break;
    case "gemini-cli": writes = [planGemini(root)]; break;
    case "opencode": writes = planOpenCode(root); break;
  }
  const changes = writes.filter(({ relativePath, content }) => readConfiguration(root, relativePath) !== content);
  if (changes.length) {
    displayPreview(changes);
    applyPlannedWrites(root, changes);
    for (const write of changes) process.stdout.write("Configured " + write.relativePath + ".\n");
  } else {
    process.stdout.write("Canary is already configured.\n");
  }
  failOpenNotice(agent);
  process.stdout.write("Node.js must be available when the agent runs hooks.\n");
}
