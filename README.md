# Canary

Canary scans a repository for selected agent-related risks and provides a command hook that blocks a small set of destructive shell commands. It is a local guardrail, not a security boundary.

![Sanitized local crash-test and fixture-scan preview](docs/marketplace-demo.svg)

The repository contains a working local CLI and adapters for Claude Code, Codex, Cursor, Gemini CLI, and OpenCode. Their hook interfaces are documented in [S1][S8][S9][S10][S11][S14]. One disposable live AC-4 pass is recorded for Claude Code, Cursor, and OpenCode; Codex is **Unsupported** and Gemini CLI is **Unverified** because this repository has no recorded pass for them. AC-4 remains open.

| Agent | Hook interface | Live AC-4 result |
| --- | --- | --- |
| Claude Code | `PreToolUse` [S1][S2][S3] | **Pass in `bypassPermissions`** (live 2026-11-22, `claude 2.1.330`: the hook returned `deny` and Canary's B1a and B3 messages appeared verbatim; one run, one mode; the earlier default-mode run stays inconclusive). [Results](docs/testing/live-agent-checks.md#results). |
| Codex | `PreToolUse` [S8] | **Unsupported** (live 2026-11-22: `--trust` does not trust a non-managed project hook, so an approval-free `codex exec` executed the force push with no Canary decision. The maintainer reports a rerun on a separate, unmerged branch; its evidence is not in this repository). [Root cause](docs/testing/live-agent-checks.md#codex-q2-root-cause-2026-11-22), [results](docs/testing/live-agent-checks.md#results). |
| Cursor | `preToolUse` [S9] | **Pass** (live 2026-11-22, `--yolo`: the recursive delete was blocked as B1a and the force push as B3, each with the canonical Canary message). [Results](docs/testing/live-agent-checks.md#results). |
| Gemini CLI | `BeforeTool` [S10][S11] | **Unverified** (the CLI was not installed on 2026-11-22, so no AC-4 run. The maintainer reports a rerun on a separate, unmerged branch; its evidence is not in this repository). [Results](docs/testing/live-agent-checks.md#results). |
| OpenCode | `ctx.permission.hook("evaluate", ...)` [S14][S16] | **Pass in normal mode** (live 2026-11-22, `opencode v2.3.2`, Windows: the delete was blocked as B1a and the force push as B3 with canonical text after the explicit-Node fix; the generated force-push `deny` rule was removed in the disposable sandbox only for attribution. One run, one model; host behavior when the plugin itself errors is untested). [Results](docs/testing/live-agent-checks.md#results). |

Do not change a status until a human has completed and recorded that agent's run in [the live-agent runbook](docs/testing/live-agent-checks.md). See also [open questions](docs/open-questions.md) and [agent adapters](docs/specs/agent-adapters.md).

## Positioning

**Category.** Local command-hook guardrail for coding agents. Not a security boundary, a sandbox, or a certification: the hook sees only shell commands routed through it, and the score is a heuristic. See the [threat model](docs/THREAT-MODEL.md) and [ADR-0002](docs/decisions/0002-hook-is-one-layer-not-the-boundary.md).

**Main message.** Leave auto-run on. Canary blocks the handful of shell commands you can't undo.

**Best fit.** A founder or "vibecoder" running an agent in an auto-run/YOLO mode on a laptop with no second reviewer, where one misresolved command can delete data. Cursor is the clearest case: its `preToolUse` hook supports `failClosed: true` [S9] and one live `--yolo` pass is recorded ([results](docs/testing/live-agent-checks.md#results)).

**Anti-fit.** Teams that need an enforceable enterprise control or a certified boundary, which a local hook is not; agents that expose no compatible project command hook (for example Replit, which is not one of the five adapters in the [SRS](docs/SRS.md)); and anyone who needs a recorded live pass on every agent — Codex is Unsupported and Gemini CLI is Unverified here ([results](docs/testing/live-agent-checks.md#results)). Codex additionally requires separate hook trust before a non-managed hook runs [S8]; Gemini CLI's `BeforeTool` hook is documented [S10][S11] but was not run in this repository's recorded pass.

**Narrow coverage, on purpose.** Only shell commands that reach the hook are evaluated ([hook policy](docs/specs/policy.md), [threat model](docs/THREAT-MODEL.md)):

- **Blocks:** B1 recursive delete with an unresolved target, B2 destructive database command against a non-local host, B3 force push, and B4 `terraform`/`tofu` apply or destroy with `-auto-approve`.
- **Warns:** W1 `git push --force-with-lease`, W2 `git reset --hard`, and W3 `git clean` that deletes untracked or ignored files.
- **Gaps:** effects hidden in scripts, interpreters, or other tools; file-write and MCP tools in P0; database tools outside the B2 list; hosts classified as local that are still shared; and hook failures on agents that fail open (see [Q6–Q8](docs/open-questions.md#open-questions-about-the-agents) and [Known gaps](docs/specs/policy.md#known-gaps)).

**Credibility over slogans.** The crash test runs in a disposable temporary directory, `canary init` previews a diff with sensitive values redacted before writing, and the [results](docs/testing/live-agent-checks.md#results) table records live passes alongside declared failures and unverified agents. Canary does not claim that you can ship fast without failing.

**Origin, stated precisely.** The product scope follows an internal AI-safety-audit prompt. That prompt is described in the design notes [S24], authored under the handle `@abe`; its provenance and author affiliation are **not independently verified in this repository**, and the prompt text is not published here. No institutional affiliation is claimed.

**Distribution and pricing are hypotheses, not offers.** The npm package is not published (A4), and marketplace submission is planned, not done: the marketplace layout, listing fields, and license requirements are assumptions A1–A3 ([open questions](docs/open-questions.md#assumptions)). Any price or willingness-to-pay idea is likewise a hypothesis; no pricing research or measured willingness-to-pay is recorded here.

**Alternatives, named without comparative testing.** Native agent permissions and deny rules [S2][S16][S26], sandboxes or devcontainers, not using auto-run/YOLO, backups and branch protection, and other hook projects (Arcjet, Rollcage Guard, Jarvy, Harbor). No head-to-head comparison with these alternatives was run; Canary is a narrow local hook, not a replacement for them.

## Install from this checkout

Canary is not published to npm. With Git, npm, and Node.js 22.22 or later, build and pack this checkout, then install the generated tarball globally:

```sh
npm pack
npm install --global ./eyesopen21-canary-0.1.0.tgz
```

The generated agent hook configurations invoke `node` with an absolute path to the package's built entry, so the global npm bin directory does not need to be on the agent's `PATH`. Node.js itself must be available when the agent runs hooks. Check with `canary --help` before configuring an agent. The package's build step emits JavaScript into `dist/` using Node's built-in TypeScript type stripping; see [ADR-0006](docs/decisions/0006-zero-dependency-typescript-on-node.md) and [ADR-0007](docs/decisions/0007-commit-built-javascript-for-marketplace-installs.md).

## Quick start

```sh
# Read-only repository scan; writes canary/findings.json.
canary scan

# Preview Canary's configuration changes, then install a hook for one agent.
canary init --agent claude-code

# Run isolated destructive-command demonstrations.
canary crash-test
```

`canary init` previews the full diff of Canary's changes before writing. The preview omits unchanged existing values and redacts sensitive values. It prints a reminder that Node.js must be available when hooks run; for Codex, it also says to review and trust the current project hook with `/hooks` before it runs [S8]. It reports where hook failures can let commands proceed. The `crash-test` command is designed to use an isolated temporary directory. Review [the threat model](docs/THREAT-MODEL.md) for scope and limitations.

Supported `--agent` values are `claude-code`, `codex`, `cursor`, `gemini-cli`, and `opencode`.

## Commands

| Command | Behavior |
| --- | --- |
| `canary scan` | Scans the current repository, prints a summary, and writes `canary/findings.json`. |
| `canary scan --json` | Prints scan findings as JSON. |
| `canary scan --badge` | Also writes `canary/badge.svg`. |
| `canary badge` | Writes the score badge from the existing findings report. |
| `canary init --agent <name>` | Shows a diff and writes hook configuration for the selected agent. |
| `canary hook --agent <name>` | Reads one agent hook event from stdin and returns that adapter's decision. Normally called by the agent. |
| `canary crash-test` | Demonstrates three guarded destructive-command scenarios in an isolated temporary copy. |

## Agent configuration generated by `init`

| Agent | Project configuration | Hook interface | Hook failure behavior |
| --- | --- | --- | --- |
| Claude Code | `.claude/settings.json` | `PreToolUse` | Configured with `onFailure: "block"`. Live `bypassPermissions` result recorded above; see the [runbook](docs/testing/live-agent-checks.md#results). |
| Codex | `.codex/hooks.json` | `PreToolUse` | Fail-open: a hook error, timeout, or malformed response can let the command run. |
| Cursor | `.cursor/hooks.json` | `preToolUse` | Configured with `failClosed: true` [S9]; one live `--yolo` pass is recorded ([results](docs/testing/live-agent-checks.md#results)). |
| Gemini CLI | `.gemini/settings.json` | `BeforeTool` | Fail-open: non-JSON output or an unsupported exit code can let the command run. |
| OpenCode | `.opencode/plugins/canary/index.ts` and `opencode.jsonc` | V2 permission `evaluate` | Fail-open behavior is unverified; do not assume a hook failure blocks the command. |

The hook interfaces and failure behavior in this table summarize the cited agent documentation: Claude Code [S1][S2][S3], Codex [S8], Cursor [S9], Gemini CLI [S10][S11], and OpenCode [S14][S16]. The repository's distributable manifests use `hooks/claude-code.json` for Claude Code, `hooks/codex.json` for Codex, and `hooks/hooks.json` for the Gemini CLI extension. The CLI-installed project configurations are generated by `canary init` as listed above. Packaging and protocol compatibility still require live-agent verification for each agent.

## What Canary can and cannot protect

The policy blocks recursive deletes whose targets cannot be safely resolved, destructive database commands when the configured host is non-local, force pushes, and infrastructure apply/destroy commands with automatic approval. It warns on selected Git commands. Exact rules and messages are in the [hook policy](docs/specs/policy.md).

Canary only evaluates shell commands that reach its hook. It cannot stop equivalent actions hidden in scripts or other tools, an agent session where the hook is not loaded, an agent or person deliberately bypassing the hook, or an attacker with access to the machine. Its scanner checks repository content and selected local configuration; it does not inspect cloud accounts or prove what cloud credentials can access. Use operating-system isolation, restricted credentials, backups, and other independent controls where needed.

Codex and Gemini CLI document fail-open behavior on hook errors [S8][S10], and OpenCode's error behavior is unverified (Q19). The `onFailure: "block"` and `failClosed: true` settings are configured for Claude Code and Cursor respectively [S1][S9], and a live `deny` from Canary has been observed once for each in the recorded runs ([results](docs/testing/live-agent-checks.md#results)). That is one run per agent, not evidence of fail-closed behavior under hook errors. Canary's score is a heuristic, not a certification or audit opinion.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/SRS.md](docs/SRS.md) | Requirements, acceptance criteria, and traceability |
| [docs/specs/policy.md](docs/specs/policy.md) | Hook rules, exact messages, and privacy limits |
| [docs/specs/agent-adapters.md](docs/specs/agent-adapters.md) | Adapter contracts and generated configurations |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | Threats, mitigations, and residual risk |
| [docs/decisions/](docs/decisions/) | Architecture decisions |
| [docs/open-questions.md](docs/open-questions.md) | Assumptions and items that remain unverified |
| [docs/sources.md](docs/sources.md) | External sources cited by the docs |

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
