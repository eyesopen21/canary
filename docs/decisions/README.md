# Architecture decision records

Decisions are recorded in the MADR format [S20] (see [sources.md](../sources.md)). Each file has front matter with `status` and `date`, then the sections Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome (with Consequences and Confirmation), Pros and Cons of the Options, and More Information.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-deterministic-core-without-llm.md) | Deterministic core with no LLM in the decision path | Accepted |
| [0002](0002-hook-is-one-layer-not-the-boundary.md) | The hook is one layer, not the security boundary | Accepted |
| [0003](0003-findings-without-secret-values.md) | Findings never contain secret values | Accepted |
| [0004](0004-crash-test-isolation.md) | The crash test runs only in an isolated, disposable environment | Accepted |
| [0005](0005-shared-core-with-thin-agent-adapters.md) | One shared core with a thin adapter per agent | Accepted |

To add a decision, copy the MADR template [S20], number it with the next free number, and add it to this table. A decision is changed by a new ADR that supersedes it, not by editing an accepted one.
