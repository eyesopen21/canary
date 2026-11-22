# Canary — Agent-oriented Work Breakdown Structure

| | |
| --- | --- |
| Version | 0.1 |
| Date | 2026-11-22 |
| Scope | MVP (P0) plus a P1/P2 backlog |
| Status | Local P0 implementation and acceptance tests are in place. Live-agent checks and hosted matrix results are pending. |

This document turns the existing documentation into agent-sized work packages. It does not add requirements: every item traces to an ID in a source document.

## 1. Where the requirements live

| Document | What it holds | IDs |
| --- | --- | --- |
| `docs/SRS.md` | Requirements, verification methods, acceptance criteria, traceability | `CAN-I-01`…`CAN-I-09`, `CAN-F-01`…`CAN-F-08`, `CAN-F-19`, `CAN-F-21`, `CAN-F-07`, `CAN-U-01`…`03`, `CAN-N-01`…`11`, `CAN-D-01`…`03`, `CAN-C-01`…`04`, `CAN-T-01`…`08`, `AC-1`…`AC-8`; roadmap `CAN-F-09`…`18`, `CAN-F-20`, `CAN-F-22` |
| `docs/specs/policy.md` | Hook rules B0–B4 and W1–W3, evaluation order, exact message text, placeholders, examples | `CAN-F-04`, `CAN-F-05`, `CAN-F-06` |
| `docs/specs/agent-adapters.md` | Five agent hook interfaces, fields, fail-closed settings, pitfalls | `CAN-F-19`, `CAN-I-03`, `CAN-I-05`…`07`, `CAN-F-21` |
| `docs/THREAT-MODEL.md` | Ten threats, mitigations, residual risk, tests that close each mitigation | T1…T10 |
| `docs/decisions/` | Architecture decisions and their confirmation tests | ADR-0001…ADR-0006 |
| `docs/open-questions.md` | Assumptions and things that need live verification | A1…A9, Q1…Q18 |
| `README.md` | Planned command surface and public claims | `scan`, `hook`, `init`, `crash-test`, `badge`; roadmap `fix`, `freeze`, `rules`, `scan --ci` |
| `AGENTS.md` | Planned source layout, repository rules, workflow | `src/core/`, `src/adapters/`, `src/cli/`, `fixtures/`, `tests/`, packaging |
| `openspec/specs/` | Machine-checkable behavior for the hook core and the adapters | capabilities `hook-policy`, `agent-adapters` |

The current OpenSpec baseline covers only the first two rows of the behavior surface. Work packages WP-03 to WP-08 below need additional capabilities before their behavior is machine-checkable; this WBS is the map for creating them.

## 2. Work packages

### Wave 0 — Foundation (done)

| ID | Name | Delivered | Trace |
| --- | --- | --- | --- |
| WP-00 | Zero-dependency TypeScript foundation | `package.json`, `tsconfig.json`, `src/contract.ts`, ADR-0006 | `CAN-C-01`, `CAN-N-02`, ADR-0006 |

### Wave 1 — Independent implementation (parallelizable)

