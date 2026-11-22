---
status: proposed
date: 2026-11-22
decision-makers: Canary maintainers
---

# Run Claude Code and Codex hooks through a stdio MCP server

## Context and Problem Statement

Canary's Claude Code and Codex command hooks start Node for every matched tool call. MCP tool hooks can call a tool on an MCP server that is already connected, which could keep one Canary process alive for a session and avoid starting a process for every command [S1][S8].

This is a proposal, not an accepted decision. The `--mcp-tool` setup option and `canary mcp-server` command are an opt-in prototype so the maintainer can review behavior and measurements before deciding whether it ships. The normal `canary init --agent claude-code|codex` path remains a command hook.

The hosts have different failure behavior. Claude Code can set `onFailure: "block"` for an `mcp_tool` hook starting in v2.1.328. On a blocking event such as `PreToolUse`, it waits for a connecting server within the MCP and hook timeouts; if the server is still unavailable, the hook fails [S1]. Codex uses an existing MCP connection and does not start or reconnect a server for a hook. A missing server, unavailable tool, error, or timeout does not block the operation [S8].

The proposed server evaluates the same deterministic hook policy [ADR-0001][ADR-0005]. It returns one text result containing the existing adapter JSON, or `{}` for allow. It performs no command execution and no network access. The standard MCP stdio transport still starts a local process for the agent session; the intended saving is one long-lived server instead of one new Node process per hook call.

