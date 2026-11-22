# Tasks

## 1. Review the baseline artifacts

- [ ] 1.1 Compare the two delta specs with `docs/specs/policy.md` and `docs/specs/agent-adapters.md` and verify that rules B0 to B4 and W1 to W3, all five agents, and the fail-closed requirements are represented, with no new behavior.
- [ ] 1.2 Run `openspec validate baseline-canary-specs --strict` and verify that it reports zero findings for the proposal, both specs, the design, and the tasks.

## 2. Record the tooling in repository documentation

- [ ] 2.1 Add an `[Unreleased] / Added` entry to `CHANGELOG.md` for the OpenSpec planning setup and verify the entry is present under the existing heading.
- [ ] 2.2 Add a source entry for OpenSpec to `docs/sources.md` with its official documentation URL and verify the new ID is cited wherever the tool is named in repository documents.
- [ ] 2.3 Add a rule to the Rules table in `docs/AGENTS.md` requiring a hook-rule change to update `docs/specs/policy.md` and the `hook-policy` OpenSpec capability in the same change, and verify the rule names the control as review until an automated check exists.

## 3. Final verification

- [ ] 3.1 Run `openspec status --change baseline-canary-specs` and verify that all four artifacts read `done`, then run `git status --short` and verify that only the intended planning and documentation files changed.

## Workflow follow-up

- Archive the change after the review requirements are satisfied: `openspec archive baseline-canary-specs`.
- Verify that `openspec/specs/hook-policy/` and `openspec/specs/agent-adapters/` were created with their Purpose sections and that `openspec list --specs` shows both capabilities.
