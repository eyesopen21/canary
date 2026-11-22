# Marketplace listing draft

## Listing line

Local guardrails for risky coding-agent shell actions.

## Description (under 500 characters)

Canary scans a repository for selected agent-related risks and adds a project hook that blocks a small set of destructive shell commands, including unresolved recursive deletes and force pushes. It runs locally, does not inspect cloud accounts, and is not a security boundary. Hooks can be bypassed, may fail open, and require review in each agent before trust.

## Technology

- TypeScript source, with JavaScript output built using Node.js's built-in TypeScript support [S27].
- Node.js 22.22 or later, npm, and Git.
- No runtime npm dependencies. The core scanner and policy run locally; no account or cloud scan is performed.

## Install from this checkout

Canary is not currently published to npm. From a source checkout with Node.js, npm, and Git installed, create and install the local package:

```sh
npm pack
npm install --global ./eyesopen21-canary-0.1.0.tgz
```

After installing the CLI, run `canary init --agent <name>` in the project where the hook should run. Review the proposed project configuration before accepting it. These commands write project-level integration files, not user-level policies.

| Agent | Init value | Project integration |
| --- | --- | --- |
| Claude Code [S1] | `claude-code` | `.claude/settings.json` with `PreToolUse` hook |
| Codex [S8] | `codex` | `.codex/hooks.json` with `PreToolUse` hook; separately review and trust the hook |
| Cursor [S9] | `cursor` | `.cursor/hooks.json` with `preToolUse` hook |
| Gemini CLI [S10] [S11] | `gemini-cli` | `.gemini/settings.json` with `BeforeTool` hook; review its fingerprint if prompted |
| OpenCode [S13] [S14] [S16] | `opencode` | `.opencode/plugins/canary/` plus `opencode.jsonc` |

Generated hook formats are documented in the [agent adapter guide](specs/agent-adapters.md). A generated configuration is not proof that a live agent check passed; see the [live-agent runbook](testing/live-agent-checks.md).

## Two-minute local demo

With Node.js 22.22 or later and the checkout's committed build, run:

```sh
node scripts/marketplace-demo.mjs
```

The zero-dependency script captures the real `canary crash-test` summary, which runs its guarded destructive demonstrations only inside a fresh OS temporary directory. The database case is simulation-only and makes no connection [S24]. It also copies the `clean` and `trap-c1` synthetic fixtures into a separate temporary directory and scans those copies. The generated SVG reports only scenario counts, scores, and finding counts; it omits command text, raw scan output, secrets, and filesystem paths. The script removes its temporary fixture tree after the run and writes `docs/marketplace-demo.svg`.