The prototype targets MCP protocol version **2026-07-28** [S5][S6][S7], the version catalogued in [sources.md](../sources.md#protocols-and-standards) and used by the local benchmark. It also accepts two older version strings and echoes the requested version. A 2026-11-22 re-read of the primary sources clarified two points. First, `resultType: "complete"` in `tools/list` and `tools/call` results is part of the catalogued 2026-07-28 response shape [S6], so its presence is not itself a deviation. Second, the catalogued revision has **no `initialize` handshake**: version, identity and capabilities are carried in per-request `_meta`, servers `MUST` implement `server/discover`, and an unsupported version returns `-32022`; `initialize` is a legacy (2025-11-25 and earlier) method and lacks the required `_meta` [S5, *Versioning and Compatibility*]. The prototype uses that legacy `initialize` negotiation and does not implement `_meta` or `server/discover`, so conformance to the catalogued revision is not established; see [Q26](../open-questions.md#open-questions-about-the-agents). Its implementation is confined to `src/mcp-hook/`: `server.ts` is the stdio JSON-RPC tool server and `config.ts` builds the opt-in server and `mcp_tool` configuration. `src/cli/main.ts` dispatches the `mcp-server` command to that module, and `src/cli/init.ts` calls `config.ts` only when `--mcp-tool` is set; the default `canary init --agent <name>` path writes a command hook and calls no MCP function.

## Decision Drivers

* Avoid a Node process start for every Claude Code and Codex shell tool call.
* Preserve the current allow, warn, and block policy and each agent's response contract.
* Keep the command-hook setup as the default.
* Fail closed when the host supports that behavior and state any fail-open path plainly.
* Apply [ADR-0003](0003-findings-without-secret-values.md) to every result, including errors.
* Keep MCP inputs to the fields needed for evaluation and do not transmit environment variables, credentials, session identifiers, or transcript paths.
* Do not describe the prototype as live-agent verified or as a complete security boundary.

## Considered Options

1. **Keep command hooks.** The existing design is simple and keeps each invocation isolated, but it starts a Node process for each matching command.
2. **Use one stdio MCP server per agent session (proposed).** The host launches Canary once for the MCP connection and invokes its tool synchronously from `PreToolUse`. This removes per-command process startup but adds an MCP server process and protocol surface.
3. **Use a background daemon or network endpoint.** This would require lifecycle management, local IPC/network security, and recovery behavior beyond the current hook interfaces. It is not part of this prototype.

## Decision Outcome

**Proposed option:** keep command hooks as the default and provide the experimental configuration only through `canary init --agent claude-code --mcp-tool` or `canary init --agent codex --mcp-tool`. Those commands add a stdio server configuration and replace the matching Canary `PreToolUse` handler with an `mcp_tool` handler. The server exposes only `canary_pre_tool_use` and returns policy output only. A human maintainer must decide whether to ship this proposal.

### Failure and first-command behavior

* **Claude Code, connected server:** the `PreToolUse` hook calls Canary over the existing MCP connection. A connecting server may add first-call latency while Claude Code waits, bounded by the hook timeout and `MCP_TIMEOUT` [S1].
* **Claude Code, absent or failed server:** on `PreToolUse`, the tool call fails. `onFailure: "block"` is the fail-closed setting, but the `mcp_tool` form requires Claude Code v2.1.328 or later [S1]. Earlier versions cannot be promised to fail closed. Canary does not configure an MCP `SessionStart` hook: the launch `SessionStart` occurs before MCP servers are available and Claude Code skips such hooks [S1]. Therefore there is no Canary MCP call at session launch; the first shell command reaches `PreToolUse` after MCP startup, waits if the server is connecting, and blocks on a connection failure only when the required Claude version honors `onFailure`.
* **Codex, absent or failed server:** the operation proceeds. Codex documents no fail-closed MCP hook option; missing servers, unavailable tools, errors, and timeouts do not block [S8]. A Codex session's first command can therefore run without Canary if its MCP server is not yet connected. Later commands are checked only while the server remains available. This is a residual security gap, not fixed by the prototype.

### Input and secret handling

The MCP hook templates pass only `agent`, `tool_name`, `tool_input.command`, and `cwd`; they omit session IDs, transcripts, permission modes, and environment values. The MCP tool validates those fields and imposes size limits. However, the `command` field is arbitrary shell text and **can contain a credential or other secret literal**. Claude Code and Codex templates substitute event fields but provide no documented pre-call redaction or transformation [S1][S8]. The prototype must therefore not claim that its tool inputs cannot carry secrets. It never logs or echoes the command, but the raw value is transmitted over the local MCP stdio connection to the Canary server. Whether that data flow is acceptable, or whether a safe input interface can preserve policy coverage, remains open [Q22](../open-questions.md#open-questions-about-the-agents).

### MCP results and ADR-0003

ADR-0003 applies to every MCP tool result. A successful result contains only the existing sanitized policy JSON, or `{}` for allow. Invalid-input and protocol errors use fixed generic messages. The server MUST NOT return a command, command fragment, credential, environment value, database URL or host, transcript path, absolute home path, or exception text. It MUST NOT log tool inputs. The prototype uses text content only; it does not add `structuredContent`, resource links, or other result fields containing event data. MCP servers must validate inputs and sanitize outputs, and clients should validate tool results before passing them to a model [S6].

### Extra attack surface

The MCP server is local code launched with the agent's user privileges. It parses JSON-RPC, stays alive longer, reads the process environment used by the existing policy evaluator, and has access to repository paths used by policy checks. A malicious or replaced executable in the MCP configuration can execute with those privileges. `stdio` limits communication to the connected client but does not sandbox the server; the MCP security guidance calls out local-server code execution, data access, exfiltration, and data-loss risks [S5][S7]. The prototype exposes one read-only evaluator tool, validates inputs, performs no shell execution or network access, and never writes a log. These reduce capabilities but do not eliminate the local-process trust risk.

The host can also expose the MCP tool for direct model calls in addition to invoking it from hooks. A direct call can request evaluation of arbitrary command text and receive a policy verdict; the tool has no side effects. The prototype must not be treated as the only enforcement layer [ADR-0002].

### Consequences

* Good, because the MCP server can handle many hook calls without starting a process for each one.
* Good, because the existing policy and adapter output are reused.
* Bad, because the MCP server and JSON-RPC parser remain in the trusted computing base for the full session.
* Bad, because the command sent as an MCP argument can contain secrets, and the current hook templates cannot redact it before it reaches Canary.
* Bad, because Codex permits commands when its MCP server is absent or unavailable.
* Neutral, because Claude Code may still skip launch-time `SessionStart` MCP hooks; this design checks actual commands at `PreToolUse` instead.

## Confirmation

* `npm run bench:mcp` compares the existing per-command process path with repeated tool calls over one persistent stdio server. Results are recorded below; this synthetic local benchmark does not verify either host's live lifecycle or fail-closed behavior.
* `tests/mcp-contract.test.ts` adds synthetic LOCAL harness tests (2026-11-22). They drive the built prototype over its own stdio endpoint and cover first call on a fresh process, malformed JSON-RPC and tool arguments, an unavailable tool name, disconnect, the exact four-field input schema, and ADR-0003 marker checks for command text, environment values and hosts. These are harness tests, **not** live-agent behavior; no Claude Code or Codex session was run.
* Review every `content` text and error path against ADR-0003. A local marker-secret check now exists; a live-agent marker check and MCP conformance verification against the catalogued revision and a real client remain required before this prototype is considered for shipping [Q22][Q26].
* Live verification must record Claude Code and Codex versions, server startup timing, first-command behavior, disconnected-server behavior, and whether the MCP tool is visible for direct model calls [Q21][Q23].

## Pros and Cons of the Options

### Keep command hooks

* Good, because a process failure is isolated to one command and the existing configurations are understood.
* Bad, because Node startup is paid for each matching tool call.

### One stdio MCP server per session

* Good, because tool calls reuse one connected process.
* Good, because stdio avoids opening a network listener [S7].
* Bad, because Codex MCP hook failure is fail-open and the first command may not be checked [S8].
* Bad, because the MCP call receives the full command string, which may contain a secret.
* Bad, because local-server execution expands the trusted code and lifecycle surface [S5][S7].

### Background daemon or network endpoint

* Good, because it could be shared across agent sessions.
* Bad, because discovery, authentication, IPC/network exposure, stale state, and shutdown handling add scope beyond this experiment.

## More Information

* Claude Code MCP hook fields, server connection behavior, skipped launch events, and `onFailure` minimum version: [S1](../sources.md#agent-hook-and-plugin-systems).
* Codex MCP tool hooks and fail-open behavior: [S8](../sources.md#agent-hook-and-plugin-systems).
* MCP trust and tool behavior: [S5](../sources.md#protocols-and-standards), [S6](../sources.md#protocols-and-standards), [S7](../sources.md#protocols-and-standards).
* Secret-free outputs: [ADR-0003](0003-findings-without-secret-values.md).
* Open questions: [Q21–Q23 and Q26](../open-questions.md#open-questions-about-the-agents).

Benchmark result (final synthetic local run on the integrated tree, 2026-11-22, `npm run bench:mcp`; **not** live-agent verification): win32, Node v22.22.2, 50 measured calls per mode plus 5 warm-up calls. Command hook: 55 process starts, median 231.649 ms, p95 267.139 ms. MCP tool: 1 server process start, 55 calls on that process, cold start plus initialize 210.545 ms, median call 0.384 ms, p95 call 1.172 ms. An earlier run in the same harness measured 326.672 ms / 638.272 ms and 0.669 ms / 3.546 ms; the difference shows the run-to-run variance of this environment. These numbers show only local harness timing; they do not establish server lifetime, direct-call exposure, first-command behavior, or fail-closed behavior in Claude Code or Codex [Q21][Q23].