| ID | Name | Goal and source requirements | File ownership | Acceptance | Depends on |
| --- | --- | --- | --- | --- | --- |
| WP-01 | Hook policy core | Split segments, classify B0–B4/W1–W3, combine decisions, exact messages and placeholder sanitization. `CAN-F-04`, `CAN-F-05`, `CAN-F-06`, `CAN-U-02` | `src/core/evaluate.ts`, `src/core/split.ts`, `src/core/messages.ts`, `tests/policy.test.ts` | `CAN-T-03`; all examples in `policy.md#examples`; `openspec validate` on `hook-policy` | WP-00 |
| WP-02 | Agent adapters | Five thin adapters; inject an `Evaluator`; no policy logic; fail-closed settings and message fidelity. `CAN-F-19`, `CAN-I-03`, `CAN-I-05`…`07`, `CAN-F-21`, `CAN-N-11` | `src/adapters/**`, `tests/adapters.test.ts` | `CAN-T-04`; adapter contract tests with synthetic events; `openspec validate` on `agent-adapters` | WP-00 |
| WP-03 | Scanner checks C1–C3 | Non-local test databases, readable credentials (presence only), unguarded recursive deletes and links. `CAN-F-01.1`…`.3`, part of `CAN-T-01` | `src/core/checks/database.ts`, `credentials.ts`, `deletes.ts`, `tests/checks-p0a.test.ts`, `fixtures/trap-c1/**`, `trap-c2/**`, `trap-c3/**`, `fixtures/clean/**` | Trap fixtures produce exactly the expected findings; clean fixture produces none | WP-00 |
| WP-04 | Scanner checks C8–C9 | Unpinned MCP servers, bypass flags, hidden Unicode, and agent workflows on untrusted input. `CAN-F-01.4`…`.5` | `src/core/checks/agent-config.ts`, `ci.ts`, `tests/checks-p0b.test.ts`, `fixtures/trap-c8/**`, `trap-c9/**` | Same trap/clean rule as WP-03 | WP-00 |
| WP-05 | Findings and score | Stable finding IDs, no-leak evidence, 0–100 Blast Radius Score, ordering, deterministic JSON. `CAN-F-02`, `CAN-F-03`, `CAN-D-01`…`03`, `CAN-N-04` | `src/core/findings.ts`, `src/core/score.ts`, `tests/findings.test.ts`, `tests/score.test.ts` | `CAN-T-07`; two runs byte-identical; marker string never present | WP-00 |
| WP-06 | Crash test isolation | Three scenarios in a disposable directory with double `realpath` guard, substituted `HOME`, no network, simulation fallback. `CAN-F-07`, `CAN-T-06`, ADR-0004 | `src/crash-test/**`, `tests/isolation.test.ts` | Write-watcher test fails on any write outside the temporary directory; negative guard test falls back to simulation | WP-00 |
| WP-07 | Agent packaging | Plugin/extension layouts and hook config per agent, including fail-closed flags. `CAN-C-04`, `CAN-I-09`, `CAN-F-21`, A1…A3 | `.claude-plugin/**`, `.codex-plugin/**`, `gemini-extension.json`, `hooks/hooks.json`, `.cursor/hooks.json`, `.gemini/settings.json`, `.opencode/plugins/canary/**`, `opencode.jsonc` | Each config matches the cited layout; no secret or absolute path in any file | WP-00 |

### Wave 2 — Wiring and integration

| ID | Name | Goal and source requirements | File ownership | Acceptance | Depends on |
| --- | --- | --- | --- | --- | --- |
| WP-08 | CLI commands | One `canary` binary with `scan`, `hook`, `init`, `crash-test`, `badge`; stdin/stdout contracts; write only `canary/findings.json` and `canary/badge.svg`. `CAN-I-01`…`04`, `CAN-I-08`, `CAN-F-08`, `CAN-U-01` | `src/cli/**`, `bin/**`, `scripts/build.mjs`, `tests/cli.test.ts`, `package.json` | `AC-6` with two commands on a clean machine; `CAN-T-04` through the real binary | WP-01…05, WP-07 |
| WP-09 | Full acceptance run | Run `CAN-T-01`…`04`, `CAN-T-06`…`08`; check AC-1, AC-2, AC-3, AC-5, AC-8; cross-platform and determinism checks. `CAN-N-03`, `CAN-N-04`, `CAN-N-05`, `CAN-N-06`, `CAN-T-07`, `CAN-T-08` | `tests/integration.test.ts`, `tests/platform.test.ts`, `tests/benchmark.test.ts` | The seven automatable acceptance criteria pass | WP-01…08 |

### Wave 3 — Human verification (cannot be automated by an agent)

| ID | Name | Goal | Trace |
| --- | --- | --- | --- |
| WP-10 | Live agent checks | Run a blocked command in each of the five agents in a disposable repo; record agent version and result; mark unsupported agents in the README. | `CAN-T-05`, `AC-4`, Q1…Q5 |
| WP-11 | Public claims review | README limits table, fail-open warnings for Codex and Gemini CLI, neutral language, license, MIT and score disclaimer. | `CAN-N-08`, `CAN-U-03`, `CAN-N-09`, `AC-7`, T4, T5 |
| WP-12 | Open questions and residual risk | Move answered Q1…Q7 to Resolved with evidence; confirm A8 and A9; review the threat model after the code lands. | Q1…Q18, A1…A9, threat model section 4 |

### Backlog — not in the MVP

