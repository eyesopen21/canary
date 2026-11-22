# Agent adapters

| | |
| --- | --- |
| Status | Implemented in this repository. Adapter contracts and package layouts are covered by repository tests, but no adapter has been verified in a live session with its agent. MVP acceptance is incomplete. |
| Requirements | CAN-F-19, CAN-F-21, CAN-I-03, CAN-I-05 to CAN-I-07 in the [SRS](../SRS.md) |
| Decision | [ADR-0005](../decisions/0005-shared-core-with-thin-agent-adapters.md) |
| Date | 2026-11-22 |

Each adapter reads one hook event from its agent, passes the shell command, the working directory, and the project root to the core, and writes the core's decision back in the agent's format. The rules themselves are in [policy.md](policy.md).

Every field name and event name below is copied from the cited documentation. The repository has local adapter and packaging implementations, but live behavior remains unverified for all five agents (CAN-T-05). Do not treat config generation or unit tests as proof that an agent loads or enforces its hook.

## Summary

| | Claude Code | Codex | Cursor | Gemini CLI | OpenCode |
| --- | --- | --- | --- | --- | --- |
| Hook mechanism | Command hook | Command hook | Command hook | Command hook | Server plugin in TypeScript |
| Event | `PreToolUse` [S1] | `PreToolUse` [S8] | `preToolUse` [S9] | `BeforeTool` [S11] | `ctx.permission.hook("evaluate", ...)` [S14] |
| Matcher | `Bash\|PowerShell` [S1] | `^Bash$` [S8] | `Shell` [S9] | `run_shell_command` [S11][S25] | `event.action === "shell"` [S14][S16] |
| Command field | `tool_input.command` [S1] | `tool_input.command` [S8] | `tool_input.command` [S9] | `tool_input.command` [S25] | `event.resources` [S14] |
| Fail closed on hook failure | `onFailure: "block"` [S1] | Not available [S8] | `failClosed: true` [S9] | Not available [S10] | Not verified (Q19) |
| Config file written by `init` | `.claude/settings.json` [S1] | `.codex/hooks.json` [S8] | `.cursor/hooks.json` [S9] | `.gemini/settings.json` [S10] | `.opencode/plugins/canary/` and `opencode.jsonc` [S13][S16] |
| Barrier layer `init` proposes | Permission deny rules [S2] | — | — | Policy engine `deny` rules [S26] | Permission `deny` rules [S16] |

## Built JavaScript runtime

The shipped `bin/canary.js` loads `dist/cli/entry.js` unless `CANARY_DEV=1` is explicitly set. Every command hook instead invokes `node` with that agent's self-contained bundle `dist/hook/<agent>.mjs`: the bundle contains the core and only its own adapter, imports only `node:` built-ins, reads stdin, writes stdout, and does not pass through `cli/main`. `scripts/build.mjs` fails the build if a relative import remains in a bundle. `canary init` writes an absolute path to that bundle in project hook configurations; Claude Code uses `command: "node"` plus an `args` array so it spawns Node directly in exec form [S1]. Its OpenCode plugin uses `execFileSync(process.execPath, ...)`. Generated hooks do not invoke a `canary` command from `PATH`. Codex and Cursor keep a single shell `command` string: [S8] documents no `command` + `args` exec form for Codex, and Cursor's hook commands are run through a shell chosen by the desktop app [S9]. See the per-agent sections below for the resulting cost.

The Claude Code, Codex, and Gemini CLI GitHub install instructions define package files and hook locations but no build-on-install step [S4][S8][S12]. Canary therefore commits `dist/` so a repository install or `git archive HEAD` includes the hook runtime; see [ADR-0007](../decisions/0007-commit-built-javascript-for-marketplace-installs.md).

## Opt-in MCP tool prototype (proposed, not the default)

The default `canary init --agent claude-code|codex` path writes a command hook and is unchanged. Only `--mcp-tool` may use the experimental code in `src/mcp-hook/`. [ADR-0008](../decisions/0008-mcp-tool-hooks.md) owns this decision and keeps `status: proposed`. Its documented limits, all still open, are:

