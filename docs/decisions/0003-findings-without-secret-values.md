---
status: accepted
date: 2026-11-22
decision-makers: Canary maintainers
---

# Findings never contain secret values

## Context and Problem Statement

To find a committed key, or to tell whether `DATABASE_URL` points to a non-local host, Canary has to read the value. Its outputs then travel widely: `findings.json` may be committed, pasted into an issue, uploaded by CI, or read into an agent's context. Hook messages are shown to the agent, which may store them in a transcript.

If Canary repeats what it found, it becomes a new leak. What may Canary's outputs contain?

## Decision Drivers

* The audit rules forbid printing secret values and using credentials [S24].
* Outputs are read by agents and may end up in transcripts or logs outside the user's control.
* Findings must still be actionable: the user must know what was found and where.
* The rule must be testable, not a promise (CAN-T-02).

## Considered Options

* Names and locations only: type, variable or key name, path, and line.
* Masked values: show a prefix and suffix, for example the first four characters.
* Full values, with a warning not to share the file.

## Decision Outcome

Chosen option: "Names and locations only", because it is the only option where an output, wherever it ends up, cannot be used as a credential.

Rules:

1. A value is read only in memory, used for the decision (pattern match, host classification), and discarded.
2. `findings.json`, the scan summary, the badge, hook messages, logs, and any future MCP output contain only: check and rule IDs, severity, repository-relative path, line, and an `evidence` object with a `kind` and a `name` (CAN-D-02).
3. Outputs never contain: a secret value or any part of it, a URL from a credential or environment variable, a database host name, a remote URL, an environment variable value, an absolute path that reveals the home directory, or the full command text.
4. Paths outside the repository are written with the home directory replaced by `~`.

### Consequences

* Good, because a leaked `findings.json` exposes where to look but nothing to use.
* Good, because the rule is enforceable by a single marker-string test across every output.
* Bad, because a user who has several keys of the same type in one file must open the file to tell them apart; the line number makes this quick.
* Bad, because hook messages say "non-local host" rather than naming the host, which is less specific (Q18).

### Confirmation

* CAN-T-02: fixtures contain synthetic secrets with a unique marker string, and the test fails if the marker appears in stdout, stderr, or any file Canary writes.
* Code review checks that no logging call receives a raw value.

## Pros and Cons of the Options

### Names and locations only

* Good, because nothing in the output is usable as a credential.
* Good, because it is simple to test.
* Neutral, because the user opens the file to see the value, which they need to do anyway to rotate it.

### Masked values

* Good, because it helps tell keys apart.
* Bad, because a prefix narrows the search space and some key formats have short secret parts.
* Bad, because masking rules differ by key type and are easy to get wrong.

### Full values with a warning

* Bad, because warnings do not travel with the file.
* Bad, because it turns Canary into the leak it reports.

## More Information

The MCP specification asks servers to sanitize tool outputs and clients to validate tool results before passing them to the model [S6]. The roadmap MCP server (CAN-F-13) applies this ADR to every tool result.
