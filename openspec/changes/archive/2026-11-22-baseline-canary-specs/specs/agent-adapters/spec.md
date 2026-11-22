# Spec Delta

## Purpose

Defines how each of the five agent hooks receives a shell command, calls the shared core, and returns its decision in that agent's documented format, without changing policy or weakening the agent's own permission rules.

## ADDED Requirements

### Requirement: Package hook manifest locations
The package SHALL register Claude Code through `hooks/claude-code.json` referenced by `.claude-plugin/plugin.json`, Codex through `hooks/codex.json` referenced by `.codex-plugin/plugin.json`, and Gemini CLI through `hooks/hooks.json` referenced by `gemini-extension.json`.

#### Scenario: Package points to per-agent hook manifests
- **WHEN** the package manifests are loaded
- **THEN** Claude Code and Codex point to their respective hook files, and Gemini CLI loads `hooks/hooks.json`

### Requirement: Selected project configuration is previewed
`canary init` SHALL write configuration only for the selected agent. The project paths SHALL be `.claude/settings.json`, `.codex/hooks.json`, `.cursor/hooks.json`, `.gemini/settings.json`, or `.opencode/plugins/canary/` with `opencode.jsonc`. Before writing, it SHALL preview the full diff of Canary changes, omit unchanged existing values, and redact sensitive values.

#### Scenario: Selected agent configuration is previewed before writing
- **WHEN** `canary init --agent <name>` is run
- **THEN** it previews the full diff of Canary changes, omits unchanged existing values, redacts sensitive values, and writes configuration only for that selected agent

### Requirement: Hook executable is available on PATH
Generated hooks SHALL invoke the installed `canary` executable. The setup documentation SHALL state that the global npm bin directory must be on the agent's `PATH`.

#### Scenario: Hook executable is unavailable on PATH
- **WHEN** an agent starts a generated project hook without the global npm bin directory on `PATH`
- **THEN** the setup documentation identifies `PATH` as a prerequisite for invoking Canary

### Requirement: Core and adapter boundary
Each adapter SHALL read only the fields documented for its agent, pass the command, working directory, and project root to the shared core, and write the core's decision back in the agent's format. Policy logic SHALL live in the core, not in an adapter. Adapters SHALL NOT read identity fields, environment values, or the full command into logs.

#### Scenario: Adapter delegates the decision
- **WHEN** an adapter receives a hook event for a shell command
- **THEN** it forwards the command to the core and returns the core's decision unchanged

#### Scenario: Cursor identity field is ignored
- **WHEN** a Cursor hook event contains `user_email`
- **THEN** the adapter neither reads nor stores that field

### Requirement: Claude Code adapter output
The Claude Code adapter SHALL match `Bash` and `PowerShell`, read `tool_name`, `tool_input.command`, `cwd`, and `permission_mode`, and answer with exit code `0` and JSON. A block SHALL use `hookSpecificOutput.permissionDecision: "deny"` with `permissionDecisionReason` and `systemMessage`; a warn SHALL use `hookSpecificOutput.additionalContext` and `systemMessage` with no `permissionDecision`; an allow SHALL produce no stdout and SHALL NOT return `permissionDecision: "allow"`.

#### Scenario: Claude Code block
- **WHEN** the core returns block for a Claude Code command
- **THEN** the adapter prints a deny decision with the policy message in `permissionDecisionReason` and `systemMessage`

#### Scenario: Claude Code allow
- **WHEN** the core returns allow for a Claude Code command
- **THEN** the adapter exits `0` with empty stdout and does not return an explicit allow decision

### Requirement: Codex adapter output
The Codex adapter SHALL match `^Bash$`, read `tool_name`, `tool_input.command`, and `cwd`, and use the same JSON decision shape as the Claude Code adapter. It SHALL emit only the documented fields and SHALL NOT return `permissionDecision: "ask"`, legacy `decision: "approve"`, `continue`, `stopReason`, or `suppressOutput`.

