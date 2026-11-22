# Canary

**Give your coding agent autonomy without giving it production access.**

Canary audits a repository and its local development environment, scores how much irreversible damage a coding agent could do there, and installs a pre-execution hook that stops only the irreversible actions. Everything else runs without a prompt.

It works with Claude Code, Codex, Cursor, Gemini CLI, and OpenCode.

> [!IMPORTANT]
> **Status: design phase. Nothing is published yet.**
> This repository holds the requirements, decisions, and policy for Canary. The install commands and the CLI below describe the planned MVP. They do not work until the first release appears in the [changelog](CHANGELOG.md). See the [roadmap](#roadmap) for what is planned after the MVP.
>
> Citations such as [S1] refer to [docs/sources.md](docs/sources.md).

[Install](#install) · [Quick start](#quick-start) · [Commands](#commands) · [What Canary protects](#what-canary-protects-and-what-it-does-not) · [How it works](#how-it-works) · [Docs](#documentation)

---

## What it does

1. **Audits.** Runs deterministic checks with no LLM. It never prints secret values: only names, types, and `file:line`.
2. **Scores.** Computes a Blast Radius Score from 0 to 100 (higher is safer) and lists the three worst risks first.
3. **Protects.** Adds a pre-execution hook to your agent. The hook blocks recursive deletes it cannot resolve, destructive SQL and migrations against non-local databases, force pushes, and `terraform apply -auto-approve`. Each block names the danger and the consequence.

The name refers to the canary in a coal mine, which warned miners before the disaster, and to canary tokens, decoy credentials that reveal who touched them. Decoys are on the [roadmap](#roadmap).

## Install

> [!NOTE]
> Planned commands. They depend on the first release. The repository is `eyesopen21/canary` and the npm package name is an assumption ([A4](docs/open-questions.md#assumptions)).

| Agent | How Canary attaches | Planned install |
| --- | --- | --- |
| [Claude Code](#claude-code) | Plugin with a `PreToolUse` hook in `hooks/hooks.json` [S1][S4] | `/plugin marketplace add eyesopen21/canary` |
| [Codex](#codex) | Plugin with a bundled `PreToolUse` hook [S8] | `codex plugin marketplace add eyesopen21/canary` |
| [Gemini CLI](#gemini-cli) | Extension with a `BeforeTool` hook in `hooks/hooks.json` [S10][S12] | `gemini extensions install https://github.com/eyesopen21/canary` |
| [Cursor](#cursor) | Project hook in `.cursor/hooks.json` [S9] | `npx @eyesopen21/canary init --agent cursor` |
| [OpenCode](#opencode) | Plugin in `.opencode/plugins/` using the permission `evaluate` hook [S13][S14] | `npx @eyesopen21/canary init --agent opencode` |

The scanner and the crash test are the same CLI for every agent:

```bash
npx @eyesopen21/canary scan
```

### Claude Code

```text
/plugin marketplace add eyesopen21/canary
/plugin install canary@canary
```

The plugin registers a `PreToolUse` hook on the `Bash` and `PowerShell` tools with `onFailure: "block"`, so a hook that crashes or times out blocks the command instead of letting it through [S1]. `onFailure` needs Claude Code v2.1.295 or later [S1].

### Codex

```bash
codex plugin marketplace add eyesopen21/canary
codex plugin add canary@canary
```

Codex asks you to review and trust plugin hooks before they run [S8]. Open `/hooks` in the CLI to approve the Canary hook.

> [!WARNING]
> Codex documents that a `PreToolUse` error, timeout, or malformed response can let the tool run [S8]. Canary cannot fail closed on Codex today ([Q6](docs/open-questions.md#open-questions-about-the-agents)).

### Gemini CLI

```bash
gemini extensions install https://github.com/eyesopen21/canary
```

Gemini CLI fingerprints project hooks and warns you when a hook's name or command changes [S10].

> [!WARNING]
> On Gemini CLI, a hook that exits with a code other than 0 or 2, or prints anything that is not JSON, lets the action proceed [S10]. Canary cannot fail closed on Gemini CLI today ([Q7](docs/open-questions.md#open-questions-about-the-agents)).

### Cursor

```bash
npx @eyesopen21/canary init --agent cursor
```

This writes a `preToolUse` hook for the `Shell` tool to `.cursor/hooks.json`, with `failClosed: true` [S9]. Project hooks run only in trusted workspaces [S9]. Commit the file so the whole team gets it.

### OpenCode

```bash
npx @eyesopen21/canary init --agent opencode
```

This adds a plugin under `.opencode/plugins/canary/`, which OpenCode loads automatically [S13]. The plugin reviews `shell` permission checks with `ctx.permission.hook("evaluate", ...)` and sets the effect to `deny` for blocked commands [S14]. `init` also writes `deny` rules to `opencode.jsonc`, because an explicit configured `deny` is final [S14][S16].

## Quick start

```bash
# 1. Audit the repository. Read-only, no network, no credentials.
npx @eyesopen21/canary scan

# 2. Install the hook for your agent.
npx @eyesopen21/canary init --agent claude-code

# 3. See what the hook stops, in a disposable copy of the repository.
npx @eyesopen21/canary crash-test
```

`scan` prints the score, the three worst findings, and writes `canary/findings.json`. Findings never contain secret values ([ADR-0003](docs/decisions/0003-findings-without-secret-values.md)).

## Commands

| Command | What it does | Status |
| --- | --- | --- |
| `canary scan` | Runs the MVP checks, computes the score, writes `canary/findings.json` | MVP, planned |
| `canary scan --json` | Prints findings as JSON on stdout instead of the summary | MVP, planned |
| `canary init --agent <name>` | Writes the hook configuration for `claude-code`, `codex`, `cursor`, `gemini-cli`, or `opencode` | MVP, planned |
| `canary hook --agent <name>` | The hook entry point the agent calls. Reads the event on stdin and answers allow, warn, or block | MVP, planned |
| `canary crash-test` | Runs three destructive scenarios in an isolated copy and shows the result with and without Canary | MVP, planned |
| `canary badge` | Writes a score badge for your README | MVP, planned |
| `canary fix` | Applies in-repository fixes after explicit approval | Roadmap |
| `canary freeze on` / `off` | Puts the agent in read-only mode | Roadmap |
| `canary rules` | Finds rules written only as prose in `AGENTS.md`, `CLAUDE.md`, `.cursorrules` and proposes a control for each | Roadmap |
| `canary scan --ci` | Fails a pull request when the score drops below a minimum | Roadmap |

The exact allow, warn, and block rules and the text of each message are in the [hook policy](docs/specs/policy.md).

## What Canary protects and what it does not

Canary reduces the damage of an agent that makes a mistake or is misled. **It does not stop an agent, a script, or a person determined to get around it.** Treat it as a seatbelt, not a wall.

| Situation | Protected? | Why |
| --- | --- | --- |
| `rm -rf "$DIR"` where `$DIR` is empty, unset, a symlink, or outside the project | Yes, blocked | The hook fails closed when it cannot resolve the target ([policy B1](docs/specs/policy.md#b1-recursive-delete-with-an-unresolved-target)) |
| `DROP`, `TRUNCATE`, or a reset migration while `DATABASE_URL` points to a non-local host | Yes, blocked | [Policy B2](docs/specs/policy.md#b2-destructive-database-command-against-a-non-local-host) |
| `git push --force` | Yes, blocked | [Policy B3](docs/specs/policy.md#b3-force-push) |
| `terraform apply -auto-approve` | Yes, blocked | [Policy B4](docs/specs/policy.md#b4-infrastructure-change-without-review) |
| Credentials committed to the repository, unpinned MCP servers, `pull_request_target` workflows | Reported by `scan` | Static checks; Canary does not change your config without approval |
| The same destructive effect run through a script, an interpreter, or a `make` target | **No** | The hook sees the command text, not its effect |
| An agent session where the hook is not loaded: hooks turned off, an untrusted workspace, or a mode that skips hooks | **No** | Canary only runs when the agent calls it. Whether each agent's approval-free mode still runs hooks is not yet verified ([Q1 to Q4](docs/open-questions.md#open-questions-about-the-agents)) |
| A Canary hook that crashes on Codex or Gemini CLI | **No** | Those agents let the action run when a hook fails [S8][S10] |
| What a cloud token can really do | **No** | The scanner is offline and never calls a cloud account |
| An attacker with access to your machine, or untrusted code | **No** | Use OS-level isolation (a container or VM) and an egress firewall |
| Data loss from causes other than the agent | **No** | Backups are still your job |

Controls that **are** barriers, which Canary checks for and recommends but does not replace: your agent's own deny rules, read-only database roles, branch protection with required review, backups the agent's token cannot delete, and production credentials kept out of the developer account.

The full analysis is in the [threat model](docs/THREAT-MODEL.md).

> [!NOTE]
> The Blast Radius Score is a heuristic. It is not a certification or an audit opinion.

## How it works

```text
   scan ──┐                                ┌── Claude Code  (PreToolUse)
          ├──> core: checks, policy, score ┼── Codex        (PreToolUse)
   hook ──┘          (no LLM, no network)  ├── Cursor       (preToolUse)
                                           ├── Gemini CLI   (BeforeTool)
                                           └── OpenCode     (permission evaluate)
```

`canary scan` and `canary hook` call the same core, so what the scanner reports as a risk is what the hook stops. Each agent gets a thin adapter that translates its hook input and output to the core's decision ([ADR-0005](docs/decisions/0005-shared-core-with-thin-agent-adapters.md)). The core has no LLM in the decision path ([ADR-0001](docs/decisions/0001-deterministic-core-without-llm.md)), and the hook is one layer among several ([ADR-0002](docs/decisions/0002-hook-is-one-layer-not-the-boundary.md)).

### Support by agent

| | Claude Code | Codex | Cursor | Gemini CLI | OpenCode |
| --- | --- | --- | --- | --- | --- |
| Blocks before execution | Yes [S1] | Yes [S8] | Yes [S9] | Yes [S11] | Yes [S14] |
| Fails closed if the hook crashes | Yes, with `onFailure: "block"` [S1] | No [S8] | Yes, with `failClosed: true` [S9] | No [S10] | Not verified ([Q5](docs/open-questions.md#open-questions-about-the-agents)) |
| Warns without blocking | Yes, `additionalContext` and `systemMessage` [S1] | Yes, `additionalContext` and `systemMessage` [S8] | Not today ([Q8](docs/open-questions.md#open-questions-about-the-agents)) | Yes, `systemMessage` [S11] | As an `ask` prompt [S14] |

## Roadmap

These items come from the design notes [S24]. None of them is built.

- **v1:** the remaining six audit checks, fix mode with approval, decoy credentials, an MCP server that returns findings by reference, the rules compiler, rules that survive context compaction, `canary freeze`, warn-only mode, and per-repository exceptions.
- **v2:** an append-only, hash-chained authorization log, a scope contract in `canary.yml`, a destination allowlist, and `canary scan --ci`.

Requirement IDs for each item are in the [SRS](docs/SRS.md#5-roadmap-requirements-p1-and-p2).

## Documentation

| Document | Contents |
| --- | --- |
| [docs/SRS.md](docs/SRS.md) | Requirements with IDs, acceptance criteria, traceability |
| [docs/specs/policy.md](docs/specs/policy.md) | What the hook allows, warns about, or blocks, with the exact message text |
| [docs/specs/agent-adapters.md](docs/specs/agent-adapters.md) | How each agent's hook input and output map to the core |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | Threats, mitigations, and what remains |
| [docs/decisions/](docs/decisions/) | Architecture decision records |
| [docs/open-questions.md](docs/open-questions.md) | Assumptions and unverified points |
| [docs/sources.md](docs/sources.md) | Every source cited as `[Sn]` |

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report vulnerabilities in Canary as described in [SECURITY.md](SECURITY.md), not in public issues.

## License

[MIT](LICENSE)
