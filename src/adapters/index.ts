/**
 * Public surface of the five thin agent adapters (WP-02).
 *
 * Each factory receives an injected `Evaluator` from `../contract.ts`; the
 * core implementation is wired in later (WP-08). None of these modules make
 * policy decisions, open a network connection, or read environment values.
 */

export {
  type ClaudeCodeAdapter,
  type ClaudeCodeEvent,
  createClaudeCodeAdapter,
} from "./claude-code.ts";
export {
  type CodexAdapter,
  type CodexEvent,
  createCodexAdapter,
} from "./codex.ts";
export {
  type CursorAdapter,
  type CursorAdapterOptions,
  type CursorEvent,
  type CursorOutput,
  type CursorWarnLogEntry,
  type CursorWarnLogger,
  createCursorAdapter,
} from "./cursor.ts";
export {
  type DiagnosticsSink,
  type GeminiCliAdapter,
  type GeminiCliAdapterOptions,
  type GeminiCliEvent,
  type GeminiCliOutput,
  createGeminiCliAdapter,
} from "./gemini-cli.ts";
export {
  type OpenCodeAdapter,
  type OpenCodePermissionEvent,
  createOpenCodeAdapter,
} from "./opencode.ts";

export {
  CLAUDE_CODE_FAIL_CLOSED,
  CURSOR_FAIL_CLOSED,
  FAIL_OPEN_NOTICE,
  type FailOpenAgent,
} from "./config.ts";

export {
  CLAUDE_FIELD_LIMIT,
  HOOK_EXIT_CODE,
  type AdapterContext,
  type PreToolUseOutput,
  toStdout,
  truncateAtLimit,
} from "./shared.ts";
