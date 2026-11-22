# ADR-0006: Zero-dependency TypeScript on Node

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-11-22 |
| Requirements | CAN-C-01, CAN-C-02, CAN-N-02 |

## Context

CAN-C-01 fixes the implementation language as TypeScript on Node.js. CAN-C-02 forbids an LLM in the decision path, and CAN-N-02 requires a one-command install with no native dependencies. The repository rule on dependencies says that a dependency added to the core needs an ADR.

Node.js 22.22 ships type stripping, so `.ts` files run directly without a build step. The built-in `node:test` runner and `node:assert` cover the test suite, and `node --test` accepts a quoted glob on the supported platforms.

## Decision

Write the core and the adapters as ESM `.ts` files with explicit `.ts` import specifiers. Use only Node built-ins at runtime and in tests. `package.json` declares `"type": "module"` and a single `test` script; it has no `dependencies` or `devDependencies`. `tsconfig.json` exists for editor support with `noEmit: true`.

Alternatives considered:

- **Compile with `tsc` and a bundler.** Rejected: adds a build step and dependencies with no behavior benefit.
- **Use a third-party test runner.** Rejected: `node:test` covers the policy table and contract tests.

## Consequences

- The same source runs on macOS, Linux, and Windows with no install step beyond Node 22.
- No dependency can add a network call or a model to the decision path.
- Imports must use explicit `.ts` extensions, and the type checker is advisory rather than part of CI until a dependency is approved.
