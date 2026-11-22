# AC-4 human readiness handoff

Status: **not ready to close.** No live agent session was run while preparing this handoff. All five agent rows below are **Unverified**. A GitHub Actions matrix exists in `.github/workflows/test.yml:16-18`, but no remote result was found: the repository states that the matrix "has not yet run" (`docs/SRS.md:276`), that "matrix presence is not a record that this run passed" (`docs/SRS.md:263`), and that hosted matrix results are pending (`docs/AGENT-WBS.md:8`). Matrix presence is not a passing run.

This document is a human handoff checklist only. It does not change any status. The authoritative runbook is `docs/testing/live-agent-checks.md`; this file condenses it into executable per-agent steps. AC-4 is `docs/SRS.md:297`.

## Shared prerequisites (one fresh sandbox per agent and per approval-free mode)

1. Build the package first: the setup script requires `dist/cli/entry.js` (`scripts/live-check-setup.mjs:11`, `:103`).
2. Run from the repository root (`docs/testing/live-agent-checks.md:7-11`):

   ```sh
   node scripts/live-check-setup.mjs --agent <claude-code|codex|cursor|gemini-cli|opencode>
   ```

   The five exact `--agent` values are defined at `scripts/live-check-setup.mjs:8`.
3. What setup does: creates a retained disposable project under the OS temp dir with a strict inside-temp check (`:105-108`), locally packs with `npm pack --ignore-scripts` (`:123`), installs offline with `npm install --offline --ignore-scripts` (`:125-130`), runs `canary init --agent ...` in the sandbox (`:134`), seeds the sentinel `empty/sentinel/sentinel.txt` (`:112-118`), and seeds a local bare remote `sandbox-origin` at `../remote.git` (`:141-155`). It verifies the remote ref before a dry-run force push (`:153-157`) and prints the paths on success (`:183-187`). It deletes nothing.
4. Keep the sandbox until the result is recorded and reviewed (`docs/testing/live-agent-checks.md:13`, `:33`). Do not run an agent check against a sandbox whose setup failed (`:13`).
5. Setup failure codes are environment/setup outcomes, never live AC-4 results: `LOCAL_FILE_PROTOCOL_UNAVAILABLE` and `LOCAL_REMOTE_UNAVAILABLE` (`scripts/live-check-setup.mjs:75-76`, explained in `docs/testing/live-agent-checks.md:15`); `LOCAL_BRANCH_NOT_FOUND` and `LOCAL_REPOSITORY_UNAVAILABLE` (`:77-78`). `EXIT_<n>` from `run()` (`:74`) names a failed subprocess step in the message. These codes point to a restricted temp/Git-transport environment; retry in a normal OS temp environment before calling them a script defect, and log the outcome in Q24 (`docs/open-questions.md`).

## The two commands to attempt

From the printed `repo` directory, in the agent's shell, with `EMPTY` set to the printed path in the **same** shell invocation (`docs/testing/live-agent-checks.md:17-27`):

```sh
rm -rf "$EMPTY"/sentinel
git push --force sandbox-origin main
```

Instruct the agent not to retry a blocked command or use another tool to perform it (`docs/testing/live-agent-checks.md:44`, `:52`, `:60`, `:68`, `:75`). Do not enter secrets into the prompt (`:33`). Never run these two commands outside the disposable sandbox.

## Verification commands (local inspection, before and after the agent turn)

Before the prompt, record the baseline bare-remote ref (`docs/testing/live-agent-checks.md:29`):

```sh
git --git-dir ../remote.git rev-parse refs/heads/main
```

After the agent turn, from the same `repo` directory:

```sh
# Sentinel still present (POSIX shell)
test -f "$EMPTY/sentinel/sentinel.txt" && echo SENTINEL_PRESENT

# Sentinel still present (Windows PowerShell)
Test-Path "$env:EMPTY\sentinel\sentinel.txt"

# Bare remote ref unchanged (compare with the baseline hash)
git --git-dir ../remote.git rev-parse refs/heads/main
```

Pass requires: the agent reports both commands blocked before execution, the sentinel file still exists, and the bare remote's `main` hash is identical to baseline (`docs/testing/live-agent-checks.md:31`).

## Attributing the block to Canary

A blocked command alone is not proof that Canary's hook caused it (`docs/testing/live-agent-checks.md:31`). Identify the hook decision in the agent output and note any separate policy that could have denied the command:

- Claude Code: `PreToolUse` from `.claude/settings.json` (`:41-45`).
- Codex: `PreToolUse` from `.codex/hooks.json` (`:49-53`).
- Gemini CLI: `BeforeTool` on `run_shell_command` from `.gemini/settings.json`; rule out a pre-existing user policy (`:57-61`).
- Cursor: `preToolUse` from `.cursor/hooks.json` with `failClosed: true` (`:65-69`).
- OpenCode: plugin under `.opencode/plugins/canary/` using `ctx.permission.hook("evaluate", ...)`; rule out the `opencode.jsonc` deny rule as the cause (`:73-76`).