| ID | Name | Trace |
| --- | --- | --- |
| WP-13 | Remaining audit checks C4, C6, C7, C10, C11 and account-level manual steps | `CAN-F-09` |
| WP-14 | Fix mode with approval and diff preview | `CAN-F-10` |
| WP-15 | Rules compiler for prose rules | `CAN-F-11`, T7 |
| WP-16 | Decoy credentials | `CAN-F-12` |
| WP-17 | MCP server returning findings by reference | `CAN-F-13` |
| WP-18 | Freeze mode, warn-only mode and per-repository exceptions | `CAN-F-14`, `CAN-F-15` |
| WP-19 | Rules that survive context compaction | `CAN-F-20`, T7, Q10 |
| WP-20 | Authorization log, scope contract, CI threshold, destination allowlist | `CAN-F-16`…`CAN-F-18`, `CAN-F-22` |

## 3. Execution plan

1. Wave 1: launch one agent per work package WP-01 to WP-07, each in its own git worktree. Their file ownership sets above are disjoint, so no merge conflict is expected.
2. Merge Wave 1 into `main` and run `npm test`.
3. Wave 2: WP-08 wires the real implementations; WP-09 runs the full suite.
4. Wave 3 is performed by a human or by a live-agent harness; agents must not mark it done.
5. The backlog is re-planned after the MVP is accepted.

## 4. Agent contract

Every agent working on a work package MUST:

- work only in its assigned worktree and only on the files listed in its file ownership column;
- read `AGENTS.md`, the cited source document, and the relevant OpenSpec spec before writing code;
- use only Node.js built-ins, with no runtime dependency, no LLM call, and no network access in the decision path (`CAN-C-02`, `CAN-N-01`, ADR-0001);
- use synthetic secrets with a marker string in fixtures and never print, log, or commit a secret value, a credential host, or an environment variable value (ADR-0003, `CAN-N-10`);
- keep imports with explicit `.ts` extensions and ESM syntax (ADR-0006);
- add its own tests in the same work package and run `npm test` before committing;
- commit with a message naming the WP ID and the requirement IDs, and never push;
- report files created, tests run, commit hash, and any unresolved assumption.

Agents MUST NOT claim that live-agent checks (WP-10) passed, describe a roadmap item as implemented, or edit a file owned by another work package.

## 5. Requirement coverage map

| Requirement group | Work packages |
| --- | --- |
| `CAN-I-01`…`04`, `CAN-I-08`, `CAN-I-09`, `CAN-F-08`, `CAN-U-01` | WP-07, WP-08 |
| `CAN-I-05`…`07`, `CAN-F-19`, `CAN-F-21` | WP-02, WP-07 |
| `CAN-F-01.1`…`.3` | WP-03 |
| `CAN-F-01.4`…`.5` | WP-04 |
| `CAN-F-02`, `CAN-F-03`, `CAN-D-01`…`03`, `CAN-N-04` | WP-05 |
| `CAN-F-04`, `CAN-F-05`, `CAN-F-06`, `CAN-U-02` | WP-01 |
| `CAN-F-07` | WP-06 |
| `CAN-N-01`, `CAN-N-02`, `CAN-C-01`, `CAN-C-02` | WP-00 and every code WP |
| `CAN-C-03` | WP-02 |
| `CAN-C-04` | WP-07 |
| `CAN-N-03`, `CAN-N-05`, `CAN-N-06` | WP-09 |
| `CAN-N-08`, `CAN-U-03`, `CAN-N-09` | WP-11 |
| `CAN-N-10`, `CAN-N-11` | WP-01…WP-07 |
| `CAN-T-01` | WP-03, WP-04 |
| `CAN-T-02` | WP-01, WP-03, WP-04, WP-05 |
| `CAN-T-03`, `CAN-T-04` | WP-01, WP-02 |
| `CAN-T-05` | WP-10 |
| `CAN-T-06` | WP-06 |
| `CAN-T-07`, `CAN-T-08` | WP-05, WP-09 |
| `AC-1`…`AC-8` | WP-08, WP-09, WP-10, WP-11 |
| T1…T10 | WP-01…WP-11 (mitigations), WP-13…WP-19 (remaining roadmap) |
| Q1…Q18, A1…A9 | WP-07, WP-10, WP-12 |
