# Agent adapters

| | |
| --- | --- |
| Status | Draft for the MVP (P0). Not implemented. Not tested against live agents. |
| Requirements | CAN-F-19, CAN-F-21, CAN-I-03, CAN-I-05 to CAN-I-07 in the [SRS](../SRS.md) |
| Decision | [ADR-0005](../decisions/0005-shared-core-with-thin-agent-adapters.md) |
| Date | 2026-11-22 |

Each adapter reads one hook event from its agent, passes the shell command, the working directory, and the project root to the core, and writes the core's decision back in the agent's format. The rules themselves are in [policy.md](policy.md).

Every field name, event name, and file path below is copied from the cited documentation. If a name is not in a cited source, it is not used. Every example below is a design; none has been run against a live agent yet (CAN-T-05).

## Summary

| | Claude Code | Codex | Cursor | Gemini CLI | OpenCode |
| --- | --- | --- | --- | --- | --- |
| Hook mechanism | Command hook | Command hook | Command hook | Command hook | Server plugin in TypeScript |
| Event | `PreToolUse` [S1] | `PreToolUse` [S8] | `preToolUse` [S9] | `BeforeTool` [S11] | `ctx.permission.hook("evaluate", ...)` [S14] |
| Matcher | `Bash\|PowerShell` [S1] | `^Bash$` [S8] | `Shell` [S9] | `run_shell_command` [S11][S25] | `event.action === "shell"` [S14][S16] |
| Command field | `tool_input.command` [S1] | `tool_input.command` [S8] | `tool_input.command` [S9] | `tool_input.command` [S25] | `event.resources` [S14] |
| Fail closed on hook failure | `onFailure: "block"` [S1] | Not available [S8] | `failClosed: true` [S9] | Not available [S10] | Not verified (Q5) |
| Config file written by `init` | Plugin `hooks/hooks.json` or `.claude/settings.json` [S1] | Plugin `hooks/hooks.json` or `.codex/hooks.json` [S8] | `.cursor/hooks.json` [S9] | Extension `hooks/hooks.json` or `.gemini/settings.json` [S10][S12] | `.opencode/plugins/canary/` and `opencode.jsonc` [S13][S16] |
| Barrier layer `init` proposes | Permission deny rules [S2] | — | — | Policy engine `deny` rules [S26] | Permission `deny` rules [S16] |

## Claude Code

**Configuration.** As a plugin, Canary ships `hooks/hooks.json` at the plugin root [S4]. The exec form with `node` and a script path works on every platform, including Windows, where `.cmd` shims cannot be spawned without a shell [S1].

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/dist/hook.js", "--agent", "claude-code"],
            "timeout": 10,
            "onFailure": "block"
          }
        ]
      }
    ]
  }
}
```

- The matcher must include `PowerShell`: on Windows without Git Bash, Claude Code does not register the `Bash` tool, and a hook that matches only `Bash` never fires [S1].
- `onFailure: "block"` makes a crash, a timeout, or invalid output block the call. It requires Claude Code v2.1.295 or later [S1].
- Hooks in settings files do not run in an interactive session until the user accepts the workspace trust dialog [S1].

**Input read.** `tool_name`, `tool_input.command`, `cwd`, `permission_mode` [S1]. The project root comes from `CLAUDE_PROJECT_DIR` [S1].

**Block output.** Exit `0` and print:

```json
{
  "systemMessage": "<policy message>",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "<policy message>"
  }
}
```

For `"deny"`, `permissionDecisionReason` is shown to Claude [S1]; `systemMessage` is shown to the user [S1].

**Warn output.** Exit `0` with `systemMessage` and `hookSpecificOutput.additionalContext`, and no `permissionDecision`, so the normal permission flow applies [S1].

**Allow output.** Exit `0` with no stdout. Canary MUST NOT return `permissionDecision: "allow"`, because that skips the permission prompt [S1] and Canary's job is only to stop the irreversible, not to approve.

**Notes.**

- Exit code `1` without valid JSON is a non-blocking error [S1]; the adapter never uses it.
- Deny and ask rules are still evaluated whatever the hook returns [S1][S2], so Canary cannot weaken the user's own rules.
- Strings are capped at 10,000 characters [S1]; every policy message is far shorter.

## Codex

**Configuration.** As a plugin, Codex reads `hooks/hooks.json` from the plugin root by default, or the `hooks` entry of `.codex-plugin/plugin.json` [S8]. The project-level alternative is `.codex/hooks.json` in a trusted project [S8].

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$PLUGIN_ROOT/dist/hook.js\" --agent codex",
            "timeout": 10,
            "statusMessage": "Canary: checking command"
          }
        ]
      }
    ]
  }
}
```

- Codex sets `PLUGIN_ROOT`, and also `CLAUDE_PLUGIN_ROOT` for compatibility [S8].
- Non-managed hooks must be reviewed and trusted before they run, and a plugin update that changes a bundled script needs a new review [S8].
- `^Bash$` covers shell commands and unified exec (`exec_command`) [S8].

**Input read.** `tool_name`, `tool_input.command`, `cwd` [S8].

**Block output.** Exit `0` and print:

```json
{
  "systemMessage": "<policy message>",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "<policy message>"
  }
}
```

**Warn output.** `systemMessage` and `hookSpecificOutput.additionalContext` [S8].

**Pitfalls that make Codex run the command anyway** [S8]:

- returning `permissionDecision: "ask"`, legacy `decision: "approve"`, `continue`, `stopReason`, or `suppressOutput` from `PreToolUse` marks the hook run as failed and continues the tool call;
- a `PreToolUse` error, timeout, or malformed response can let the tool run;
- `write_stdin` to an existing unified-exec session does not run `PreToolUse` again.

