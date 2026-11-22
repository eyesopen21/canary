# Open questions and assumptions

This file lists every assumption the documentation rests on and every question that is still open. A claim that depends on an open question must link here. When a question is answered, move it to [Resolved](#resolved) with the date and the evidence.

Status values: **Assumed** (a default chosen without confirmation), **Open** (unknown, needs verification), **Resolved**.

## Inputs confirmed by the maintainer (2026-11-22)

| Topic | Decision |
| --- | --- |
| Marketplace publishing requirements | Not provided. Use assumptions A1 to A3 below. |
| Supported agents | Claude Code, Codex, Cursor, Gemini CLI, OpenCode |
| Stack | Node.js with TypeScript |
| Language of public documents | English |
| License | MIT |

## Assumptions

| ID | Assumption | Why | Status |
| --- | --- | --- | --- |
| A1 | The Dojo Marketplace accepts a GitHub repository that ships a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`), a Codex plugin (`.codex-plugin/plugin.json`), and a Gemini CLI extension (`gemini-extension.json`) from the same root. | This is the layout of the sponsor project [S22]. The Dojo requirements were not provided. | Assumed |
| A2 | The listing needs a README with install steps per agent, a license file, and a changelog. | Present in both sponsor projects [S22][S23]. | Assumed |
| A3 | The Marketplace accepts MIT. | Both sponsor projects use MIT [S22][S23]. | Assumed |
| A4 | The npm package is named `@eyesopen21/canary` and installs a `canary` binary. | A scoped name under the repository owner avoids clashing with an existing unscoped `canary` package. The name was not checked on npm. | Assumed |
| A5 | Node.js 22 LTS or later is the minimum runtime. | Needed for a single-command install with no native dependencies (CAN-N-02). The exact minimum is not fixed. | Assumed |
| A6 | The copyright holder in `LICENSE` is "Canary contributors". | No legal entity or person was named. | Assumed |
| A7 | Security reports go through GitHub private vulnerability reporting on `eyesopen21/canary`. | No security contact was given. The repository setting must be turned on. | Assumed |
| A8 | The Blast Radius Score starts at 100 and subtracts a weight per finding: critical 25, high 15, medium 5, low 1, with a floor of 0. Higher is safer. | The notes [S24] define the 0 to 100 range and a CI minimum, which implies higher is better. They do not define weights. | Assumed |
| A9 | "Local database host" means `localhost`, `127.0.0.0/8`, `::1`, a Unix socket path, or a host name ending in `.localhost`, or a Docker Compose service name declared in the repository. | The notes [S24] say "local or container database" and give no list. | Assumed |

## Open questions about the agents

The hook is only as strong as the agent that runs it. These questions decide what the README may promise.

| ID | Question | What the docs say today | Status |
| --- | --- | --- | --- |
| Q1 | Do Claude Code `PreToolUse` hooks run, and does a hook `deny` apply, in `bypassPermissions` mode? | The permissions page says a hook-blocked call stays blocked whichever settings file the hook comes from [S2], and that `bypassPermissions` skips permission prompts and safety checks [S3]. Neither page states in one sentence that hooks still run in that mode. | Open. Verify by test before the README claims it. |
| Q2 | Do Codex hooks run in its full-access or approval-free modes? | Codex reports `permission_mode` to hooks, including `bypassPermissions` [S8]. Whether hooks still run in every mode is not stated. | Open |
| Q3 | Do Gemini CLI `BeforeTool` hooks run in `yolo` mode? | Not stated in [S10][S11]. Policy-engine rules with no `modes` are always active, which includes `yolo` [S26], so a `deny` policy rule is the stronger layer on Gemini CLI. Workspace policy files are disabled; user policies live in `~/.gemini/policies/` [S26]. | Open |
| Q4 | Do Cursor `preToolUse` hooks run in auto-run modes? | Not stated in [S9]. | Open |
| Q5 | Does an OpenCode V2 `ctx.tool.hook("execute.before", ...)` callback block a call by throwing? | The V1 example blocks by throwing an error [S15]. The V2 page documents the hook as "inspect or replace tool input" [S14] and does not say that throwing blocks. Canary's design uses `ctx.permission.hook("evaluate", ...)` instead, which documents a `deny` effect [S14]. | Open |
| Q6 | How can Canary fail closed on Codex? | Codex states that a `PreToolUse` error, timeout, or malformed response can let the tool run [S8]. No fail-closed setting was found. | Open. Documented as a residual risk. |
| Q7 | How can Canary fail closed on Gemini CLI? | Exit codes other than 0 and 2 are warnings and the action proceeds; non-JSON stdout defaults to allow [S10]. No fail-closed setting was found. | Open. Documented as a residual risk. |
| Q8 | How can Canary show a warning in Cursor without blocking? | `user_message` and `agent_message` are documented for denied actions, and `ask` is accepted but "not enforced for preToolUse today" [S9]. | Open. On Cursor, a warning currently degrades to allow plus a local log entry. |
| Q9 | Cursor can load hooks from Claude Code [S9]. If both `.claude/settings.json` and `.cursor/hooks.json` hold a Canary hook, does it run twice? | The compatibility page was not read. | Open |
| Q10 | Which session-start or post-compaction events can reinject critical rules (CAN-F-20, roadmap)? | Claude Code has `SessionStart` with a `compact` matcher and plain-text stdout added as context [S1]. Codex has `SessionStart`, `PreCompact`, `PostCompact` [S8]. Gemini CLI `SessionStart` supports `additionalContext` and fires on `startup`, `resume`, `clear` [S11]. Cursor `sessionStart` supports `additional_context` [S9]. OpenCode has `ctx.session.hook("compaction", ...)` [S15]. Exact behavior after compaction was not tested. | Open |
| Q11 | Can an agent edit its own hook configuration and switch Canary off? | Claude Code treats `.claude` as a protected path, and `bypassPermissions` mode skips permission prompts for protected paths [S2]. Cursor watches `hooks.json` and reloads it automatically [S9]. Not checked for the other agents. | Open. See threat T8 in the [threat model](THREAT-MODEL.md). |
| Q19 | Does an OpenCode V2 plugin error or timeout reliably block the pending shell permission event? | The generated plugin catches CLI errors and leaves the event unchanged. The effect of that path on the agent's command decision has not been tested live. | Open. `canary init` warns users not to assume fail-closed behavior. |
| Q21 | What happens on the first command with the opt-in `mcp_tool` hooks in live Claude Code and Codex sessions? | Claude Code skips launch-time `SessionStart` MCP hooks, then waits for a connecting MCP server on blocking `PreToolUse` events; `onFailure: "block"` for MCP hooks requires v2.1.328 [S1]. Codex hooks use an already-connected server and missing/unavailable servers do not block [S8]. The generated configs and first-command timing have not been tested in either agent. | Open. Record exact agent versions, whether the server is connected before the first tool call, and the resulting allow/block behavior. |
| Q22 | Can Canary ensure MCP hook inputs cannot carry secrets while still evaluating the current shell policy? | The prototype passes only `agent`, `tool_name`, `tool_input.command`, and `cwd`, but `command` is arbitrary text and may contain credentials. The documented hook templates interpolate event fields; they provide no pre-call redaction [S1][S8]. | Open. This is a shipping blocker for any requirement that MCP inputs contain no secret-capable data. Find a safe host-side transformation or keep the command-hook path. |
| Q23 | Do Claude Code and Codex keep the stdio server alive for repeated hook calls, and can the model invoke its tool directly outside hooks? | The docs say MCP tool hooks use an existing connection and run synchronously [S1][S8]. The local benchmark demonstrates one process in the harness, not each agent's actual lifecycle or tool visibility. | Open. Verify connection lifetime, direct-call exposure, restart behavior, and shutdown in live sessions before shipping. |

## Open questions about the product

| ID | Question | Status |
| --- | --- | --- |
| Q12 | What exactly does the Dojo Marketplace require (format, listing fields, review, license)? | Open. Ask the organizers. |
| Q13 | Which competing tools exist in the Marketplace and on GitHub (agent safety hooks, secret scanners, destructive-command guards)? This decides how much the crash test and the rules compiler differentiate Canary. | Open |
| Q14 | Is there a primary source for the claim, made in the original audit prompt, that a warning naming the danger and its consequence reduces harm more than repeating a rule? | Open. Do not cite the claim until a source is found. |
| Q15 | Are the incidents cited in social media posts about agents deleting production data or causing outages accurate? | Open. None of them is cited in public documents until confirmed in a primary source. |
| Q16 | Is the SWE-CoWork result (fewer than 8% of tasks completed with requirements spread across simulated colleagues) accurate, and where is the paper? | Open. Not cited. |
| Q17 | Does the SRS outline match ISO/IEC/IEEE 29148:2018 clause by clause? | Open. The outline follows the commonly published SRS contents of the standard. The full text was not available. |
| Q18 | Should hosts of non-local databases appear in hook messages? | Resolved by design for P0: no. Messages name the variable and the classification "non-local", never the host or URL. Revisit if users need more detail. |
| Q20 | Should CAN-N-05 be split into (1) in-process `evaluate()` p50 below 10 ms and (2) hook spawn overhead, calculated as configured-hook p50 minus the `node -e \"\"` startup-floor p50, below 30 ms? Should absolute per-OS p50/p90 values be informational only? | Open. The previously recorded restricted Windows run measured a 119 ms median for empty Node startup, already above the absolute 100 ms target in that environment. |

## Open question about the live-check setup

| ID | Question | Current evidence | Status |
| --- | --- | --- | --- |
| Q24 | Can the live-check setup script run its local bare-remote force-push preflight in restricted Windows temp environments? | On 2026-11-22 one run in a restricted harness exited with `LOCAL_REMOTE_UNAVAILABLE` at the force-push dry run after the bare ref was seeded and verified. Three later runs in the same operating-system temp environment printed `Sandbox ready` and produced a valid sentinel, bare ref and generated hook config. The failure is environment-specific rather than a reproducible script defect; the script now reports the short Git diagnostic with the code. The destructive commands themselves are still verified only by the live human run. | Open for restricted harnesses; working in the standard Windows temp environment |

## Notes on inputs not used

- The design notes [S24] contain an internal marketing section. It is not reproduced in this repository by decision of the author.
- The notes cite social media posts. Their claims are listed in Q15 and Q16 and are not used as evidence.

## Resolved

None yet.
