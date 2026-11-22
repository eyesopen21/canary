# Architecture decision records

Decisions are recorded in the MADR format [S20] (see [sources.md](../sources.md)). Each file records `status` and `date` in front matter or a status table, then the sections Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome (with Consequences and Confirmation), Pros and Cons of the Options, and More Information.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-deterministic-core-without-llm.md) | Deterministic core with no LLM in the decision path | Accepted |
| [0002](0002-hook-is-one-layer-not-the-boundary.md) | The hook is one layer, not the security boundary | Accepted |
| [0003](0003-findings-without-secret-values.md) | Findings never contain secret values | Accepted |
| [0004](0004-crash-test-isolation.md) | The crash test runs only in an isolated, disposable environment | Accepted |
| [0005](0005-shared-core-with-thin-agent-adapters.md) | One shared core with a thin adapter per agent | Accepted |
| [0006](0006-zero-dependency-typescript-on-node.md) | Zero-dependency TypeScript on Node | Accepted |
| [0007](0007-commit-built-javascript-for-marketplace-installs.md) | Commit built JavaScript for marketplace installs | Accepted |
| [0008](0008-mcp-tool-hooks.md) | Run Claude Code and Codex hooks through a stdio MCP server | Proposed |
| [0009](0009-split-performance-target.md) | Split the hook performance target from the OS runtime startup cost | Accepted |

To add a decision, copy the MADR template [S20], number it with the next free number, and add it to this table. A decision is changed by a new ADR that supersedes it, not by editing an accepted one.