The adapter MUST emit only the fields shown above. The fail-open behavior on errors is a documented residual risk (Q6).

## Cursor

**Configuration.** `canary init --agent cursor` writes `.cursor/hooks.json` in the project root [S9]. Project hooks run from the project root, so the command path is relative to it [S9].

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "command": "node .cursor/hooks/canary-hook.js --agent cursor",
        "matcher": "Shell",
        "timeout": 10,
        "failClosed": true
      }
    ]
  }
}
```

- `failClosed: true` blocks the action when the hook crashes, times out, exits non-zero, or prints nothing [S9].
- Project hooks run only in trusted workspaces [S9].
- `beforeShellExecution` is an alternative event with the same `permission` output [S9]. The MVP uses `preToolUse` only, to avoid running twice.

**Input read.** `tool_name`, `tool_input.command`, `tool_input.working_directory`, `cwd`, `workspace_roots` [S9]. The project root comes from `CURSOR_PROJECT_DIR` [S9]. The adapter MUST NOT read `user_email` [S9].

**Block output.** Exit `0` and print:

```json
{
  "permission": "deny",
  "user_message": "<policy message>",
  "agent_message": "<policy message>"
}
```

**Allow output.** `{ "permission": "allow" }`. For permission hooks, invalid JSON or a response that does not match the schema blocks the action [S9], so the adapter MUST always print a valid object.

**Warn output.** Cursor documents `ask` as accepted but "not enforced for preToolUse today", and `user_message` and `agent_message` as messages for denied actions [S9]. The adapter therefore returns `allow` and writes the warning only to `canary/hook.log` (Q8).

## Gemini CLI

**Configuration.** As an extension, hooks live in `hooks/hooks.json` in the extension directory, not in `gemini-extension.json` [S12]. `${extensionPath}` is substituted in that file [S12]. The project-level alternative is `.gemini/settings.json` [S10].

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "run_shell_command",
        "hooks": [
          {
            "name": "canary",
            "type": "command",
            "command": "node \"${extensionPath}${/}dist${/}hook.js\" --agent gemini-cli",
            "timeout": 10000,
            "description": "Blocks irreversible shell commands"
          }
        ]
      }
    ]
  }
}
```

- `timeout` is in milliseconds on Gemini CLI [S10].
- Gemini CLI fingerprints project hooks and warns when a hook's name or command changes [S10].

**Input read.** `tool_name`, `tool_input.command`, `tool_input.dir_path`, `cwd` [S11][S25]. The project root comes from `GEMINI_PROJECT_DIR` [S10].

**Block output.** Exit `0` and print:

```json
{
  "decision": "deny",
  "reason": "<policy message>",
  "systemMessage": "<policy message>"
}
```

`reason` is sent to the agent as a tool error and the turn continues [S11].

**Warn output.** `{ "systemMessage": "<policy message>" }` [S11].

**Pitfalls.** Any text on stdout that is not the single JSON object breaks parsing, and the CLI then defaults to allow [S10]. Exit codes other than `0` and `2` are warnings and the action proceeds [S10]. The adapter MUST write diagnostics only to stderr.

**Barrier layer.** The Gemini CLI policy engine supports `deny` rules on `run_shell_command` with `commandPrefix` [S26]. Rules with no `modes` are always active, including in `yolo` mode [S26]. Workspace policy files are disabled and user policies live in `~/.gemini/policies/` [S26]. Because that is outside the repository, `canary init --agent gemini-cli` prints the policy file as a manual step and does not write it.

## OpenCode

**Configuration.** `canary init --agent opencode` writes a plugin directory under `.opencode/plugins/`, which OpenCode loads automatically [S13], and adds `deny` permission rules to `opencode.jsonc` [S16].

```ts
// .opencode/plugins/canary/index.ts (design sketch)
import { Plugin } from "@opencode/plugin"
import { evaluate } from "@eyesopen21/canary/core"

export default Plugin.define({
  id: "canary",
  async setup(ctx) {
    await ctx.permission.hook("evaluate", async (event) => {
      if (event.action !== "shell") return
      const result = evaluate({
        commands: event.resources,
        projectRoot: ctx.location.directory,
      })
      if (result.decision === "block") {
        event.effect = "deny"
        event.message = result.message
      } else if (result.decision === "warn") {
        event.effect = "ask"
        event.message = result.message
      }
    })
  },
})
```

- `evaluate` hooks run for `allow` and `ask` decisions; an explicit configured `deny` is final and does not invoke the hook [S14].
- A hook may change `effect` to `allow`, `ask`, or `deny`, and `message` becomes the denial reason [S14].
- Canary never sets `effect = "allow"`.

**Barrier layer.** `init` adds rules such as `{ "action": "shell", "resource": "git push --force *", "effect": "deny" }` to `opencode.jsonc` [S16]. OpenCode's shell scanner applies these checks across Bash, Zsh, POSIX `sh`, and PowerShell [S16].

**Open points.** Whether `event.resources` holds the full command text for `shell` is not stated in [S14] and must be confirmed (Q5). If it holds only a proposed prefix pattern, the adapter must use `ctx.tool.hook("execute.before", ...)` instead, whose blocking behavior in V2 is also unconfirmed (Q5).

## Shared rules for all adapters

- Print exactly one JSON object on stdout, or nothing where the agent allows it. Write diagnostics to stderr only.
- Never return an explicit `allow` where the agent treats it as an approval that skips prompts (Claude Code, Codex, OpenCode).
- Never read or log identity fields, environment values, or the full command.
- Pass the same policy message to the user and to the agent, without rewording.