* **Fail-closed without a connection is not guaranteed.** Claude Code's `onFailure: "block"` for an `mcp_tool` hook needs v2.1.328; Codex documents no fail-closed MCP hook option and proceeds when the server is missing, unavailable, or times out [S1][S8].
* **First command of a session may be unchecked on Codex**, which uses an already-connected server; Claude Code instead waits on a connecting server at `PreToolUse`, bounded by its hooks and MCP timeouts [S1][S8].
* **Events before server availability cannot be checked by this tool.** The launch `SessionStart` happens before MCP servers are available and Claude Code skips MCP `SessionStart` hooks, so the prototype has no MCP call at session launch [S1].
* **Attack surface grows.** The local server parses JSON-RPC, lives for the session, reads the evaluator's environment and repository paths, and is exposed to direct model calls. It exposes one read-only tool with no shell execution and no network, but that does not remove local-process trust risk [S5][S7].
* **ADR-0003 still applies** to every result: text output only, containing the existing sanitized policy JSON or `{}`, never a command, secret, environment value, host, path, or exception text [S6].
* **Hook inputs can carry secrets.** The tool accepts `tool_input.command` as arbitrary text; neither host documents pre-call redaction [S1][S8]. Q22 in [open-questions.md](../open-questions.md#open-questions-about-the-agents) is **not solved** and remains a shipping blocker for any no-secrets claim.

No live Claude Code or Codex session was tested. First-command timing, disconnected-server behavior, connection lifetime, and tool visibility remain open [Q21][Q23]; protocol conformance of the prototype remains open [Q26].

## Claude Code

**Configuration.** The package manifest `.claude-plugin/plugin.json` points to `hooks/claude-code.json`, which registers the `PreToolUse` hook. `canary init --agent claude-code` writes `.claude/settings.json` in a project. Both invoke Node with the built `dist/hook/claude-code.mjs`; the package commits `dist/` because GitHub marketplace installs do not run a Canary build step (see [ADR-0007](../decisions/0007-commit-built-javascript-for-marketplace-installs.md)). The generated project configuration stores the absolute path to that bundle.

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
            "args": ["${CLAUDE_PLUGIN_ROOT}/dist/hook/claude-code.mjs"],
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
- `command` plus `args` uses exec form: Claude Code spawns `node` directly and passes the build path as one argument, including on Windows [S1].
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

**Configuration.** The package manifest `.codex-plugin/plugin.json` points to `hooks/codex.json`. `canary init --agent codex` writes `.codex/hooks.json` in the project [S8]. The packaged hook invokes `node` with `${PLUGIN_ROOT}/dist/hook/codex.mjs`; the generated project command invokes Node with an absolute path to the installed package's same bundle.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/dist/hook/codex.mjs\"",
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
- Codex documents a `command` string for command hooks but no `command` + `args` exec form [S8], unlike Claude Code [S1]. Canary therefore keeps one shell string for the Codex hook; on Windows that string starts an extra shell process before Node. This is a qualitative cost only; no numeric figure is claimed here, and no Codex hook behavior was changed.

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
        "command": "node \"<absolute Canary package path>/dist/hook/cursor.mjs\"",
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
- On Windows, the Cursor desktop app runs hook commands through PowerShell [S9]. That shell layer and its startup cost are chosen by Cursor and are outside Canary's control; Canary does not change the Cursor hook command because of it.

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

**Configuration.** As an extension, hooks live in `hooks/hooks.json` in the extension directory, not in `gemini-extension.json` [S12]. `${extensionPath}` is substituted in that file [S12]. The project-level alternative is `.gemini/settings.json` [S10]. The extension includes committed build output because Gemini CLI copies the extension on install and does not run a Canary build step [S12]. `canary init` writes a project command with an absolute path to the installed package build.

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
            "command": "node \"${extensionPath}${/}dist${/}hook${/}gemini-cli.mjs\"",
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

**Configuration.** `canary init --agent opencode` writes a plugin under `.opencode/plugins/canary/` and adds permission rules to `opencode.jsonc` [S13][S16]. The generated plugin starts Node in exec form with the absolute path to `dist/hook/opencode.mjs` and passes the synthetic permission event on stdin; it does not pass `hook --agent` arguments. The checked-in example under `.opencode/plugins/canary/` uses the same bundle through `execFileSync`.

The generated plugin calls the bundle with `execFileSync(process.execPath, [bundlePath], ...)`, passing the event on stdin, and applies a returned `ask` or `deny` decision to the V2 permission event. This keeps policy in the shared core and avoids a `canary` executable or Windows `.cmd` shim on `PATH`.

- `evaluate` hooks run for `allow` and `ask` decisions; an explicit configured `deny` is final and does not invoke the hook [S14].
- A hook may change `effect` to `allow`, `ask`, or `deny`, and `message` becomes the denial reason [S14].
- Canary never sets `effect = "allow"`.

**Barrier layer.** `init` adds rules such as `{ "action": "shell", "resource": "git push --force *", "effect": "deny" }` to `opencode.jsonc` [S16]. OpenCode's shell scanner applies these checks across Bash, Zsh, POSIX `sh`, and PowerShell [S16].

**Open points.** Whether `event.resources` holds the full command text for `shell` is not stated in [S14] and must be confirmed (Q5). The live plugin and its fail-closed behavior have not been verified; see Q19.

## Shared rules for all adapters

- Print exactly one JSON object on stdout, or nothing where the agent allows it. Write diagnostics to stderr only.
- Never return an explicit `allow` where the agent treats it as an approval that skips prompts (Claude Code, Codex, OpenCode).
- Never read or log identity fields, environment values, or the full command.
- Pass the same policy message to the user and to the agent, without rewording.
