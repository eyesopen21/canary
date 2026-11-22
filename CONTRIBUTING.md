# Contributing to Canary

Thank you for helping. Canary is in the design phase: the repository holds requirements, decisions, and policy, and no code yet. Contributions to the design are as useful as code.

Agents working in this repository follow [AGENTS.md](AGENTS.md). People follow the same rules.

## Ways to help now (no code required)

### Verify an open question

[docs/open-questions.md](docs/open-questions.md) lists what is unverified, especially how each agent behaves in its approval-free mode (Q1 to Q4) and how to fail closed on Codex and Gemini CLI (Q6, Q7). If you can test one in a disposable repository:

1. Record the agent name and exact version.
2. Describe the steps and the result. Use fake values only.
3. Open a pull request that moves the question to **Resolved** with the date and your evidence, and updates any document that depended on it.

### Improve a policy rule

To propose a new block or warn rule, or a change to one:

1. Explain the irreversible effect the rule prevents, and why a block (or a warning) is the right level. Canary blocks only what cannot be undone.
2. Give the exact message text, following the danger, consequence, instead pattern in [policy.md](docs/specs/policy.md#message-text), with sanitized placeholders only.
3. Add rows to the examples table: at least one command that must be blocked or warned about, and one similar command that must be allowed.

### Report a gap

If a destructive command gets past the documented policy, check [SECURITY.md](SECURITY.md) first. Policy bypasses are reported privately.

## Code contributions (once code exists)

The stack is TypeScript on Node.js. The setup and test commands will be listed here with the first code commit.

### Adding a check

1. Add a trap repository under `fixtures/` that must produce exactly the expected findings.
2. Make sure the clean fixture still produces no findings.
3. Add the check to `src/core/` with a stable rule ID, severity, danger, consequence, fix, and manual step.
4. Add the requirement to `docs/SRS.md` and its traceability row.

### Adding or changing an agent adapter

1. Cite the agent's official documentation for every event name, field, and file path you use, and add the source to `docs/sources.md`.
2. Keep policy logic out of the adapter.
3. Add contract tests built from the documentation's own examples.
4. Run a live check in a disposable repository and record the agent version in the pull request.

### Fixtures and secrets

- Use only synthetic secrets that contain the test suite's marker string.
- Never commit a real key, token, password, or connection string, even one you believe is revoked.

## Before opening a pull request

- [ ] The change is on one topic.
- [ ] Every new claim about an agent, protocol, or standard cites `docs/sources.md`.
- [ ] Nothing describes a roadmap item as implemented.
- [ ] No output, example, or fixture contains a real secret.
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]` for anything user-visible.
- [ ] Public text is neutral and professional.

## Pull request guidelines

- Describe what changed and why, and link the requirement IDs.
- For an adapter or policy change, include the agent versions you tested with.
- Small pull requests get reviewed faster.

## Questions

Open a GitHub issue for anything that is not a security report.
