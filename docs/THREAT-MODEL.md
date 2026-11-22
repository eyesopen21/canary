# Canary threat model

| | |
| --- | --- |
| Version | 0.1 (draft) |
| Date | 2026-11-22 |
| Scope | MVP (P0) design. Nothing is implemented. |

This model is organized around the four questions of the Threat Modeling Manifesto [S21]: what are we working on, what can go wrong, what are we going to do about it, and did we do a good enough job. Following the Manifesto's values, it is meant to be refined with every design change, not delivered once [S21].

Citations `[Sn]` refer to [sources.md](sources.md).

---

## 1. What are we working on?

### System

Canary has three parts that run on the developer's machine:

| Part | Runs | Reads | Writes |
| --- | --- | --- | --- |
| Scanner (`canary scan`) | On demand | Repository files; presence of credential files in the home directory | `canary/findings.json`, `canary/badge.svg` |
| Hook (`canary hook`, OpenCode plugin) | Before each shell command the agent runs | The agent's hook event; environment; `.env` files in the project root | Its answer on stdout; optional `canary/hook.log` |
| Crash test (`canary crash-test`) | On demand | Its own fixtures | A temporary directory, deleted afterwards |

### Assets

| Asset | Why it matters |
| --- | --- |
| A1. Data in non-local databases | Usually irreplaceable from the developer's machine |
| A2. Files outside the project | The user's home, other projects, system files |
| A3. Shared Git history | Force pushes destroy work for everyone |
| A4. Live infrastructure | Destroyed resources may not come back |
| A5. Credentials and secrets | Readable from the shell and from the repository |
| A6. Canary's own integrity | A compromised Canary runs with the user's permissions on every command |

### Trust boundaries

```text
  untrusted input          agent (model + tools)            Canary              system
 ───────────────┐        ┌──────────────────────┐       ┌───────────┐       ┌──────────┐
 issues, PRs,    │──────▶│ decides a command     │──────▶│ hook:     │──────▶│ shell,   │
 web pages,      │       │                       │ event │ allow /   │ allow │ DB, git, │
 repo files,     │       │                       │◀──────│ warn /    │       │ cloud    │
 MCP results     │       └──────────────────────┘ deny  │ block     │       └──────────┘
 ────────────────┘                                       └───────────┘
```

- **B1. Untrusted content → agent.** Anything the agent reads can carry instructions.
- **B2. Agent → hook.** Canary sees only what the agent sends through the hooked tool, and only if the agent loads the hook.
- **B3. Hook → system.** After an allow, the command runs with the user's full permissions. Command hooks themselves also run with the user's full permissions [S1][S10].
- **B4. Canary distribution → user machine.** Canary is installed from npm or a plugin marketplace.

### Assumptions

- The agent follows its documented hook contract [S1][S8][S9][S11][S14].
- The user does not deliberately disable Canary.
- The developer machine is not already compromised.

---

## 2. What can go wrong?

Ten threats, ordered by the damage they can cause.

| ID | Threat | Asset | Boundary |
| --- | --- | --- | --- |
| T1 | Destructive SQL or a migration runs against a non-local database because an environment variable points to it | A1 | B3 |
| T2 | A recursive delete with an empty, unset, or misresolved target, or one that follows a link, deletes files outside the project | A2 | B3 |
| T3 | Untrusted input (an issue, a PR comment, a web page, a repository file, an MCP tool result) leads the agent to run a destructive command, including an agent in CI that has secrets or write access | A1 to A5 | B1 |
| T4 | The agent reaches a destructive effect indirectly: a script file, `make`, `npm run`, an interpreter one-liner, or a tool Canary does not evaluate | A1 to A4 | B2 |
| T5 | The hook does not run or fails open: hooks not loaded, workspace not trusted, an approval-free mode that skips hooks, or a hook crash on an agent without fail-closed support | A1 to A4 | B2 |
| T6 | Canary itself leaks a secret through `findings.json`, a hook message, a log, or a badge | A5 | B2, B3 |
| T7 | Rules written only in `AGENTS.md` or `CLAUDE.md` are lost after context compaction, so the agent no longer follows them | A1 to A4 | B1 |
| T8 | The agent, or content that steers it, edits the hook configuration to switch Canary off | A6, then A1 to A4 | B2 |
| T9 | Supply chain: an unpinned MCP server, an unknown hook or skill, hidden Unicode in a rules file, or a compromised Canary release | A5, A6 | B1, B4 |
| T10 | The crash test damages the user's machine | A2 | B3 |

