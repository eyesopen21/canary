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
- The executable and all command hooks now use built JavaScript by default; `canary init` writes Node-based commands with absolute build paths, and `dist/` is committed for GitHub marketplace installs.
- `scripts/live-check-setup.mjs` and `docs/testing/live-agent-checks.md`: a disposable OS-temp sandbox with a local bare remote and harmless sentinel, plus a per-agent manual runbook for AC-4. All five agents remain `Unverified`; no live session is claimed.
- `scripts/build.mjs` now emits `dist/hook/<agent>.mjs`: one self-contained bundle per agent with the core and only that adapter, `node:` imports only, stdin/stdout, no CLI dispatch, and a build failure on relative imports. Versioned manifests and `canary init` point at these bundles; `onFailure: "block"` and `failClosed: true` are preserved. CAN-T-03 and CAN-T-04 also exercise the bundles directly. See the amendment to [ADR-0007](docs/decisions/0007-commit-built-javascript-for-marketplace-installs.md).
- Benchmark measurements for local Windows before and after the bundle change are recorded in the SRS. The runs had different Node startup floors and are not presented as evidence of a speedup; the 100 ms target remains unmet.
- The opt-in MCP tool prototype now lives in `src/mcp-hook/` behind `--mcp-tool`; the default `init` path stays a command hook. [ADR-0008](docs/decisions/0008-mcp-tool-hooks.md) remains `proposed`, records the synthetic `npm run bench:mcp` result, and does not claim live-agent verification or secret-free inputs.

### Fixed

- The setup script now reports Git's short diagnostic with `LOCAL_REMOTE_UNAVAILABLE`, so a restricted-harness transport block can be distinguished from a script defect. Q24 records both outcomes.
- Generated hook paths are now asserted to be absolute, and README no longer says hooks require `canary` on `PATH`.

### Changed

- Documented the Codex shell-string launch cost [S8] and the Cursor Windows/PowerShell shell layer [S9] in the adapter specification and its paired OpenSpec capability; no hook configuration changed.
- CAN-N-05 now targets the in-process `evaluate()` path (p50 below 10 ms), with wall-clock hook latency and the Node startup floor still published separately in every benchmark. See [ADR-0009](docs/decisions/0009-split-performance-target.md) and the resolution of Q20.

### Performance experiments (not kept)

Three optimizations were implemented in isolated branches, measured separately, and reverted; they are not part of the integrated tree.

- `module.enableCompileCache()` with a per-user, plugin-owned directory: it cannot speed up the shipped bundles because the entry module is compiled before the cache can be enabled and the bundles contain no later user-module loads. A local A/B measurement showed no gain (cache-disabled median 249.50 ms vs warm-cache 246.98 ms). No cache-poisoning risk was added to T9 because the code was not kept.
- Lazy `.env` / `.env.local` reads for B2 candidates: behavior-preserving in focused parity tests, but the full benchmark showed no reliable median improvement (control floor 240.88 ms vs 162.41 ms; hook medians mixed), below the 5 ms keep threshold.
- Syntactic gate for B1 `realpath`/`lstat` calls: reverted after review found a false negative — stripping backslashes made `bin\rm -rf ../outside` evaluate as `allow` instead of `block`. The benchmark also showed no reliable gain (floor 173.57 ms).
