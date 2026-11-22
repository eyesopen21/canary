# Agent instructions

These are the canonical instructions for coding agents working in this repository. `CLAUDE.md` points here so instructions do not drift.

## Start here

Canary has a local TypeScript implementation, a JavaScript package build, tests, and five agent adapters. The adapters have not been verified in live sessions with their respective agents. Before changing behavior, read:

1. [docs/SRS.md](docs/SRS.md) for requirement IDs and acceptance criteria.
2. [docs/specs/policy.md](docs/specs/policy.md) for hook rules and exact messages.
3. [docs/specs/agent-adapters.md](docs/specs/agent-adapters.md) for agent interfaces and packaging.
4. [docs/decisions/](docs/decisions/) for accepted architecture decisions.
5. [docs/open-questions.md](docs/open-questions.md) for assumptions and unverified points.
6. `openspec/` for the structured policy and adapter specifications [S29].

## Layout

| Path | Contents |
| --- | --- |
| `src/core/` | Checks, policy rules, messages, and score |
| `src/adapters/` | Thin agent-specific input/output adapters |
| `src/cli/` | CLI commands and generated agent configurations |
| `src/crash-test/` | Isolated destructive-command demonstrations |
| `bin/canary.js`, `dist/` | npm executable and generated JavaScript |
| `hooks/`, `.claude-plugin/`, `.codex-plugin/`, `gemini-extension.json` | Claude, Codex, and Gemini package manifests/configurations |
| `.cursor/`, `.opencode/` | Example project hook configuration and plugin |
| `tests/`, `fixtures/` | Automated checks and synthetic repositories |
| `docs/`, `openspec/` | Human-readable requirements and structured specs |

The Node build uses built-in TypeScript type stripping to generate JavaScript. See [ADR-0006](docs/decisions/0006-zero-dependency-typescript-on-node.md).

## Rules

Each rule names its enforcement or says when no automated control exists.

| Rule | Enforced by |
| --- | --- |
| Never print, log, commit, or paste a secret value, a database URL, a credential-derived host, or an environment value. Use names and repository-relative locations only. | No-leak requirement CAN-T-02 and review; do not treat the requirement as proof that an unrun check passed. |
| Fixtures use only synthetic secrets with the test marker. Never copy real credentials into fixtures, even if revoked. | Review and CAN-T-02 when run. |
| The core must not call an LLM or open a network connection. | ADR-0001 and CAN-T-08 when run. |
| Policy logic lives in `src/core/`, not in an agent adapter. | ADR-0005 and adapter contract. |
| A hook policy change updates `docs/specs/policy.md` and `openspec/specs/hook-policy/spec.md` in the same change. An adapter or packaging change updates `docs/specs/agent-adapters.md` and `openspec/specs/agent-adapters/spec.md` in the same change. | Review; no automated synchronization check exists. |
| A claim about an agent, protocol, or standard cites a source in `docs/sources.md`. If a behavior is not verified, record it in `docs/open-questions.md` and do not present it as tested. | Review. |
| Public text is neutral, states the limits of Canary, and does not describe roadmap behavior as implemented. | Review. |
| Do not run the crash test or any destructive command outside a temporary directory created for it. | ADR-0004; CAN-T-06 when run. |

## Workflow

- Check `git status --short` before editing. Do not discard, stash, or reformat changes you did not make.
- Keep each change focused. Add user-visible changes to `CHANGELOG.md` under `[Unreleased]`.
- When changing a requirement, update the SRS traceability table and both affected docs/specs and OpenSpec capability spec in the same change.
- Validate OpenSpec changes with `openspec validate --strict` [S29]; archive a completed delta only after its requirements have been reconciled with the canonical docs.
- Do not claim tests, acceptance criteria, packaging, or live-agent checks passed unless they were actually run and results recorded.
- The project test command is `npm test`; build with `npm run build`. Do not run the destructive demo except in its isolated temporary directory.

## Operational boundaries

- Do not publish packages, create releases, push tags, or change repository settings.
- Do not read files outside this repository, and never read credential files in the home directory. Use fixtures.
- Do not add dependencies to the core without an ADR.
