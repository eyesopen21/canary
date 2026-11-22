/**
 * Claude Code PreToolUse adapter (CAN-F-19, CAN-I-05, CAN-I-06, CAN-C-03).
 *
 * Pure translation: read only the documented event fields [S1], forward the
 * command to the injected core, and map the decision to Claude Code's JSON.
 * No policy logic lives here (ADR-0005). The caller writes `stdout` and exits
 * with HOOK_EXIT_CODE (0); exit code 1 would be a non-blocking error [S1].
 *
 * An allow returns `null`: print nothing. Never emit
 * `hookSpecificOutput.permissionDecision: "allow"`, which skips the prompt [S1].
 */

import type { Evaluator } from "../contract.ts";
import {
  CLAUDE_FIELD_LIMIT,
  type AdapterContext,
  type PreToolUseOutput,
  truncateAtLimit,
} from "./shared.ts";

/** Fields documented for a Claude Code PreToolUse event [S1].
 * `permission_mode` is part of the shape but is not used to make decisions. */
export interface ClaudeCodeEvent {
  tool_name?: string;
  tool_input?: { command?: string };
  cwd?: string;
  permission_mode?: string;
}

export type ClaudeCodeAdapter = (
  event: ClaudeCodeEvent,
  context?: AdapterContext,
) => PreToolUseOutput | null;

export function createClaudeCodeAdapter(evaluator: Evaluator): ClaudeCodeAdapter {
  return (event, context = {}) => {
    const command = event.tool_input?.command;
    if (typeof command !== "string" || command.length === 0) return null;

    const result = evaluator({
      command,
      ...(typeof event.cwd === "string" ? { cwd: event.cwd } : {}),
      ...(context.projectRoot ? { projectRoot: context.projectRoot } : {}),
    });
    const message = truncateAtLimit(result.message ?? "", CLAUDE_FIELD_LIMIT);

    if (result.decision === "block") {
      return {
        systemMessage: message,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: message,
        },
      };
    }

    if (result.decision === "warn") {
      return {
        systemMessage: message,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: message,
        },
      };
    }

    return null;
  };
}
