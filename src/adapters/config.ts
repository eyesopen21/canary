/**
 * Reusable fail-closed configuration snippets for `canary init`.
 *
 * The flags below are copied verbatim from docs/specs/agent-adapters.md:
 * only Claude Code [S1] and Cursor [S9] document a fail-closed hook setting.
 * WP-07 owns the full plugin/config files; it can spread these constants into
 * its generated JSON so the flag names and values cannot drift.
 *
 * Codex [S8], Gemini CLI [S10] and OpenCode (Q5) document no such setting.
 * For those agents `init` must print a notice instead of claiming fail-closed
 * behaviour (CAN-F-21, openspec "Fail-closed setup").
 */

/** Claude Code: a crash, timeout or invalid output blocks the call [S1]. */
export const CLAUDE_CODE_FAIL_CLOSED = Object.freeze({ onFailure: "block" as const });

/** Cursor: a crash, timeout, non-zero exit or empty output blocks the action [S9]. */
export const CURSOR_FAIL_CLOSED = Object.freeze({ failClosed: true as const });

/** Text for agents whose hook failure lets the action run. No secrets, no paths. */
export const FAIL_OPEN_NOTICE = Object.freeze({
  codex:
    "Canary: Codex does not document a fail-closed hook setting; a hook failure lets the command run.",
  "gemini-cli":
    "Canary: Gemini CLI does not document a fail-closed hook setting; a hook failure lets the command run.",
  opencode:
    "Canary: OpenCode fail-closed behaviour is unverified; do not assume a hook failure blocks the command.",
} as const);

export type FailOpenAgent = keyof typeof FAIL_OPEN_NOTICE;
