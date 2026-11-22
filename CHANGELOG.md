# Changelog

All notable changes to Canary are recorded here. The format follows Keep a Changelog, and versions follow Semantic Versioning once releases start.

## [Unreleased]

Nothing in this section is released or implemented. It records the design work so far.

### Added

- `README.md` with the product summary, planned install per agent, quick start, commands, and the table of what Canary protects and does not protect.
- `docs/SRS.md`: P0 requirements with IDs, verification methods, MVP acceptance criteria, traceability, and the roadmap requirements.
- `docs/specs/policy.md`: hook rules B0 to B4 and W1 to W3, with the exact message text and placeholder sanitization.
- `docs/specs/agent-adapters.md`: how Claude Code, Codex, Cursor, Gemini CLI, and OpenCode hooks map to the shared core.
- `docs/THREAT-MODEL.md`: ten threats with mitigations and residual risk.
- `docs/decisions/`: ADR-0001 to ADR-0005.
- `docs/open-questions.md` and `docs/sources.md`.
- `SECURITY.md`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, and the MIT `LICENSE`.
- `package.json`, `tsconfig.json`, and `src/contract.ts`: zero-dependency TypeScript scaffolding for the core and adapters ([ADR-0006](docs/decisions/0006-zero-dependency-typescript-on-node.md)).
