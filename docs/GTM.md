# GTM crumbs — factual notes for a future agent or reviewer

Scope: this file records what is already true in this repository at main `dacc78d`, with evidence. It is not a release decision, a campaign plan, or marketing copy, and it adds no instructions to the repository rules in [AGENTS.md](../AGENTS.md). Source IDs `[Sn]`, assumptions `An` and questions `Qn` resolve through [sources.md](sources.md) and [open-questions.md](open-questions.md).

Snapshot note: the commissioning brief named main `9acfa05` and described Claude Code and Gemini CLI as unverified and OpenCode as a failure. Main is 14 commits later. The runbook now records live AC-4 passes for Claude Code, Cursor and OpenCode ([runbook](testing/live-agent-checks.md#results):86, 89, 90). This file follows the repository; the stale brief items are listed under Hypothesis/rejected below.

## 1. Positioning (plain facts)

- **Category:** "a local guardrail, not a security boundary" ([README](../README.md):3); offline repository risk checks plus a pre-execution command hook (`package.json` description; [SRS](SRS.md):38-42).
- **One-line message (descriptive, not a slogan):** Canary scans a repository for selected agent-related risks and blocks a small set of destructive shell commands before an agent runs them — a local guardrail, not a security boundary ([README](../README.md):3).
- **Best-fit** ([SRS](SRS.md):79-82): solo developers/founders using auto-approval; small teams without a security team; leads rolling agents out to a team; maintainers running agents in CI on untrusted input. Recorded live passes cover Claude Code `bypassPermissions`, Cursor `--yolo` and OpenCode normal mode ([runbook](testing/live-agent-checks.md#results):86, 89, 90).
- **Anti-fit** ([SRS](SRS.md):44-49, [README](../README.md):76,78): auditing cloud accounts; replacing OS isolation, egress firewalls or the agent's own permission system; legal advice; stopping deliberate evasion or effects hidden in scripts the hook never sees; any need for a certification or audit opinion, since the score is a heuristic.

## 2. Evidence table

Strength values: live session / local test / source-cited / assumption.

| Claim | Exact source in this repo | Strength |
| --- | --- | --- |
| MIT-licensed local CLI; not published to npm | `LICENSE:1-3`; `package.json` `license`/`private`; [README](../README.md):22 | source-cited (repo file) |
| Four narrow block families B1–B4, plus parse-failure B0 and warnings W1–W3 | [policy](specs/policy.md):51-60; `CAN-T-03` [SRS](SRS.md):282 | local test |
| `canary init` previews the full diff, omits unchanged values, redacts sensitive values | [README](../README.md):44; `CAN-I-09` [SRS](SRS.md):145 | local test (`CAN-T-04`) |
| Crash test runs only in a disposable temp directory; no network or real credentials | [ADR-0004](decisions/0004-crash-test-isolation.md):32-39; `CAN-F-07` [SRS](SRS.md):177 | local test (`CAN-T-06`) |
| Cursor `--yolo` live pass: delete B1a blocked, force push B3 blocked | [runbook](testing/live-agent-checks.md#results):89 | live session |
| Claude Code `bypassPermissions` live pass: B1a and B3 blocked, debug log shows `deny` | [runbook](testing/live-agent-checks.md#results):86; [README](../README.md):11 | live session |
| OpenCode normal-mode live pass: B1a and B3 blocked; generated deny rule removed only in the sandbox for attribution | [runbook](testing/live-agent-checks.md#results):90; [README](../README.md):15 | live session |
| Codex unsupported: force push executed; root cause is non-managed hook trust, not hook location or format | [runbook](testing/live-agent-checks.md#results):87, 95-103; [README](../README.md):12 | live session (declared failure) |
| Gemini CLI unverified: CLI not installed, no AC-4 run | [runbook](testing/live-agent-checks.md#results):88; [README](../README.md):14 | source-cited (no live run) |
| Maintainer reports running Codex and Gemini CLI checks on an unmerged branch; evidence pending merge | [README](../README.md):12,14; `AC-4` [SRS](SRS.md):297 | assumption (not in this checkout) |
| CI matrix green, six jobs, Ubuntu/macOS/Windows × Node 22.22.0/latest — run `45076233582` | [SRS](SRS.md):276; [CHANGELOG](../CHANGELOG.md):47; [AGENT-WBS](AGENT-WBS.md):8 | source-cited (repo record) |
| `CAN-N-05` split per ADR-0009: in-process `evaluate()` p50 < 10 ms; wall-clock and Node floor published separately | `CAN-N-05` [SRS](SRS.md):191; [ADR-0009](decisions/0009-split-performance-target.md):30; `Q20` [open-questions](open-questions.md#resolved):100 | local test + decision |
| Fail-open documented for Codex and Gemini CLI; OpenCode error behavior unverified; fail-closed settings are configuration, not live proof | [README](../README.md):65-68,78; `CAN-F-21` [SRS](SRS.md):171; [S8][S10][S14] | source-cited |
| MCP tool-hook path is an opt-in prototype; ADR-0008 status is `proposed` | [decisions README](decisions/README.md):14; [ADR-0008](decisions/0008-mcp-tool-hooks.md):2,13,39 | source-cited |
| No pre-call redaction: MCP `command` is arbitrary shell text and can carry secrets | `Q22` [open-questions](open-questions.md#open-questions-about-the-agents):66; [ADR-0008](decisions/0008-mcp-tool-hooks.md):49 | source-cited |
| Marketplace requirements A1–A3 assumed; Q12 open | [open-questions](open-questions.md#inputs-confirmed-by-the-maintainer-2026-11-22):11,21-23; `Q12`:74 | assumption |
| Synthetic MCP harness tests are not live-agent evidence | [open-questions](open-questions.md#open-questions-about-the-agents):49; [ADR-0008](decisions/0008-mcp-tool-hooks.md):73 | source-cited |
| Design notes S24 name author `@abe` only; no institution or affiliation is recorded | [sources](sources.md):59 | source-cited |

## 3. What is TRUE today

- MIT-licensed local TypeScript CLI on Node ≥ 22.22; built JavaScript is committed; the npm package name is declared but `private: true` and **not published** ([README](../README.md):22,29,98; [ADR-0006](decisions/0006-zero-dependency-typescript-on-node.md):28).
- Four narrow block families B1 (unresolved recursive delete), B2 (destructive DB command on non-local host), B3 (force push), B4 (auto-approved infra change); B0 is a parse-failure catch-all ([policy](specs/policy.md):51-60).
- `canary init` shows a diff with redaction before writing; the crash test is isolated by a path guard and substituted environment ([README](../README.md):44; [ADR-0004](decisions/0004-crash-test-isolation.md):32-39).
- Live AC-4 passes recorded on 2026-11-22: Cursor `--yolo`, Claude Code `bypassPermissions`, OpenCode normal mode, each with B1a and B3 messages attributed to Canary ([runbook](testing/live-agent-checks.md#results):86,89,90).
- Declared failures/limits: Codex **Unsupported** with root cause hook trust; Gemini CLI **Unverified**; AC-4 remains open ([runbook](testing/live-agent-checks.md#results):87,88,95-103; `AC-4` [SRS](SRS.md):297).
- CI matrix green in the repo's own record: run `45076233582` ([SRS](SRS.md):276; [CHANGELOG](../CHANGELOG.md):47). A later run `45076776836` on the final docs commit was also observed green via `gh run view` (six jobs, six `benchmark-numbers-*` artifacts), URL `https://github.com/eyesopen21/canary/actions/runs/45076776836`; it was not written into the repo records before this note.
- `CAN-N-05` was split per [ADR-0009](decisions/0009-split-performance-target.md): the target applies to in-process `evaluate()` only; wall-clock latency and the Node startup floor stay published and must not be relabelled as in-process ([SRS](SRS.md):191).

## 4. What is HYPOTHESIS, unverified or rejected

- **Hypothesis, no repo evidence:** pricing, a 30-day plan, marketplace submissions, and any claim of saved PocketOS/Replit. None appears in this repository; treat as unsubstantiated.
- **Contradicted:** npm publication ([README](../README.md):22; `package.json` `private: true`).
- **Unverified:** marketplace acceptance; A1–A3 are assumptions from sponsor projects and Q12 is open ([open-questions](open-questions.md#assumptions):21-23,74).
- **Provenance:** "Stanford researcher" has no source here; S24 records only author `@abe` ([sources](sources.md):59). Do not claim an affiliation.
- **Rejected as overclaim:** "ship fast without failing" appears nowhere in the repo; the brief marks it rejected. Do not use it as copy.
- **Stale in the brief:** "Claude/Gemini unverified" and "Codex/OpenCode failures" describe `9acfa05`. Current main records a Claude Code pass and an OpenCode pass; only Gemini CLI is unverified and only Codex is Unsupported ([runbook](testing/live-agent-checks.md#results):86,88,90,87).

## 5. Alternatives named without tested comparisons

- **Native agent permissions / deny rules:** Claude Code [S2], Codex [S8], Cursor [S9], OpenCode [S16], Gemini CLI policy engine [S26]. Proposed as barriers, not benchmarked against Canary ([ADR-0002](decisions/0002-hook-is-one-layer-not-the-boundary.md):41; [agent-adapters](specs/agent-adapters.md):24; [THREAT-MODEL](THREAT-MODEL.md):113).
- **Sandboxes, containers/devcontainers, OS isolation, egress firewall:** explicitly out of scope to replace ([SRS](SRS.md):47); a container is optional for the crash test ([ADR-0004](decisions/0004-crash-test-isolation.md):66-70); named as a barrier to propose ([THREAT-MODEL](THREAT-MODEL.md):107). No comparison run.
- **Backups, branch protection, read-only DB roles, credentials outside the developer account:** listed as manual barriers ([ADR-0002](decisions/0002-hook-is-one-layer-not-the-boundary.md):42; [SRS](SRS.md):381). Not tested by this project.
- **Other hook types:** Claude Code `prompt`/`agent` hooks and model-calling OpenCode permission hooks are mentioned only as things users can add; Canary does not use or endorse them ([ADR-0001](decisions/0001-deterministic-core-without-llm.md):71; `Q9` [open-questions](open-questions.md#open-questions-about-the-agents):61).

## 6. Guardrails for copy

Copy must not present simulated hook events or packaged smoke tests as live sessions ([runbook](testing/live-agent-checks.md):31,105; [ADR-0008](decisions/0008-mcp-tool-hooks.md):73). It must not claim fail-closed behavior for Codex [S8], Gemini CLI [S10] or OpenCode [S14] ([README](../README.md):65-68,78; `Q6`,`Q7`,`Q19` [open-questions](open-questions.md#open-questions-about-the-agents):58,59,64). It must not claim the MCP prototype ships — ADR-0008 is proposed ([decisions README](decisions/README.md):14) — nor that MCP inputs are secret-free (`Q22`:66), nor that marketplace requirements are verified (A1–A3, `Q12`), nor that the package is on npm ([README](../README.md):22). It must not call Canary a security boundary, a certification, or an audit opinion ([README](../README.md):3,78; [ADR-0002](decisions/0002-hook-is-one-layer-not-the-boundary.md):7). Repository rule: unverified behavior goes in [open-questions.md](open-questions.md), not into public claims ([AGENTS.md](../AGENTS.md):43,44).

## 7. Backlinks

[README](../README.md) · [runbook](testing/live-agent-checks.md) · [SRS](SRS.md) · [sources](sources.md) · [open questions](open-questions.md) · [ADRs](decisions/README.md) · [hook policy](specs/policy.md) · [threat model](THREAT-MODEL.md)
