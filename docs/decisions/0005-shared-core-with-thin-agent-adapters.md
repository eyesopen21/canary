---
status: accepted
date: 2026-11-22
decision-makers: Canary maintainers
---

# One shared core with a thin adapter per agent

## Context and Problem Statement

Canary must work with Claude Code, Codex, Cursor, Gemini CLI, and OpenCode. Their pre-execution interfaces differ:

* Claude Code and Codex use a `PreToolUse` event with `hookSpecificOutput.permissionDecision` [S1][S8].
* Cursor uses `preToolUse` with a top-level `permission` field and separate `user_message` and `agent_message` [S9].
* Gemini CLI uses `BeforeTool` with a top-level `decision` and `reason` [S11].
* OpenCode uses a TypeScript plugin API, `ctx.permission.hook("evaluate", ...)`, that sets `effect` and `message` [S14].

Fail-closed support, warning channels, and tool names also differ (see [agent-adapters.md](../specs/agent-adapters.md)). How should Canary support five agents without five different policies?

## Decision Drivers

* What the scanner reports and what the hook blocks must be the same rules (S24).
* A rule change must apply to every agent at once.
* Each agent's quirks (fail-open behavior, unsupported fields) must be handled where they occur, and only there.
* New agents should be cheap to add.

## Considered Options

* One shared core plus a thin adapter per agent.
* A separate hook implementation per agent.
* Support one agent first and add others later.

## Decision Outcome

Chosen option: "One shared core plus a thin adapter per agent", because it keeps one policy and one test table while isolating each agent's format.

* The **core** takes `{ command, workingDirectory, projectRoot, platform }` and returns `{ decision, ruleId, message }`. It holds all checks, policy rules, message templates, and the score.
* An **adapter** parses its agent's event, calls the core, and writes the agent's output format. It contains no policy logic.
* `canary hook --agent <name>` selects the adapter. The OpenCode plugin imports the core directly, because OpenCode plugins run in process [S14].

### Consequences

* Good, because the policy table test (CAN-T-03) runs once against the core and once per adapter.
* Good, because agent-specific pitfalls, such as Codex failing open on unsupported fields [S8] or Cursor blocking on invalid JSON [S9], live in one small file each.
* Bad, because the core must stay agent-neutral, so features that only one agent supports (for example a warning that does not block on Cursor) degrade in that adapter.
* Bad, because five adapters need five live checks (CAN-T-05) before each release.

### Confirmation

* CAN-T-04 validates each adapter's output against its agent's documented fields.
* Code review rejects policy logic in an adapter.

## Pros and Cons of the Options

### Shared core with thin adapters

* Good, because one policy, one message set.
* Good, because adding an agent means adding an adapter and its contract test.
* Bad, because the lowest common denominator sometimes applies.

### Separate implementation per agent

* Good, because each can use every feature of its agent.
* Bad, because the rules drift apart and the scanner no longer matches the hooks.

### One agent first

* Good, because it is faster to ship.
* Bad, because the maintainer requires all five agents.
* Neutral, because live verification can still be staged: an agent that fails CAN-T-05 is listed as unsupported until fixed (AC-4).

## More Information

The sponsor project remotion-superpowers ships one repository with a Claude Code plugin, a Codex plugin, and a Gemini CLI extension side by side [S22]. Canary follows the same packaging layout (CAN-C-04).
