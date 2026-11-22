# Design

## Context

Canary has no source code yet. Its behavior is described in `docs/SRS.md` (requirement IDs `CAN-*`), `docs/specs/policy.md` (hook rules and exact message text), `docs/specs/agent-adapters.md` (per-agent hook interface), and the ADRs. Those are prose documents with no machine-checkable scenarios. OpenSpec 2.1.1 was initialized in this repository with the `spec-driven` schema and the OpenCode tool profile, adding `openspec/` and `.agents/skills/`.

The repository rules constrain this work: no invented field names or flags, every external claim cites `docs/sources.md`, no secret values in output, and no description of a roadmap item as implemented.

## Goals / Non-Goals

**Goals:**

- Give the P0 hook behavior a scenario-based contract that `openspec validate` can check.
- Keep each OpenSpec requirement traceable to the existing `CAN-*` IDs and source documents.
- Preserve the exact policy text and field names as written in the prose specs.

**Non-Goals:**

- Implementing any Canary code or packaging.
- Migrating scan, score, badge, or crash-test requirements; those stay in the SRS for now.
- Changing a hook rule, a message, or an agent field.
- Claiming live-agent verification, which remains an open question in `docs/open-questions.md`.

## Decisions

**Two flat capabilities: `hook-policy` and `agent-adapters`.** They mirror the two existing files in `docs/specs/`. The alternative of one capability per rule was rejected as too granular; a single catch-all capability was rejected because unrelated requirements would drift together.

**Delta specs describe only behavior already specified in prose.** No new requirement was invented to satisfy validation. The prose documents remain the source for wording and citations until this change is archived; the mapping is recorded below rather than duplicated inside each requirement.

| Capability | Prose source | Requirement IDs |
| --- | --- | --- |
| `hook-policy` | `docs/specs/policy.md` | CAN-F-04, CAN-F-05, CAN-F-06, CAN-U-02, CAN-N-10, CAN-N-11 |
| `agent-adapters` | `docs/specs/agent-adapters.md` | CAN-I-03, CAN-I-05, CAN-I-06, CAN-I-07, CAN-F-19, CAN-F-21 |

**OpenSpec is planning tooling, not a runtime dependency.** It is installed globally for the CLI and stored as project skills under `.agents/skills/`. No package manifest, source file, or core dependency changes.

**Archive is a separate step.** This change stays active until the artifacts are reviewed. Archiving it with `openspec archive baseline-canary-specs` will create `openspec/specs/hook-policy/` and `openspec/specs/agent-adapters/` as the baseline that later changes modify.

## Risks / Trade-offs

- [The same behavior exists in prose specs and OpenSpec specs] → Record the canonical source in this design and add a repository rule that a hook-rule change updates both in the same change. Until that rule is added, review is the only control.
- [Agent field names may be wrong] → Copy only names that appear in `docs/specs/agent-adapters.md` with its `[Sn]` citations; leave the unverified points in `docs/open-questions.md` rather than resolving them here.
- [Scenario text can drift from exact policy message text] → Scenarios reference the templates in `docs/specs/policy.md#message-text` instead of copying full messages, so there is one source of truth for wording.
- [Planning files add noise to a documentation-only repository] → Keep them in `openspec/` and `.agents/skills/` only; no generated files are written elsewhere.

## Migration Plan

1. Review `proposal.md`, the two spec files, this design, and `tasks.md`.
2. Run `openspec validate baseline-canary-specs --strict` and fix any findings.
3. Record the tooling addition under `[Unreleased]` in `CHANGELOG.md` and the synchronization rule in `docs/AGENTS.md`.
4. After review, archive the change in a separate step so the two capabilities become the main specs. No rollback is needed before archive: deleting the `openspec/` and `.agents/` directories reverts the setup.

## Open Questions

- Whether the baseline should be archived immediately or stay active until the first implementation change is proposed. This does not change the artifacts or tasks.
