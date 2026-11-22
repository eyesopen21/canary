---
status: accepted
date: 2026-11-22
decision-makers: Canary maintainers
---

# The hook is one layer, not the security boundary

## Context and Problem Statement

The visible part of Canary is a pre-execution hook. It is tempting to present it as the thing that keeps production safe. But a hook only sees commands the agent sends through the hooked tool, and only when the agent loads it.

The agents' own documentation says this:

* Claude Code describes its `if` filter as best-effort and says to "use the permission system rather than a hook to enforce a hard allow or deny" [S1]. It also warns that command hooks run with the user's full permissions [S1].
* Codex says to "treat tool hooks as a useful guardrail, not a complete enforcement boundary", and that a `PreToolUse` error, timeout, or malformed response can let the tool run [S8].
* Gemini CLI lets the action proceed on exit codes other than 0 and 2, and on non-JSON output [S10].
* The MCP specification states that it cannot enforce its security principles at the protocol level and that implementors should build consent and access controls [S5].

How should Canary position the hook relative to other controls?

## Decision Drivers

* Users must not get a false sense of safety (CAN-N-08, the README limits table).
* Canary must still stop the common accidents: misresolved deletes, non-local databases, force pushes, auto-approved infrastructure changes.
* Hooks that block too often get turned off, so the hook must stay narrow.

## Considered Options

* Hook as the boundary: present the hook as the protection.
* Hook plus verified barriers: the hook stops common accidents, and Canary checks for and proposes the controls that are real barriers.
* No hook: report findings only.

## Decision Outcome

Chosen option: "Hook plus verified barriers", because it keeps the hook's value for everyday mistakes while being honest that barriers live elsewhere.

Canary MUST, for each agent and in the scan:

* install the hook with the agent's fail-closed setting where it exists (`onFailure: "block"` in Claude Code [S1], `failClosed: true` in Cursor [S9]) and say plainly where it does not exist (Codex [S8], Gemini CLI [S10]);
* propose the agent's own deny rules where they exist: Claude Code permission rules, which apply whatever a hook returns [S2]; Gemini CLI policy-engine rules, which apply in every approval mode when no mode is set [S26]; OpenCode permission rules, where a configured `deny` is final [S16];
* list, as manual steps, the barriers outside the repository: read-only database roles, branch protection with required review, backups the agent's token cannot delete, production credentials outside the developer account, and OS-level isolation.

### Consequences

* Good, because the README can make claims that hold up: what is blocked, on which agent, and what is not covered.
* Good, because users with deny rules keep protection even when the hook fails or is not loaded.
* Bad, because the message "this is not a wall" is less attractive than "this protects production".
* Bad, because some barriers need account access Canary does not have, so they stay manual.

### Confirmation

* The README has a "What Canary protects and what it does not" table (AC-7).
* `canary init` output names the fail-open agents (CAN-F-21), verified by CAN-T-04.
* The threat model lists the hook-not-loaded and hook-fails cases with their residual risk.

## Pros and Cons of the Options

### Hook as the boundary

* Good, because it is a simple story.
* Bad, because it contradicts the agents' own documentation [S1][S8].
* Bad, because a single failure mode (a crash on Codex, an untrusted workspace) leaves no protection.

### Hook plus verified barriers

* Good, because it is defense in depth.
* Good, because it matches each agent's documented model.
* Bad, because there is more to explain and more to install.

### No hook

* Good, because there is no false sense of safety.
* Bad, because it gives up on stopping the most common accidents at the moment they happen.

## More Information

The threat model expands on the cases where the hook is bypassed: [THREAT-MODEL.md](../THREAT-MODEL.md), threats T4, T5, and T8.