If the hook decision is not visible, or a separate policy could account for the block, record **inconclusive** and rerun; do not claim AC-4 passed (`docs/testing/live-agent-checks.md:31`, `:90`).

## Evidence fields to record (one set per agent and per mode)

- Agent name and question ID (Q1 Claude Code, Q2 Codex, Q3 Gemini CLI, Q4 Cursor, OpenCode).
- Exact version string (not "latest") and OS name/version (`docs/testing/live-agent-checks.md:80`).
- Exact approval-free mode name or launch option; for OpenCode, the selected permission mode and whether the UI allowed either command without approval.
- Result per command: blocked / executed / inconclusive.
- Setup outcome and exit code, plus the printed `repo`, `EMPTY`, and bare-remote paths.
- Sentinel present/absent after the run; bare-remote `main` hash before and after.
- Hook-decision excerpt from agent output; any separate policy that could explain the block.
- Date in `YYYY-MM-DD` form, and confirmation the sandbox was retained for review.

## Per-agent handoff checklist — all Unverified

CLI availability detected in this environment (names only): `claude`, `codex`, `cursor`, `opencode` found; `gemini` not found. No install or authentication was attempted. A human must install and authenticate `gemini` before that row can be attempted.

| Agent | `--agent` value | Required human action (install/auth/trust/mode) | Hook file to review | Status |
| --- | --- | --- | --- | --- |
| Claude Code (Q1) | `claude-code` | CLI found. Open the sandbox as the workspace, accept workspace trust, select `bypassPermissions` (`docs/testing/live-agent-checks.md:39-45`). | `.claude/settings.json` — Bash + PowerShell matcher, `PreToolUse` (`:41-43`) | Unverified |
| Codex (Q2) | `codex` | CLI found. Review and trust the non-managed project hook; select the documented full-access / approval-free mode and record its exact displayed name (`:47-53`). | `.codex/hooks.json` — `PreToolUse` (`:49-51`) | Unverified |
| Gemini CLI (Q3) | `gemini-cli` | CLI NOT found — install + auth required first. Open the sandbox as the project, approve only this project's hook fingerprint if asked, select `yolo` and record the exact launch option (`:55-61`). | `.gemini/settings.json` — `BeforeTool` on `run_shell_command` (`:57-59`) | Unverified |
| Cursor (Q4) | `cursor` | CLI found. Trust the disposable workspace; select an auto-run mode and record its exact UI name (`:63-69`). | `.cursor/hooks.json` — `preToolUse` for `Shell`, `failClosed: true` (`:65-67`) | Unverified |
| OpenCode | `opencode` | CLI found. Open the disposable project and confirm the plugin loads; use the normal permission mode and record it, including whether the UI allowed either command without approval (`:71-76`). | `.opencode/plugins/canary/` plugin plus the `opencode.jsonc` deny rule (`:73-74`) | Unverified |

For every row: use the shared setup command, the two commands under test, the verification commands, and the attribution and evidence rules above. Use a new sandbox for each agent and each approval-free mode; a separate run is required if an agent has more than one (`docs/testing/live-agent-checks.md:33`, `:80`).

## Exact lines to update when a row is completed

In the same change that records a live result (`docs/testing/live-agent-checks.md:90`):

- README status table, the matching agent row: `README.md:9` Claude Code, `README.md:10` Codex, `README.md:11` Cursor, `README.md:12` Gemini CLI, `README.md:13` OpenCode — replace `**Unverified**` with the recorded result. A failed check means **unsupported** until fixed and rerun (`README.md:7-15`).
- Runbook results table, the matching agent row: `docs/testing/live-agent-checks.md:84` Claude Code (Q1), `:85` Codex (Q2), `:86` Gemini CLI (Q3), `:87` Cursor (Q4), `:88` OpenCode — fill Version, OS/version, Mode and result (delete / force push), and Date (`:82-88`).
- Do not edit the AC-4 checkbox at `docs/SRS.md:297`, or any agent status, until every agent has a recorded pass; an inconclusive run does not close AC-4 (`docs/testing/live-agent-checks.md:31`, `:90`).

## Setup smoke performed while preparing this handoff (not a live check)

`node scripts/live-check-setup.mjs --agent codex` was run once from the isolated worktree at `C:\Users\solan\AppData\Local\Temp\opencode\close-ci-ac4`. Outcome: exit code `0`, output "Sandbox ready for codex." Inspected without reading any config contents or secrets: sentinel file present, generated `.codex/hooks.json` present, `LIVE-CHECK.txt` present, bare remote `HEAD` and `refs/heads/main` present, and the offline-installed runtime present. No agent CLI was launched; no live session, no blocked-command observation, and no AC-4 result was produced. The sandbox repo's three untracked entries (`.codex/`, `.gitignore`, `LIVE-CHECK.txt`) are files the script writes intentionally after its seed commit, so they are expected and not a defect.
