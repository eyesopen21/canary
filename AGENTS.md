# Agent instructions

These are the canonical instructions for any coding agent working in this repository. `CLAUDE.md` points here so the instructions do not drift between agents.

## Start here

Canary is a design-phase project. Today the repository holds documentation only; there is no source code, package manifest, or test suite yet. Read these before changing anything:

1. [docs/SRS.md](docs/SRS.md) for what Canary must do. Every behavior needs a requirement ID.
2. [docs/specs/policy.md](docs/specs/policy.md) for the hook rules and message text.
3. [docs/specs/agent-adapters.md](docs/specs/agent-adapters.md) for each agent's hook interface.
4. [docs/decisions/](docs/decisions/) for decisions that are already made.
5. [docs/open-questions.md](docs/open-questions.md) for what is assumed or unverified.

## Planned layout

The code does not exist yet. When it is added, it follows this layout:

| Path | Contents |
| --- | --- |
| `src/core/` | Checks, policy rules, message templates, score. No agent-specific code. |
| `src/adapters/` | One file per agent. Translation only, no policy logic ([ADR-0005](docs/decisions/0005-shared-core-with-thin-agent-adapters.md)). |
| `src/cli/` | `scan`, `hook`, `init`, `crash-test`, `badge`. |
| `fixtures/` | One trap repository per check, plus one clean repository. |
| `tests/` | Policy table, adapter contracts, no-leak test, isolation test. |
| `.claude-plugin/`, `.codex-plugin/`, `gemini-extension.json`, `hooks/hooks.json` | Agent packaging (CAN-C-04). |

## Rules

Each rule names the control that will enforce it, or says that none exists yet. A rule with no control is a request, not a guarantee; this repository practices what check 5 of the audit asks for.

| Rule | Enforced by |
| --- | --- |
| Never print, log, commit, or paste a secret value, a database URL, a host name taken from a credential, or an environment variable value. Use names and `file:line` only. | No-leak test CAN-T-02 (planned) |
| Fixtures use only synthetic secrets that contain the marker string defined in the test suite, so the no-leak test can find them. Never copy a real key into a fixture, even a revoked one. | No-leak test CAN-T-02 (planned) and review |
| The core must not call an LLM or open a network connection. | ADR-0001; offline test CAN-T-08 (planned) |
| Policy logic lives in `src/core/`, never in an adapter. | ADR-0005; review |
| A change to a hook rule updates `docs/specs/policy.md`, including the exact message text, in the same change. | Policy table test CAN-T-03 (planned) |
| A claim about an agent, protocol, or standard cites a source in `docs/sources.md`. Do not invent event names, field names, flags, or file paths. If a fact cannot be verified, add it to `docs/open-questions.md` instead. | Review; no automated control yet |
| Public text is neutral and professional. | Review; no automated control yet |
| Say clearly what Canary does not protect. Never describe a roadmap item as implemented. | Review; no automated control yet |
| Do not run the crash test, or any destructive command, outside a temporary directory created for it. | ADR-0004; isolation test CAN-T-06 (planned) |

## Workflow

- Run `git status` before editing. Do not discard, stash, or reformat changes you did not make.
- Keep each change to one topic. Update `CHANGELOG.md` under `[Unreleased]` for anything user-visible.
- If you change a requirement, update the traceability table in `docs/SRS.md`.
- When the code exists, run the full test suite before you open a pull request. The command will be documented here.

## Operational boundaries

- Do not publish packages, create releases, push tags, or change repository settings.
- Do not read files outside this repository, and never read credential files in the home directory, even to test check C2. Use fixtures.
- Do not add dependencies to the core without an ADR.