#### Scenario: Codex block
- **WHEN** the core returns block for a Codex command
- **THEN** the adapter prints a deny decision with the policy message in `permissionDecisionReason` and `systemMessage`

#### Scenario: No fail-open field
- **WHEN** the core returns warn for a Codex command
- **THEN** the adapter emits `additionalContext` and `systemMessage` and no field that marks the hook run as failed

### Requirement: Cursor adapter output
The Cursor adapter SHALL match `Shell`, read `tool_name`, `tool_input.command`, `tool_input.working_directory`, `cwd`, and `workspace_roots`, and print exactly one valid JSON object. A block SHALL use `permission: "deny"` with `user_message` and `agent_message`; an allow SHALL use `permission: "allow"`. A warn SHALL return `permission: "allow"` and record only the rule ID and decision in the local log.

#### Scenario: Cursor block
- **WHEN** the core returns block for a Cursor command
- **THEN** the adapter prints a deny permission object with the same message for the user and the agent

#### Scenario: Cursor warn is log only
- **WHEN** the core returns warn for a Cursor command
- **THEN** the adapter returns allow and writes no warning message to either the agent or the user

### Requirement: Gemini CLI adapter output
The Gemini CLI adapter SHALL match `run_shell_command`, read `tool_name`, `tool_input.command`, `tool_input.dir_path`, and `cwd`, and print a single JSON object on stdout with diagnostics only on stderr. A block SHALL use `decision: "deny"` with `reason` and `systemMessage`; a warn SHALL use `systemMessage` with no decision.

#### Scenario: Gemini CLI block
- **WHEN** the core returns block for a Gemini CLI command
- **THEN** the adapter prints exactly one JSON object with `decision: "deny"` and the policy message

#### Scenario: Diagnostics stay on stderr
- **WHEN** the adapter needs to report an internal error
- **THEN** the text goes to stderr and stdout stays either empty or a single valid JSON object

### Requirement: OpenCode adapter output
The OpenCode adapter SHALL use `ctx.permission.hook("evaluate", ...)` for the `shell` action and SHALL set `event.effect` to `deny` with `event.message` when the core blocks, and to `ask` with `event.message` when the core warns. It SHALL NOT set `event.effect` to `allow`.

#### Scenario: OpenCode block
- **WHEN** the core returns block for a shell permission event
- **THEN** the adapter sets `event.effect` to `deny` and `event.message` to the policy message

#### Scenario: OpenCode warn
- **WHEN** the core returns warn for a shell permission event
- **THEN** the adapter sets `event.effect` to `ask` and never to `allow`

### Requirement: Fail-closed setup
`canary init` SHALL enable `onFailure: "block"` for Claude Code and `failClosed: true` for Cursor. For Codex and Gemini CLI, which document no such setting, `init` SHALL print that a hook failure can let the action run. For OpenCode, where fail-closed behavior is unverified and generated plugin errors leave the permission event unchanged, `init` SHALL state that users must not assume a hook failure blocks the command. These settings and notices do not establish live-agent verification.

#### Scenario: Claude Code fail closed
- **WHEN** `canary init --agent claude-code` writes the hook configuration
- **THEN** the configuration contains `onFailure: "block"`

#### Scenario: Gemini CLI fail-open notice
- **WHEN** `canary init --agent gemini-cli` runs
- **THEN** it prints that a hook failure lets the command run

#### Scenario: OpenCode fail-closed status notice
- **WHEN** `canary init --agent opencode` runs
- **THEN** it prints that fail-closed behavior is unverified and must not be assumed

### Requirement: Message fidelity across adapters
Every adapter SHALL pass the same policy message to the agent and to the user without rewording, using the fields each agent documents for that purpose. When an agent field has a length limit, the adapter SHALL truncate at the end and append `…`.

#### Scenario: Same text for both audiences
- **WHEN** an adapter delivers a block message to Claude Code
- **THEN** `permissionDecisionReason` and `systemMessage` contain the same policy text

#### Scenario: Truncation at a field limit
- **WHEN** a policy message exceeds an agent field's character limit
- **THEN** the adapter truncates at the end and appends `…`
