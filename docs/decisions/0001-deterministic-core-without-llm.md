---
status: accepted
date: 2026-11-22
decision-makers: Canary maintainers
---

# Deterministic core with no LLM in the decision path

## Context and Problem Statement

Canary decides two things: which findings a repository has, and whether a command the agent wants to run is allowed, warned about, or blocked. The original audit was an 11-check prompt that a model carried out [S24]. A model can answer the same prompt differently on different runs, and the agent being audited could be the same kind of model that does the auditing.

Should the decision path use an LLM, rules, or both?

## Decision Drivers

* The same repository must give the same result, so findings can be tested and compared (CAN-N-04).
* The hook runs before every shell command and must answer quickly (CAN-N-05).
* The scanner must work offline and without credentials (CAN-N-01).
* The audited agent must not be able to influence its own audit, for example through text in the repository that reads like instructions.
* Each rule must be explainable in one message that names the danger and the consequence (CAN-F-05).

## Considered Options

* Rules only: pattern matching, parsing, and path resolution in code.
* LLM only: send the command or repository to a model and follow its answer.
* Rules first, with an LLM for the cases the rules cannot decide.

## Decision Outcome

Chosen option: "Rules only", because it is the only option that meets the determinism, offline, and latency drivers together, and it gives an agent no channel to argue with the check.

### Consequences

* Good, because every decision is reproducible and covered by the policy table test (CAN-T-03).
* Good, because the hook needs no network, no API key, and no model, and it adds no token cost.
* Good, because the trap repositories (CAN-T-01) can prove exactly what each check detects.
* Bad, because rules only catch the patterns they list. Indirect commands (a script, `make`, an interpreter one-liner) are not recognized. This gap is documented in the [policy](../specs/policy.md#known-gaps) and the [threat model](../THREAT-MODEL.md).
* Bad, because every new destructive tool needs a new rule.

### Confirmation

* CAN-T-07: two scans of each fixture produce byte-identical `findings.json`.
* CAN-T-08: the scan runs with networking disabled.
* Code review rejects any dependency on a model SDK in the core package.

## Pros and Cons of the Options

### Rules only

* Good, because deterministic and testable.
* Good, because fast and offline.
* Bad, because limited to known patterns.

### LLM only

* Good, because it can reason about commands it has never seen.
* Bad, because results vary between runs, which breaks CAN-N-04.
* Bad, because it needs network access and credentials, which breaks CAN-N-01.
* Bad, because content in the repository or the command could steer the model's verdict.
* Bad, because it adds latency and cost to every shell command.

### Rules first, LLM for undecided cases

* Good, because it could cover more commands.
* Bad, because the undecided cases are exactly the risky ones, and they would get the least reliable treatment.
* Neutral, because it could be offered later as an optional, clearly separated advisory layer. It is not on the roadmap.

## More Information

Some agents offer model-based hooks, for example Claude Code `prompt` and `agent` hook types [S1] and OpenCode permission hooks that call a model [S14]. Users can add those next to Canary; Canary itself does not use them.
