# ADR-0006: Zero-dependency TypeScript on Node

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-11-22 |
| Requirements | CAN-C-01, CAN-C-02, CAN-N-02 |

## Context

CAN-C-01 fixes the implementation language as TypeScript on Node.js. CAN-C-02 forbids an LLM in the decision path, and CAN-N-02 requires a one-command install with no native dependencies. The repository rule on dependencies says that a dependency added to the core needs an ADR.

Node.js 22.22 provides built-in TypeScript type stripping [S27]. Canary uses that API in `scripts/build.mjs` to generate JavaScript from the `.ts` implementation. The executable and hook configurations use the built `dist/cli/entry.js` by default; developers can opt into loading the source entry only by setting `CANARY_DEV=1`. Marketplace installs from GitHub need a runnable tree and do not run Canary's build script; [ADR-0007](0007-commit-built-javascript-for-marketplace-installs.md) records the packaging decision. The built-in `node:test` runner and `node:assert` are used by the repository test suite.

## Decision

Write the core and adapters as ESM `.ts` files with explicit `.ts` import specifiers. Use Node built-ins at runtime, in tests, and for the build. `scripts/build.mjs` calls `node:module.stripTypeScriptTypes` and rewrites relative `.ts` import specifiers to `.js` in emitted files under `dist/`. `package.json` declares `"type": "module"`, a `build` script, `prepare` build, and the built-in `node:test` test script; it has no `dependencies` or `devDependencies`. `tsconfig.json` exists for editor support with `noEmit: true`.

Alternatives considered:

- **Compile with `tsc` and a bundler.** Rejected: adds a build step and dependencies with no behavior benefit.
- **Use a third-party test runner.** Rejected: `node:test` covers the policy table and contract tests.

## Consequences

- The Node entry point runs built JavaScript by default, and development source loading requires the explicit `CANARY_DEV=1` setting. Node 22.22 or later is required to run the build and source-mode development entry point.
- `dist/` is committed for GitHub marketplace installs; a packaging test runs an archived package hook and rejects `.ts` module loads.
- The npm package is not published; local installation uses the packed tarball.
- No dependency can add a network call or a model to the decision path.
- Imports must use explicit `.ts` extensions, and the type checker is advisory rather than part of CI until a dependency is approved.
