# Changelog

All notable changes to Canary are recorded here. The format follows Keep a Changelog, and versions follow Semantic Versioning once releases start.

## [Unreleased]

The npm package is not published. This section records repository changes; it does not imply a release or completed MVP acceptance.

### Added

- `scripts/bench-hook.mjs` and `npm run bench`: zero-dependency hook startup, generated command, and in-process evaluation benchmark with synthetic allow and B3 events.
- `README.md` with local tarball installation instructions, CLI usage, generated agent configuration paths, and the verified limits currently documented for hook failure behavior.
- `docs/SRS.md`: P0 requirements with IDs, verification methods, MVP acceptance criteria, traceability, and the roadmap requirements.
- `docs/specs/policy.md`: hook rules B0 to B4 and W1 to W3, with the exact message text and placeholder sanitization. The implementation exists; no claim is made here that the full acceptance suite has passed.
- `docs/specs/agent-adapters.md`: adapter contracts and actual package/generated configuration paths for Claude Code, Codex, Cursor, Gemini CLI, and OpenCode. Live-agent behavior remains unverified for all five.
- `docs/THREAT-MODEL.md`: ten threats with mitigations and residual risk.
- `docs/decisions/`: ADR-0001 to ADR-0005.
- `docs/open-questions.md` and `docs/sources.md`.
- `SECURITY.md`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, and the MIT `LICENSE`.
- `package.json`, `tsconfig.json`, `src/`, `bin/`, and `scripts/build.mjs`: zero-dependency TypeScript implementation, CLI, and Node built-in type-stripping build ([ADR-0006](docs/decisions/0006-zero-dependency-typescript-on-node.md)).
- `docs/AGENT-WBS.md`: agent-oriented work breakdown derived from the SRS, specs, threat model, and ADRs.
- OpenSpec baseline capabilities for the hook policy and agent adapters [S29], with a paired-update rule requiring the prose specs and OpenSpec capability specs to change together.
- The executable and all command hooks now use the built JavaScript entry by default; `canary init` writes Node-based commands with absolute build paths, and `dist/` is committed for GitHub marketplace installs.
