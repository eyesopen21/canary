# Canary — Software Requirements Specification

| | |
| --- | --- |
| Version | 0.1 (draft) |
| Date | 2026-11-22 |
| Status | Draft. A local implementation and automated test suite exist. MVP acceptance is incomplete; acceptance criteria are not marked complete, and live-agent verification remains outstanding. |
| Scope of this version | MVP (P0) in full; P1 and P2 listed as roadmap |

The structure of this document follows the SRS content outline of ISO/IEC/IEEE 29148:2018 [S19]. The outline was not checked clause by clause against the full standard ([Q17](open-questions.md#open-questions-about-the-product)).

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [S18] [S17] when, and only when, they appear in all capitals, as shown here.

Citations `[Sn]` refer to [sources.md](sources.md). Assumptions `An` and questions `Qn` refer to [open-questions.md](open-questions.md).

## Contents

1. [Introduction](#1-introduction)
2. [References](#2-references)
3. [Specific requirements (P0)](#3-specific-requirements-p0)
4. [Verification and acceptance](#4-verification-and-acceptance)
5. [Roadmap requirements (P1 and P2)](#5-roadmap-requirements-p1-and-p2)
6. [Traceability](#6-traceability)
- [Appendix A. Assumptions and dependencies](#appendix-a-assumptions-and-dependencies)
- [Appendix B. The 11 audit checks](#appendix-b-the-11-audit-checks)
- [Appendix C. Glossary](#appendix-c-glossary)

---

## 1. Introduction

### 1.1 Purpose

This document states what Canary must do, how each requirement is verified, and where each requirement comes from. It is the reference for the implementation, the tests, and the README claims. A README claim that has no requirement here is a defect.

### 1.2 Scope

Canary is a command-line tool plus agent hook adapters. It:

- audits a repository and the local development environment of a coding agent, offline and without credentials;
- scores the risk of irreversible damage;
- installs a pre-execution hook in the agent that blocks a defined set of irreversible commands and lets all other commands through.

Out of scope:

- auditing cloud accounts over the network;
- replacing operating-system isolation, an egress firewall, or the agent's own permission system;
- legal advice of any kind;
- protecting against an agent, script, or person that deliberately evades the hook.

### 1.3 Product perspective

Canary runs inside the developer's machine and inside the agent's tool loop. It interacts with five agents through their documented hook interfaces:

| Agent | Pre-execution interface | Source |
| --- | --- | --- |
| Claude Code | `PreToolUse` command hook | [S1] |
| Codex | `PreToolUse` command hook | [S8] |
| Cursor | `preToolUse` command hook | [S9] |
| Gemini CLI | `BeforeTool` command hook | [S10][S11] |
| OpenCode | Server plugin, `ctx.permission.hook("evaluate", ...)` | [S14] |

The scanner and the hook share one core ([ADR-0005](decisions/0005-shared-core-with-thin-agent-adapters.md)).

### 1.4 Product functions

| Function | Summary |
| --- | --- |
| Scan | Run the P0 checks, compute the score, write findings |
| Hook | Classify each shell command as allow, warn, or block, and answer in the agent's format |
| Init | Write the hook configuration for a chosen agent |
| Crash test | Show, in an isolated copy, what three destructive commands do with and without Canary |
| Badge | Produce a score badge |

### 1.5 User characteristics

| User | Need | Typical use |
| --- | --- | --- |
| Solo developer or founder running agents with auto-approval | No second reviewer; one misresolved command can delete data | Before enabling auto-approval, and as a permanent hook |
| Small team or startup without a security team | Rules in `AGENTS.md` that nothing enforces; production credentials readable from laptops | Repository onboarding and pull request checks |
| Engineering lead rolling agents out to a team | A verifiable policy and a score to compare repositories | Defining the organization's agent standard |
| Maintainer running an agent in CI on external issues or pull requests | Untrusted input reaching an agent with secrets or write access | Workflow review |

Users are assumed to know their agent and the command line. They are not assumed to be security specialists.

### 1.6 Limitations

- The hook evaluates the command text the agent sends. It does not see the effect of scripts, interpreters, or build targets the command starts.
- Canary only runs when the agent calls the hook. If the agent does not load hooks, Canary does nothing (Q1 to Q4).
- On Codex and Gemini CLI, a hook failure lets the action run [S8][S10]. Canary cannot change this.
- The score is a heuristic, not a certification.

---

## 2. References

All references are listed in [sources.md](sources.md). The ones that constrain requirements are:

- Agent hook interfaces: [S1], [S2], [S3], [S8], [S9], [S10], [S11], [S12], [S14], [S16].
- Plugin and extension packaging: [S4], [S8], [S12], [S13].
- Model Context Protocol, version 2026-07-28: [S5], [S6], [S7]. These apply to the roadmap MCP server (CAN-F-13).
- Requirement keywords: [S17], [S18].
- Product inputs: [S24].

---

## 3. Specific requirements (P0)

Every P0 requirement has an ID, a statement, a source, and a verification method. Section 6 maps them to acceptance criteria.

### 3.1 External interfaces

#### 3.1.1 Command-line interface

| ID | Requirement | Source |
| --- | --- | --- |
| CAN-I-01 | The package MUST install one executable named `canary` (A4). | S24, A4 |
| CAN-I-02 | `canary scan` MUST exit `0` when it completes, whatever it finds, and a non-zero code only when it cannot complete the scan. A threshold-based exit code is a P2 feature (CAN-F-18). | Design |
| CAN-I-03 | `canary hook --agent <name>` MUST read one JSON event from stdin and write at most one JSON object to stdout, as the agent's documentation requires. | S1, S8, S9, S10 |
| CAN-I-04 | `canary init --agent <name>` MUST accept exactly `claude-code`, `codex`, `cursor`, `gemini-cli`, and `opencode`, and reject any other value with an error that lists the accepted names. | Maintainer input |

#### 3.1.2 Agent hook interfaces

The fields below are the only fields Canary reads from or writes to each agent. Field names are copied from each agent's documentation. The full mapping is in [agent-adapters.md](specs/agent-adapters.md).

| Agent | Event and matcher | Fields read | Block output | Warn output | Source |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `PreToolUse`, matcher `Bash` and `PowerShell` | `tool_name`, `tool_input.command`, `cwd`, `permission_mode` | `hookSpecificOutput.permissionDecision: "deny"` with `permissionDecisionReason` | `hookSpecificOutput.additionalContext` and `systemMessage`, no decision | [S1] |
| Codex | `PreToolUse`, matcher `^Bash$` | `tool_name`, `tool_input.command`, `cwd` | `hookSpecificOutput.permissionDecision: "deny"` with `permissionDecisionReason` | `hookSpecificOutput.additionalContext` and `systemMessage` | [S8] |
| Cursor | `preToolUse`, matcher `Shell` | `tool_name`, `tool_input.command`, `tool_input.working_directory`, `cwd`, `workspace_roots` | `permission: "deny"` with `user_message` and `agent_message` | `permission: "allow"` and a local log entry (Q8) | [S9] |
| Gemini CLI | `BeforeTool`, matcher `run_shell_command` | `tool_name`, `tool_input.command`, `tool_input.dir_path`, `cwd` | `decision: "deny"` with `reason` and `systemMessage` | `systemMessage` with no decision | [S10][S11][S25] |
| OpenCode | `ctx.permission.hook("evaluate", ...)` for action `shell` | `action`, `resources`, `metadata` | `event.effect = "deny"` and `event.message` | `event.effect = "ask"` and `event.message` | [S14] |

| ID | Requirement | Source |
| --- | --- | --- |
| CAN-I-05 | Every adapter MUST produce output that validates against its agent's documented output schema. Output that fails validation blocks the action in Cursor [S9] and is a non-blocking error in Claude Code [S1], so an invalid answer is a defect in either direction. | S1, S9 |
| CAN-I-06 | The Claude Code adapter MUST answer with exit code `0` and JSON. It MUST NOT rely on exit code `1`, which is a non-blocking error [S1]. | S1 |
| CAN-I-07 | Adapters MUST NOT read fields that are not listed in the table above. In particular the Cursor adapter MUST NOT read or store `user_email` [S9]. | Design, privacy |

#### 3.1.3 Files Canary writes

| ID | Requirement | Source |
| --- | --- | --- |
| CAN-I-08 | `canary scan` MUST write only `canary/findings.json` and, when asked, `canary/badge.svg`, inside the scanned repository. | S24 |
| CAN-I-09 | `canary init` MUST show the full diff of Canary configuration changes before writing and MUST write only configuration files for the selected agent. Existing unchanged values MUST be omitted from the preview; any existing sensitive values MUST be redacted. Generated project paths: `.claude/settings.json` [S1]; `.codex/hooks.json` [S8]; `.cursor/hooks.json` [S9]; `.gemini/settings.json` [S10]; `.opencode/plugins/canary/` and `opencode.jsonc` [S13][S16]. The plugin/extension manifests shipped in the package use `hooks/claude-code.json`, `hooks/codex.json`, and Gemini's `hooks/hooks.json`. | S1, S8, S9, S10, S13, S16 |

### 3.2 Functional requirements

#### Scan

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| CAN-F-01 | `canary scan` MUST run checks C1, C2, C3, C8, and C9 (defined in CAN-F-01.1 to CAN-F-01.5) on the repository and the local environment. | P0 | S24 checks 1, 2, 3, 8, 9 |
| CAN-F-01.1 | **C1, non-local test database.** The scanner MUST report each test, development, or preview configuration that sets a database URL whose host is not local (A9). Severity is **critical** when a test or setup script in the same repository runs `drop`, `truncate`, `reset`, or `migrate`; otherwise **high**. | P0 | S24 check 1 |
| CAN-F-01.2 | **C2, readable credentials.** The scanner MUST report (a) files tracked by Git that contain a credential pattern from the pattern list, (b) tracked `.env` files other than `.env.example`, and (c) the presence, not the content, of `~/.aws/credentials`, `~/.kube/config`, the gcloud configuration directory (`~/.config/gcloud` by default on Unix-like systems; the platform default or `CLOUDSDK_CONFIG` override where applicable [S28]), `~/.netrc`, and `~/.pgpass`. Severity is **critical** for (a) when the pattern is a live payment key or a private key, **high** otherwise. | P0 | S24 check 2, S28 |
| CAN-F-01.3 | **C3, unguarded recursive delete.** The scanner MUST report each recursive delete in repository scripts (`package.json` scripts, `*.sh`, `*.ps1`, `Makefile`) whose target contains a variable, a command substitution, or a glob, unless the variable uses the `${VAR:?}` form. It MUST report shell scripts that perform such a delete without `set -u`, and symlinks or Windows junctions inside the repository that resolve outside it. Severity **high**. | P0 | S24 check 3, CAN-N-03 |
| CAN-F-01.4 | **C8, unpinned or bypassing agent configuration.** The scanner MUST report MCP server entries without an exact version (for example `@latest`, a bare package name, or `npx -y <package>` with no version) in the MCP configuration files of the five agents; repository files that enable a permission-bypass mode whose name is documented by the agent (for Claude Code: `--dangerously-skip-permissions` and `permissions.defaultMode: "bypassPermissions"` [S3]; for Codex: `--dangerously-bypass-hook-trust` [S8]); and invisible or bidirectional Unicode control characters in `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.cursor/rules/`, and `.claude/rules/`. Severity **high** for hidden Unicode and bypass flags, **medium** for unpinned servers. | P0 | S24 check 8, S7 |
| CAN-F-01.5 | **C9, agent in CI on untrusted input.** The scanner MUST report each GitHub Actions workflow that uses the `pull_request_target` trigger, and each workflow triggered by `issues`, `issue_comment`, or `pull_request_review_comment` that runs a step from the configurable list of agent actions while it has access to secrets or a `permissions` block that grants write access or is missing. Severity **critical** for `pull_request_target` combined with a checkout of the pull request head; **high** otherwise. | P0 | S24 check 9 |
| CAN-F-02 | Each finding MUST contain: check ID, rule ID, severity, repository-relative path, line (or `null`), danger, consequence, in-repository fix (or `null`), and manual step (or `null`). It MUST NOT contain the value of a secret, a database URL, a host name taken from a credential, or an absolute path that reveals the user's home directory. | P0 | S24, [ADR-0003](decisions/0003-findings-without-secret-values.md) |
| CAN-F-03 | `canary scan` MUST compute a score from 0 to 100 using the weights in A8, and MUST order findings by descending weight, then path, then line, so the three worst findings come first. | P0 | S24, A8 |
| CAN-F-08 | `canary badge` MUST write an SVG badge that shows the score and MUST NOT contain any other data from the scan. | P0 | S24 |

#### Hook

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| CAN-F-04 | The hook MUST classify each shell command as **allow**, **warn**, or **block** using exactly the rules in [policy.md](specs/policy.md). A command that matches no rule MUST be allowed with no output. | P0 | S24 |
| CAN-F-05 | Every warn and block message MUST name the danger and its consequence, using the exact templates in [policy.md](specs/policy.md#message-text). | P0 | S24 |
| CAN-F-06 | When the hook cannot resolve the target of a recursive delete (empty or unset variable, command substitution, symlink or junction, glob that expands outside the project root, or a path outside the project root), it MUST block. | P0 | S24, policy B1 |
| CAN-F-19 | Canary MUST provide hook adapters for Claude Code, Codex, Cursor, Gemini CLI, and OpenCode, each using only the interface documented by that agent (section 3.1.2). | P0 | Maintainer input, [ADR-0005](decisions/0005-shared-core-with-thin-agent-adapters.md) |
| CAN-F-21 | `canary init` MUST enable the agent's documented fail-closed setting where available: `onFailure: "block"` for Claude Code [S1] and `failClosed: true` for Cursor [S9]. For Codex [S8] and Gemini CLI [S10], `init` MUST state that hook failures can let the action run. For Codex [S8], `init` MUST also tell users to review and trust the current project hook with `/hooks` before it runs. For OpenCode, `init` MUST state that fail-closed behavior is unverified and must not claim a hook failure blocks the action. These are configuration/documentation requirements, not evidence of live-agent verification. | P0 | S1, S8, S9, S10, S14 |

#### Crash test

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| CAN-F-07 | `canary crash-test` MUST run three destructive scenarios (recursive delete with an empty variable, `DROP TABLE` against a fake non-local `DATABASE_URL`, `git push --force` to a local bare remote) in an isolated copy of the repository, and show for each the result without Canary and with Canary. It MUST satisfy every isolation rule in [ADR-0004](decisions/0004-crash-test-isolation.md). | P0 | S24 |

### 3.3 Usability requirements

| ID | Requirement | Source |
| --- | --- | --- |
| CAN-U-01 | The scan summary MUST fit in 40 terminal lines for a repository with up to 50 findings, showing the score, the top three findings, and counts per severity. | Design |
| CAN-U-02 | Each block message MUST say what the user can do instead (the safe command or "ask a human to run it"). | S24 |
| CAN-U-03 | Public text (README, messages, docs) MUST use neutral, professional language. | S24 |

### 3.4 Performance requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| CAN-N-05 | The hook decision path (`evaluate()` in process) SHOULD answer in under 100 ms per command; the working target is a p50 below 10 ms for that in-process path. The operating-system runtime startup required to spawn the hook process is tracked separately as external cost: the full wall-clock median and p90 MUST still be published, together with the `node -e ""` startup floor and the environment, in every benchmark report. The wall-clock total MUST NOT be presented as an in-process result, and the target MUST NOT be claimed from a wall-clock measurement. | Benchmark: in-process p50/p90 and wall-clock p50/p90 with the Node floor; [ADR-0009](decisions/0009-split-performance-target.md) |
| CAN-N-06 | `canary scan` SHOULD finish in under 10 s on a repository of 5,000 tracked files. A measured run completed in 9.47 s after optimization; repeatable cross-platform measurement is outstanding. | Benchmark; current measurement is not a cross-platform result |

Benchmark runs on 2026-11-22 (UTC): Windows_NT 10.0.26200 (`win32`, `x64`), AMD Ryzen 5 7535HS with Radeon Graphics (12 logical processors), Node v22.22.2. The harness used 5 warm-ups and 50 measured samples per row; values are median/p90 milliseconds. All runs were local, sequential, and subject to large variance: an earlier recorded session measured a `node -e ""` floor of 1177.66/1868.79 ms, the "before" run below measured 113.02/119.05 ms, and the "after" run measured 138.45/172.23 ms. The three floors are not comparable, so neither hook table supports a reliable improvement or overhead claim. The absolute 100 ms target in CAN-N-05 is not met by any of these runs and may be below Node's startup floor on Windows.

"Before" generated hooks invoked `dist/cli/entry.js hook --agent <name>`; "after" generated hooks invoke the per-agent `dist/hook/<agent>.mjs` bundle. Rows show median / p90 in ms.

| Agent | Event | Before median / p90 | After median / p90 |
| --- | --- | ---: | ---: |
| Claude Code | allow | 174.63 / 183.85 | 209.71 / 324.25 |
| Claude Code | B3 block | 174.50 / 183.05 | 179.42 / 238.18 |
| Codex | allow | 203.18 / 216.06 | 236.38 / 322.43 |
| Codex | B3 block | 207.96 / 223.42 | 315.07 / 493.21 |
| Cursor | allow | 206.38 / 213.61 | 291.55 / 341.42 |
| Cursor | B3 block | 202.68 / 219.97 | 280.49 / 359.64 |
| Gemini CLI | allow | 204.34 / 215.31 | 307.27 / 398.09 |
| Gemini CLI | B3 block | 203.12 / 218.37 | 384.85 / 482.62 |
| OpenCode | allow | 167.47 / 177.40 | 239.27 / 283.81 |
| OpenCode | B3 block | 168.61 / 179.75 | 226.73 / 264.51 |

In-process `evaluate()` latency (excluding process startup, adapters and JSON I/O): before — source 0.03/0.07 ms allow, 0.03/0.06 ms B3; built 0.04/0.05 ms allow, 0.05/0.09 ms B3. After — source 0.03/0.08 ms allow, 0.05/0.13 ms B3; built 0.04/0.08 ms allow, 0.05/0.10 ms B3. These are not process-level hook measurements. No cross-platform result has been measured. Three further local runs were made while testing separate optimizations: a control run with a 240.88 ms floor, a B1-gate run with a 173.57 ms floor, and a lazy-env run with a 162.41 ms floor. Their hook medians moved in both directions and none showed a repeatable 5 ms improvement, so all three optimizations were reverted; see `CHANGELOG.md`. These floors confirm that the harness is too noisy for per-optimization claims on this machine. The final verification run on the integrated tree (20:35 UTC) printed a 199.68/244.52 ms floor and hook medians of 187.90–252.55 ms, again within the same noisy range. After the maintainer decision in ADR-0009, the verification run at 21:04 UTC printed a 169.71/312.21 ms floor, wall-clock hook medians of 190.05–295.76 ms, and in-process `evaluate()` medians of 0.03–0.05 ms (p90 0.06–0.19 ms). The final close-out run at 21:56 UTC printed a 184.86/213.04 ms floor, wall-clock hook medians of 184.31–277.91 ms, and in-process `evaluate()` medians of 0.03–0.05 ms (p90 0.07–0.11 ms). The CAN-N-05 target applies to the in-process row; the wall-clock rows are published as external runtime cost and are not presented as the target result. The final post-fix run at 22:15 UTC printed a 127.00/147.65 ms floor, wall-clock hook medians of 164.52–218.63 ms, and in-process `evaluate()` medians of 0.02–0.05 ms (p90 0.06–0.08 ms). The `npm run bench:mcp` close-out run was synthetic: 187.227 ms command-hook median versus 0.390 ms per MCP call on one process; it does not establish live agent behavior. The floors of all recorded runs differ widely, so wall-clock differences are not attributed to a specific code change.

### 3.5 Logical data: `findings.json`

`canary/findings.json` MUST follow this shape. Fields are illustrative; values are placeholders.

```json
{
  "schema_version": 1,
  "tool": { "name": "canary", "version": "0.1.0" },
  "score": 62,
  "summary": { "critical": 1, "high": 1, "medium": 1, "low": 0 },
  "findings": [
    {
      "id": "C2-aws-access-key-3f9a1c",
      "check": "C2",
      "rule": "aws-access-key-id",
      "severity": "critical",
      "path": "config/deploy.env",
      "line": 4,
      "evidence": { "kind": "secret-name", "name": "AWS_ACCESS_KEY_ID" },
      "danger": "An AWS access key is committed to the repository.",
      "consequence": "Anyone with read access to the repository can use the key.",
      "fix": "Remove the line and add config/deploy.env to .gitignore.",
      "manual": "Rotate the key in AWS. Removing it from the repository does not revoke it."
    }
  ]
}
```

| ID | Requirement | Source |
| --- | --- | --- |
| CAN-D-01 | `findings.json` MUST NOT contain timestamps, absolute paths, host names, user names, or secret values, so that two runs on the same repository produce byte-identical files (CAN-N-04). | ADR-0001, ADR-0003 |
| CAN-D-02 | `evidence` MUST hold only a kind and a name (variable name, key type, or rule name). | ADR-0003 |
| CAN-D-03 | `id` MUST be stable for the same check, rule, path, and line. | Design |

### 3.6 Design constraints

| ID | Requirement | Source |
| --- | --- | --- |
| CAN-C-01 | Implementation language: TypeScript on Node.js (A5). | Maintainer input |
| CAN-C-02 | The decision path (checks, policy, score) MUST NOT call an LLM. | [ADR-0001](decisions/0001-deterministic-core-without-llm.md) |
| CAN-C-03 | Each agent adapter MUST be a thin translation layer; policy logic MUST live in the shared core. | [ADR-0005](decisions/0005-shared-core-with-thin-agent-adapters.md) |
| CAN-C-04 | The package MUST use the documented agent package layouts: `.claude-plugin/plugin.json` referencing `hooks/claude-code.json` [S4]; `.codex-plugin/plugin.json` referencing `hooks/codex.json` [S8]; and `gemini-extension.json` with its hook definition in `hooks/hooks.json` [S12]. Cursor and OpenCode project configurations are produced by `canary init` at the paths in CAN-I-09 [S9][S13][S16]. | S4, S8, S9, S12, S13, S16 |
| CAN-C-05 | The package MUST include the built JavaScript entry point and one self-contained bundle per agent at `dist/hook/<agent>.mjs`. The bin MUST run `dist/cli/entry.js`; every command hook MUST run that agent's bundle with stdin and stdout and MUST NOT pass through `cli/main`. Bundles MUST contain the core and only their own adapter, MUST import only `node:` built-ins, and MUST fail the build if a relative import remains. The source entry MAY run only when `CANARY_DEV=1` is explicitly set. GitHub marketplace installs MUST NOT depend on an install-time build step. | ADR-0006, ADR-0007; S4, S8, S12, S27 |

### 3.7 Software system attributes

| ID | Requirement | Verification |
| --- | --- | --- |
| CAN-N-01 | The scanner MUST NOT open network connections and MUST NOT use credentials. | Run with the network blocked; the test fails on any connection attempt |
| CAN-N-02 | Installation MUST need one command and no native dependencies. | Clean install on macOS, Linux, and Windows |
| CAN-N-03 | Canary MUST work on macOS, Linux, and Windows. On Windows, symlinks and junctions MUST count in C3 and in policy B1. Paths from Claude Code arrive with backslashes on Windows and MUST be normalized before comparison [S1]. | CI matrix covers Ubuntu, macOS, and Windows with Node.js 22.22.0 and latest; matrix presence is not a record that this run passed. |
| CAN-N-04 | Results MUST be deterministic: the same repository gives the same `findings.json`. | Two runs, byte comparison |
| CAN-N-08 | The README MUST include install per agent, a demo, the score, and a table of what Canary does not protect. | Manual review |
| CAN-N-09 | The license MUST be MIT. | `LICENSE` file |
| CAN-N-10 | No output, log, or file written by Canary may contain a secret value or a value of an environment variable. This MUST be enforced by an automated test (CAN-T-02). | Test |
| CAN-N-11 | The hook MUST NOT write logs outside the project's `canary/` directory and MUST NOT record user identity fields that an agent sends, such as Cursor's `user_email` [S9]. | Test |

---

## 4. Verification and acceptance

### 4.1 Verification methods

The latest reported local test run has 169 passing tests, no skips and no failures (169 tests total), including bundle-level CAN-T-03/CAN-T-04 checks, a D3 regression guard, and synthetic MCP contract tests. The network-disabled integration check passed. A packaged offline smoke verified the five `init` target paths and ran the generated Cursor bundle through `process.execPath` with an absolute path against synthetic input, where it returned deny; a `canary` executable on `PATH` is not required. A GitHub Actions matrix for Ubuntu, macOS, and Windows with Node.js 22.22.0 and latest ran successfully on 2026-11-22: all six jobs passed and each uploaded `benchmark-numbers-*` (run `45076233582`). Two earlier runs failed on macOS symlink containment and the archived-hook launch path; both were fixed and rerun green. These results do not establish all MVP acceptance criteria: AC-4 still lacks a real pass for four of the five agents, and the hosted benchmark numbers are informational.

| ID | Method | Covers |
| --- | --- | --- |
| CAN-T-01 | **Trap repositories.** `fixtures/` holds one repository per P0 check that must produce exactly the expected findings, plus one clean repository that must produce none. | CAN-F-01.x, CAN-F-02, CAN-F-03 |
| CAN-T-02 | **No-leak test.** Fixtures contain synthetic secrets that include a unique marker string. The test runs `scan`, `hook`, `crash-test`, and `badge`, and fails if the marker appears in stdout, stderr, any written file, or any log. | CAN-F-02, CAN-N-10, CAN-D-01 |
| CAN-T-03 | **Policy table.** A table of commands with the expected decision and message for each rule in policy.md, run through the core, through each adapter, and through each agent's self-contained bundle. | CAN-F-04, CAN-F-05, CAN-F-06, CAN-I-05, CAN-C-05 |
| CAN-T-04 | **Adapter and init contract.** For each agent, sample events built from that agent's documentation are piped to `canary hook --agent <name>` and to `dist/hook/<agent>.mjs`, and the output is validated against the documented fields. CLI tests also validate generated init configuration and required agent-specific notices. | CAN-F-19, CAN-F-21, CAN-I-03, CAN-I-05, CAN-I-06, CAN-I-07, CAN-C-05 |
| CAN-T-05 | **Live agent check.** For each agent, a manual run in a disposable repository attempts the harmless sentinel deletion and a force push to a local bare remote; both must be denied before execution, each decision must be attributable to Canary, and the agent version, OS, mode, date, and evidence are recorded in the live-check runbook. The setup follows ADR-0004. | CAN-F-19, Q1 to Q5 |
| CAN-T-06 | **Isolation check.** The crash test runs inside a watcher that records every file write; the test fails on any write outside the temporary directory. | CAN-F-07 |
| CAN-T-07 | **Determinism.** Two scans of each fixture produce byte-identical `findings.json`. | CAN-N-04, CAN-D-01 |
| CAN-T-08 | **Offline.** The scan runs with networking disabled. | CAN-N-01 |
| CAN-T-09 | **Archived package runtime.** Create a copy with `git archive HEAD`, run a packaged command hook from that copy, and reject any attempt to load a `.ts` module. | CAN-C-05 |

### 4.2 MVP acceptance criteria

The MVP is accepted when all of these hold:

- [ ] **AC-1.** `canary scan` detects each of the five P0 checks in its trap repository and reports nothing on the clean repository (CAN-T-01).
- [ ] **AC-2.** No output of any command contains a synthetic secret marker (CAN-T-02).
- [ ] **AC-3.** The hook allows a safe command with no prompt and blocks the four block rules B1 to B4 with the exact message text, in the core and in all five adapters (CAN-T-03, CAN-T-04).
- [ ] **AC-4.** For each of the five agents, a disposable live run confirms both test commands are denied before execution by Canary, and records the agent version, OS, mode, date, and evidence (CAN-T-05). An agent that fails this check is listed as unsupported in the README until fixed. **Status 2026-11-22:** Cursor, Claude Code (`bypassPermissions`), and OpenCode (normal mode, sandbox-only removal of the generated force-push deny rule for attribution) each have one observed live pass; Codex has an observed live failure until hook trust is granted and is listed as unsupported; Gemini CLI is unverified (CLI not installed). AC-4 is therefore still open. See [the runbook](testing/live-agent-checks.md#results).
- [ ] **AC-5.** The crash test shows the before and after for three scenarios without writing anything outside its temporary directory (CAN-T-06).
- [ ] **AC-6.** Install and first scan work with two commands on a clean machine.
- [ ] **AC-7.** The README states what Canary does not protect, including the fail-open behavior of Codex and Gemini CLI.
- [ ] **AC-8.** Two scans of the same fixture produce identical `findings.json` (CAN-T-07).

---

## 5. Roadmap requirements (P1 and P2)

These requirements come from the design notes [S24]. They are not specified in detail and are not part of the MVP.

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| CAN-F-09 | Checks 4, 6, 7, 10, and 11; account-level items appear as manual steps. | P1 | S24 checks 4, 6, 7, 10, 11 |
| CAN-F-10 | Fix mode: applies only in-repository fixes, after explicit approval, showing the diff first. | P1 | S24 |
| CAN-F-11 | Rules compiler: finds prose rules in `AGENTS.md`, `CLAUDE.md`, `.cursorrules` and proposes the control that enforces each; marks rules with no control as orphaned. | P1 | S24 check 5 |
| CAN-F-12 | Decoys: fake credentials and `DATABASE_URL` values that record when the agent touches them. | P1 | S24 |
| CAN-F-13 | MCP server with `canary_score` and `canary_findings` tools that return results by reference (for example a `resource_link` [S6]), with no command execution, no writes, and no network. | P1 | S24, S6, S7 |
| CAN-F-14 | `canary freeze on` / `off`: read-only mode for the agent. | P1 | S24 |
| CAN-F-15 | Warn-only mode and per-repository exceptions. | P1 | S24 |
| CAN-F-20 | Rules that survive context compaction: a session-start hook reinjects a short summary of critical rules (Q10). | P1 | S24 |
| CAN-F-16 | Append-only, hash-chained authorization log with no secret values. | P2 | S24 |
| CAN-F-17 | Scope contract in `canary.yml` with a threshold of touched files. | P2 | S24 |
| CAN-F-18 | `canary scan --ci` fails when the score drops below a minimum. | P2 | S24 check 9 |
| CAN-F-22 | Destination allowlist: warn or block calls to hosts outside a list. Best effort only; the real control is an egress firewall. | P2 | S24 |

---

## 6. Traceability

| Requirement | Source | Design | OpenSpec capability | Verification | Acceptance |
| --- | --- | --- | --- | --- | --- |
| CAN-F-01, CAN-F-01.1 to .5 | S24 checks 1, 2, 3, 8, 9 | ADR-0001 | — | CAN-T-01, CAN-T-08 | AC-1 |
| CAN-F-02 | S24 | ADR-0003 | — | CAN-T-01, CAN-T-02 | AC-1, AC-2 |
| CAN-F-03 | S24, A8 | ADR-0001 | — | CAN-T-01, CAN-T-07 | AC-1, AC-8 |
| CAN-F-04 | S24 | policy.md, ADR-0002 | [hook-policy](../openspec/specs/hook-policy/spec.md) | CAN-T-03 | AC-3 |
| CAN-F-05 | S24 | policy.md | [hook-policy](../openspec/specs/hook-policy/spec.md) | CAN-T-03 | AC-3 |
| CAN-F-06 | S24 | policy.md B1 | [hook-policy](../openspec/specs/hook-policy/spec.md) | CAN-T-03 | AC-3 |
| CAN-F-07 | S24 | ADR-0004 | — | CAN-T-06 | AC-5 |
| CAN-F-08 | S24 | ADR-0003 | — | CAN-T-02 | AC-2 |
| CAN-U-01 to CAN-U-03 | Design, S24 | README, policy.md | [hook-policy](../openspec/specs/hook-policy/spec.md) | CAN-T-03 | AC-3, AC-7 |
| CAN-C-01 | Maintainer input, A5 | ADR-0006 | — | Build | — |
| CAN-C-02 | ADR-0001 | ADR-0001 | — | CAN-T-08 | AC-1 |
| CAN-C-03 | ADR-0005 | ADR-0005, agent-adapters.md | [agent-adapters](../openspec/specs/agent-adapters/spec.md) | CAN-T-04 | AC-3 |
| CAN-C-04 | S4, S8, S9, S12, S13, S16 | agent-adapters.md | [agent-adapters](../openspec/specs/agent-adapters/spec.md) | CAN-T-09 | — |
| CAN-N-09 | S24 | LICENSE | — | File check | — |
| CAN-F-19 | Maintainer input, S1, S8, S9, S10, S11, S14 | ADR-0005, agent-adapters.md | [agent-adapters](../openspec/specs/agent-adapters/spec.md) | CAN-T-04, CAN-T-05 | AC-3, AC-4 |
| CAN-C-05 | ADR-0007, S4, S8, S12 | ADR-0007 | [agent-adapters](../openspec/specs/agent-adapters/spec.md) | CAN-T-09 | — |
| CAN-F-21 | S1, S8, S9, S10, S14 | ADR-0002, agent-adapters.md | [agent-adapters](../openspec/specs/agent-adapters/spec.md) | CAN-T-04 | AC-7 |
| CAN-I-01 to CAN-I-04 | S24, A4 | — | — | CAN-T-04 | AC-6 |
| CAN-I-05 to CAN-I-07 | S1, S9 | agent-adapters.md | [agent-adapters](../openspec/specs/agent-adapters/spec.md) | CAN-T-04 | AC-3 |
| CAN-I-08, CAN-I-09 | S1, S8, S9, S10, S13, S16 | — | [agent-adapters](../openspec/specs/agent-adapters/spec.md) | CAN-T-06 | AC-5 |
| CAN-D-01 to CAN-D-03 | ADR-0001, ADR-0003 | ADR-0003 | — | CAN-T-02, CAN-T-07 | AC-2, AC-8 |
| CAN-N-01 | S24 | ADR-0001 | — | CAN-T-08 | AC-1 |
| CAN-N-02 | S24 | — | — | Clean install | AC-6 |
| CAN-N-03 | S24, S1 | — | — | Tests on three systems | AC-1, AC-3 |
| CAN-N-04 | S24 | ADR-0001 | — | CAN-T-07 | AC-8 |
| CAN-N-05, CAN-N-06 | S24 | — | — | Benchmark | — |
| CAN-N-08 | S24 | README | — | Manual review | AC-7 |
| CAN-N-10, CAN-N-11 | S24, S9 | ADR-0003 | — | CAN-T-02 | AC-2 |

---

## Appendix A. Assumptions and dependencies

Assumptions A1 to A9 and open questions Q1 to Q26 are kept in [open-questions.md](open-questions.md) so that they are updated in one place. The requirements that depend most on them:

- CAN-F-19 and AC-4 depend on Q1 to Q5.
- CAN-F-21 depends on Q6 and Q7.
- CAN-F-03 depends on A8.
- CAN-F-01.1 depends on A9.

## Appendix B. The 11 audit checks

The checks come from the original audit prompt, restated in the design notes [S24]. P0 covers checks 1, 2, 3, 8, and 9.

| # | What it looks for | Priority |
| --- | --- | --- |
| 1 | Test, development, or preview configuration pointing to a non-local or production database, especially when tests drop, truncate, reset, or migrate | P0 (C1) |
| 2 | Production or broad-scope credentials readable from the shell; keys in the repository; a production default context | P0 (C2, repository and file presence only) |
| 3 | Recursive deletes whose target comes from a variable, glob, or link; scripts without `set -u`; symlinks and junctions; tests that change `HOME` | P0 (C3) |
| 4 | Infrastructure a command can destroy: no deletion protection, loose state files, `auto-approve` or `--force`, backups the same token can delete | P1 |
| 5 | Rules that exist only as prose in `AGENTS.md`, `CLAUDE.md`, `.cursorrules` | P1 (rules compiler) |
| 6 | Unprotected main branch; broad Git hosting token scopes | P1 (manual steps) |
| 7 | Repository inside a synced folder (iCloud, Dropbox, OneDrive); zero-byte or cloud-only files | P1 |
| 8 | Unpinned MCP servers, unknown hooks and skills, permission-bypass flags, hidden Unicode in rule files | P0 (C8) |
| 9 | CI that runs an AI agent on untrusted input with secrets or write access | P0 (C9) |
| 10 | Auto-approval or full-access modes; safety nets the agent does not load | P1 |
| 11 | Tools that move money or messages with no cap, allowlist, or confirmation | P1 |

## Appendix C. Glossary

| Term | Meaning |
| --- | --- |
| Adapter | The part of Canary that translates one agent's hook input and output to and from the core |
| Blast Radius Score | A 0 to 100 heuristic of how ready a repository is for an autonomous agent; higher is safer (A8) |
| Block | The hook refuses the command and the agent does not run it |
| Fail closed | When the hook cannot decide or fails, the action is refused |
| Fail open | When the hook fails, the action runs |
| Local host | See A9 |
| Warn | The hook lets the command run and shows the danger and consequence |
