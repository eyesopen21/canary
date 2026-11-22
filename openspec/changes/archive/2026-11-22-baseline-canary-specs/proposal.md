# Proposal

## Why

Canary now has a local implementation, while its policy and adapter behavior are also specified in `docs/specs/policy.md` and `docs/specs/agent-adapters.md`. These prose documents need a machine-checkable counterpart so later changes can be proposed, validated, and traced against the same baseline. Live-agent verification remains outstanding and is not claimed by this change.

## What Changes

- Establish the P0 hook policy as an OpenSpec capability, including the evaluation order, rules B0 to B4 and W1 to W3, the exact message templates, and the no-leak constraints.
- Establish the five agent hook adapters as an OpenSpec capability, including the fields each adapter reads and writes, fail-closed settings, and the shared rule that an adapter never returns an explicit `allow`.
- Keep `docs/SRS.md`, `docs/decisions/`, and `docs/open-questions.md` as the canonical sources for requirement IDs, decisions, and unverified points. Keep `docs/specs/` as the canonical human-readable behavior and synchronize the OpenSpec capabilities with it in the same change.
- Leave the scan, score, badge, and crash-test behavior out of this baseline; those requirements remain in the SRS until a later change migrates them.

## Capabilities

### New Capabilities

- `hook-policy`: The deterministic classification of a shell command as allow, warn, or block, the block and warn rules with their exact message text, and the limits on what a message may reveal.
- `agent-adapters`: The translation of the core decision into each of the five agents' hook output formats, the fields read from each agent, and the fail-closed requirements.

### Modified Capabilities

None. There are no existing OpenSpec capabilities in this repository.

## Impact

- Adds `openspec/` and `.agents/skills/` to the repository as planning tooling; no runtime dependency, no source code, and no package manifest change.
- Adds a traceability link from OpenSpec requirements to the existing `CAN-*` requirement IDs in `docs/SRS.md`.
- No runtime behavior changes. The baseline documents the repository's specified policy and adapter contracts; it does not claim that agent integration has been verified live.
