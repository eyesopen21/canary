import type { AgentName } from "./main.ts";
import { fileURLToPath } from "node:url";
import { FAIL_OPEN_NOTICE } from "../adapters/config.ts";
import {
  applyPlannedWrites, displayPreview, objectAt, readConfiguration, writeJsonConfiguration, writeOpenCodeJsonc,
  writeTextConfiguration,
  type PlannedWrite,
} from "./init-files.ts";
import {
  isMcpAgent, isMcpHook, mcpHook, planClaudeMcpServer, planCodexMcpServer,
} from "../mcp-hook/config.ts";

/** Self-contained hook bundle: core plus one adapter, stdin to stdout. */
const HOOK_BUNDLE = (agent: AgentName) => fileURLToPath(new URL(`../../dist/hook/${agent}.mjs`, import.meta.url));

function isBundlePath(value: string, agent: AgentName): boolean {
  return /[\\/]dist[\\/]hook[\\/]/.test(value) && value.endsWith(`${agent}.mjs`);
}

function shellQuote(value: string): string {
  return process.platform === "win32"
    ? `"${value}"`
    : "'" + value.replace(/'/g, "'\\''") + "'";
}

const COMMAND = (agent: AgentName) => "node " + shellQuote(HOOK_BUNDLE(agent));

function arrayAt(parent: Record<string, unknown>, key: string): unknown[] {
  const value = parent[key];
  if (value === undefined) return (parent[key] = []) as unknown[];
  if (!Array.isArray(value)) throw new Error("Invalid hook configuration.");
  return value;
}

function upsertGroupedHook(
  config: Record<string, unknown>,
  eventName: string,
  matcher: string,
  agent: AgentName,
  hook: Record<string, unknown>,
): boolean {
  const hooks = objectAt(config, "hooks");
  const eventHooks = arrayAt(hooks, eventName) as Record<string, unknown>[];
  let group = eventHooks.find((entry) => entry?.matcher === matcher);
  if (!group) {
    group = { matcher, hooks: [] };
    eventHooks.push(group);
  }
  if (!Array.isArray(group.hooks)) throw new Error("Invalid hook configuration.");
  const entries = group.hooks as Record<string, unknown>[];
  const command = COMMAND(agent);
  const old = entries.findIndex((entry) => entry?.command === command || isCanaryHook(entry, agent));
  if (old >= 0) entries[old] = hook;
  else entries.push(hook);
  return old >= 0;
}

function upsertFlatHook(
  config: Record<string, unknown>,
  eventName: string,
  agent: AgentName,
  hook: Record<string, unknown>,
): boolean {
  const hooks = objectAt(config, "hooks");
  const eventHooks = arrayAt(hooks, eventName) as Record<string, unknown>[];
  const command = COMMAND(agent);
  const old = eventHooks.findIndex((entry) => entry?.command === command || isCanaryHook(entry, agent));
  if (old >= 0) eventHooks[old] = hook;
  else eventHooks.push(hook);
  return old >= 0;
}

function isCanaryHook(entry: Record<string, unknown>, agent: AgentName): boolean {
  const args = Array.isArray(entry?.args) ? entry.args.map(String) : [];
  const suffix = "hook --agent " + agent;
  const command = typeof entry?.command === "string" ? entry.command : "";
  const isBundle = args.some((arg) => isBundlePath(arg, agent)) || isBundlePath(command, agent);
  const isLegacy = args.slice(-3).join(" ") === suffix
    || command === "canary hook --agent " + agent
    || command.endsWith(" " + suffix);
  return isBundle || isLegacy
    || (agent !== "cursor" && agent !== "gemini-cli" && agent !== "opencode" && isMcpHook(entry));
}

function planClaude(root: string, useMcpTool = false): PlannedWrite {
  const path = ".claude/settings.json";
  const hook = useMcpTool ? mcpHook("claude-code") : {
    type: "command",
    command: "node",
    args: [HOOK_BUNDLE("claude-code")],
    timeout: 10,
    onFailure: "block",
  };
  const group = { matcher: "Bash|PowerShell", hooks: [hook] };
  return writeJsonConfiguration(root, path, (config) => {
    return upsertGroupedHook(config, "PreToolUse", "Bash|PowerShell", "claude-code", hook);
  }, { hooks: { PreToolUse: [group] } });
}

function planCodex(root: string, useMcpTool = false): PlannedWrite {
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

function planCursor(root: string): PlannedWrite {
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

function planGemini(root: string): PlannedWrite {
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

function planOpenCode(root: string): PlannedWrite[] {
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
  const plugin = header + `import { execFileSync } from "node:child_process"\nimport { Plugin } from "@opencode/plugin"\n\nexport default Plugin.define({\n  id: "canary",\n  async setup(ctx) {\n    await ctx.permission.hook("evaluate", async (event) => {\n      if (event.action !== "shell") return\n      try {\n        const output = execFileSync("node", [${JSON.stringify(HOOK_BUNDLE("opencode"))}], {\n          input: JSON.stringify({ action: event.action, resources: event.resources }),\n          encoding: "utf8",\n          stdio: ["pipe", "pipe", "ignore"],\n          cwd: ctx.location.directory,\n          timeout: 10000,\n          windowsHide: true,\n        })\n        if (!output.trim()) return\n        const result = JSON.parse(output) as { effect?: "ask" | "deny"; message?: string }\n        if (result.effect === "deny" || result.effect === "ask") {\n          event.effect = result.effect\n          event.message = result.message\n        }\n      } catch {\n        // The hook is a guardrail; command failures leave OpenCode's decision unchanged.\n      }\n    })\n  },\n})\n`;
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

function failOpenNotice(agent: AgentName): void {
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

export function initAgent(agent: AgentName, root: string, options: { mcpTool?: boolean } = {}): void {
  const useMcpTool = options.mcpTool === true;
  if (useMcpTool && !isMcpAgent(agent)) {
    throw new Error("The MCP tool prototype supports Claude Code and Codex only.");
  }
  let writes: PlannedWrite[];
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