---

## 3. What are we going to do about it?

Status is **Planned** for P0 design items and **Roadmap** for P1 and P2. Nothing is implemented. "Residual" is what remains after the mitigation.

### T1. Destructive database command against a non-local host

- **Mitigation.** Policy B2 blocks `DROP`, `TRUNCATE`, `DELETE` with no `WHERE`, and schema migrations when the database host is non-local ([policy.md](specs/policy.md#b2-destructive-database-command-against-a-non-local-host)). Check C1 reports test and development configurations that point to non-local databases (CAN-F-01.1). Planned.
- **Barrier to propose.** A read-only database role for the development account, and production credentials outside the developer account (manual steps).
- **Residual.** Database tools not on the B2 list are not recognized. A host Canary classifies as local can still be shared (for example a tunnel on `localhost`). Classification depends on assumption A9.

### T2. Recursive delete outside the project

- **Mitigation.** Policy B1 fails closed on variables, command substitutions, globs that leave the project, links that resolve outside it, and the project root, home, or filesystem root ([policy.md](specs/policy.md#b1-recursive-delete-with-an-unresolved-target), CAN-F-06). Check C3 reports the same patterns in repository scripts. Windows junctions count (CAN-N-03). Planned.
- **Defense in depth.** Claude Code does not auto-approve recognized `rm` and `rmdir` critical-path removals in any mode, including `bypassPermissions`, although the user can turn that prompt off in `bypassPermissions` mode [S3].
- **Residual.** Deletes inside a script file are not seen by the hook (T4). A literal path inside the project that the user still needed is allowed.

### T3. Untrusted input steers the agent

- **Mitigation.** The hook evaluates the command, not the reasoning behind it, so a command induced by injected text is blocked the same way as an accidental one, provided it goes through the hook. Check C9 reports CI workflows that run agents on untrusted triggers with secrets or write access (CAN-F-01.5). Planned.
- **Barrier to propose.** Minimal workflow permissions, secrets kept out of agent jobs, and no `pull_request_target` for agent workflows (manual and in-repository fixes from check 9 [S24]).
- **Residual.** Injected text can steer the agent toward indirect commands (T4) or toward exfiltration, which Canary does not detect in P0. The MCP specification treats tool annotations from untrusted servers as untrusted [S6]; Canary does not inspect MCP results.

### T4. Indirect execution

- **Mitigation.** Partial. Check C3 reports unguarded deletes inside repository scripts, so the scripts the agent is likely to call are reviewed before the session. Policy B0 blocks unparseable commands that contain destructive trigger words. Planned.
- **Barrier to propose.** Agent deny rules for the scripts themselves, OS-level isolation (container or VM), and an egress firewall.
- **Residual.** **High.** A determined or misled agent can write a new script and run it, or use an interpreter. This is the main reason Canary is described as a seatbelt, not a wall ([ADR-0002](decisions/0002-hook-is-one-layer-not-the-boundary.md)).

### T5. Hook not loaded or failing open

- **Mitigation.** `canary init` enables `onFailure: "block"` on Claude Code [S1] and `failClosed: true` on Cursor [S9] (CAN-F-21). It prints a warning for Codex, where a hook error, timeout, or malformed response can let the tool run [S8], and for Gemini CLI, where other exit codes and non-JSON output let the action proceed [S10]. Adapters emit only documented fields, because Codex continues the tool call when a `PreToolUse` hook returns an unsupported field [S8]. Planned.
- **Barrier to propose.** The agent's own deny rules, which do not depend on Canary running: Claude Code permission rules [S2], Gemini CLI policy-engine rules [S26], OpenCode permission rules [S16].
- **Residual.** Whether hooks run in each agent's approval-free mode is not yet verified (Q1 to Q4). Workspace trust limits which hooks run: in an interactive Claude Code session, hooks from every settings file wait until the user accepts the workspace trust dialog [S1]; Codex loads project-layer hooks only from trusted projects, while user and system hooks still load [S8]; Cursor runs project hooks only in trusted workspaces [S9]. A hook that blocks too often gets turned off; warn-only mode and exceptions are P1 (CAN-F-15).

### T6. Canary leaks a secret

- **Mitigation.** Values are read only in memory and discarded; outputs contain names and locations only ([ADR-0003](decisions/0003-findings-without-secret-values.md)). Message placeholders are sanitized; remote URLs and database hosts are never printed ([policy.md](specs/policy.md#placeholders)). The Cursor adapter does not read `user_email` [S9] (CAN-I-07). Enforced by the marker-string test CAN-T-02. Planned.
- **Residual.** An attacker who can read the user's files can read the secrets directly; Canary adds no new exposure but does not remove the existing one.

### T7. Prose rules lost after compaction

- **Mitigation.** Roadmap. The rules compiler (CAN-F-11) finds prose rules and proposes a hook, deny rule, or permission that enforces each. A session-start hook reinjects a short summary of critical rules after compaction (CAN-F-20), using events such as Claude Code `SessionStart` with the `compact` matcher [S1] (Q10).
- **Residual.** Until then, the P0 hook enforces only the rules in policy.md, whatever the prose files say.

### T8. Hook configuration tampered with

- **Mitigation.** Partial. The scanner can report when the expected Canary hook entry is missing from the agent's configuration. Claude Code treats `.claude` as a protected path [S2]. Gemini CLI fingerprints project hooks and warns when one changes [S10]. Codex requires a new review when a plugin's bundled script changes [S8]. Planned for the scanner check; the agent protections are the agents' own.
- **Barrier to propose.** Managed or system-level hook configuration that the user account cannot edit, where the agent offers it (Claude Code managed settings [S1], Codex `requirements.toml` [S8], Cursor enterprise hooks [S9]).
- **Residual.** Cursor watches `hooks.json` and reloads it automatically [S9], so an agent that can write that file can change the hook. In `bypassPermissions` mode, Claude Code skips permission prompts, including for writes to protected paths such as `.claude` [S2].

### T9. Supply chain

- **Mitigation.** Check C8 reports unpinned MCP servers, permission-bypass flags in repository files, and hidden or bidirectional Unicode in rule files (CAN-F-01.4). The MCP specification describes malicious startup commands in local server configuration as a known attack [S7]. For Canary itself: releases are pinned to exact versions in every manifest, the core has no runtime dependency on a model or a network client, and vulnerabilities are reported through [SECURITY.md](../SECURITY.md). Planned.
- **Residual.** A compromised Canary release would run on every shell command with the user's permissions (A6). Release signing and provenance are not yet decided.

### T10. Crash test damages the machine

- **Mitigation.** Fresh temporary directory, substituted `HOME`, no network, no real credentials, double `realpath` guard, and simulation when any guard fails ([ADR-0004](decisions/0004-crash-test-isolation.md)). Enforced by the write-watcher test CAN-T-06. Planned.
- **Residual.** A bug in the guard is safety-critical. The guard has its own negative test.

---

## 4. Did we do a good enough job?

Not yet, by design: this is a model of a design, not of running code. It is good enough when:

- [ ] Every mitigation marked Planned has the test named in it passing (CAN-T-02, CAN-T-03, CAN-T-04, CAN-T-06).
- [ ] Questions Q1 to Q7 in [open-questions.md](open-questions.md) are answered by live tests (CAN-T-05), and the README support table is updated with the results.
- [ ] Each residual risk marked High has a sentence in the README limits table. Today that is T4 and T5.
- [ ] The model is reviewed again when any agent adapter, policy rule, or roadmap feature (MCP server, decoys, authorization log) is added.

### What this model does not cover

- Attackers with access to the developer's machine or account.
- Cloud-side controls Canary cannot see: what a token can really do, account-level deletion protection, organization policies.
- Exfiltration of data, as opposed to its destruction.
- Damage from tools other than shell commands, such as file writes and MCP tool calls, in P0.
