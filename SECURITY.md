# Security policy

Canary runs inside your coding agent's tool loop, with your user permissions, before every shell command. A vulnerability in Canary can matter as much as the risks it reports. Thank you for reporting one privately.

## Supported versions

No version of Canary has been released yet. Once releases start, only the latest minor version receives security fixes. This section will list the supported versions.

## Reporting a vulnerability

**Do not open a public issue, pull request, or discussion for a vulnerability.**

Report it through GitHub private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. If that option is not available yet, open a public issue that says only "security contact requested", with no details, and a maintainer will reply with a private channel.

Please include:

- the Canary version and the agent and agent version involved (Claude Code, Codex, Cursor, Gemini CLI, or OpenCode);
- your operating system;
- the smallest command, repository layout, or hook event that reproduces the problem;
- what you expected and what happened.

**Never include real secrets, tokens, database URLs, or production data in a report.** Use obviously fake values. If you found a real secret exposed by Canary, describe where it appeared and rotate it; do not send it to us.

## What counts as a vulnerability

Examples that are in scope:

- Canary writes a secret value, a database host, a remote URL, an environment variable value, or a user identity field to any output, file, or log (a breach of [ADR-0003](docs/decisions/0003-findings-without-secret-values.md)).
- A command that the [hook policy](docs/specs/policy.md) says must be blocked is allowed, on any supported agent, through a spelling, quoting, encoding, or path trick.
- The scanner opens a network connection or uses credentials.
- The crash test writes, deletes, or changes anything outside its temporary directory ([ADR-0004](docs/decisions/0004-crash-test-isolation.md)).
- `canary init` writes outside the files listed in the SRS (CAN-I-09), or changes the user's own deny rules.
- A crafted repository makes the scanner or the hook execute code.

Examples that are out of scope, because the [README](README.md#what-canary-protects-and-what-it-does-not) and the [threat model](docs/THREAT-MODEL.md) already document them as limits:

- reaching a destructive effect through a script, `make`, an interpreter, or another tool the policy does not list (threat T4);
- an agent that does not load hooks, or that lets an action run when a hook fails (threat T5);
- an attacker who already controls your machine or account.

If you are not sure, report it anyway.

## What to expect

There is no formal response-time commitment yet. Maintainers will acknowledge the report, agree on a disclosure date with you, and credit you in the [changelog](CHANGELOG.md) unless you ask not to be named.
