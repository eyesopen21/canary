# Tasks

## 1. Review the baseline artifacts

- [x] 1.1 Compare the delta specs with `docs/specs/policy.md` and `docs/specs/agent-adapters.md`; reconcile B0 to B4, W1 to W3, all five agents, package/project configuration paths, warning logs, and fail-closed notices. No live-agent verification is asserted.
- [x] 1.2 Run `openspec validate baseline-canary-specs --strict`; it reports that the change is valid.

## 2. Record the tooling in repository documentation

- [x] 2.1 Add an `[Unreleased] / Added` entry to `CHANGELOG.md` for the OpenSpec baseline.
- [x] 2.2 Add the official OpenSpec documentation source to `docs/sources.md` and cite it in the repository guidance and design that name the tooling.
- [x] 2.3 Add paired-update rules to the canonical root `AGENTS.md` for both policy and adapter docs/specs; identify review as the current synchronization control. (`docs/AGENTS.md` does not exist.)

## 3. Final verification

- [x] 3.1 `openspec status --change baseline-canary-specs` reports all four artifacts complete. `git status --short` includes the expected concurrent implementation work; this baseline's changes are limited to its planning and documentation artifacts. This status does not mark MVP acceptance complete.

## Workflow follow-up

- Archive the change after the review requirements are satisfied: `openspec archive baseline-canary-specs`.
- Verify that `openspec/specs/hook-policy/` and `openspec/specs/agent-adapters/` were created with their Purpose sections and that `openspec list --specs` shows both capabilities.
