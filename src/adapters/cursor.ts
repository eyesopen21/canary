/**
 * Cursor preToolUse adapter (CAN-F-19, CAN-I-05, CAN-I-07, CAN-N-11).
 *
 * Pure translation: read only the documented event fields [S9]; `user_email`
 * is deliberately absent from the event type and is never accessed.
 * Always print a valid JSON object, because invalid JSON blocks the action
 * in Cursor [S9]. A warning degrades to `permission: "allow"` plus a local
 * log entry (Q8): `ask` is accepted but not enforced for preToolUse [S9].
 *
 * The log sink is injected so this module never writes a file. WP-08 wires it
 * to `canary/hook.log` inside the project (CAN-N-11). Only the rule ID and
 * the decision are recorded, never the message, command or identity fields.
 */

import type { Evaluator, RuleId } from "../contract.ts";
import path from "node:path";
import type { AdapterContext } from "./shared.ts";

/** Fields documented for a Cursor preToolUse event [S9].
 * There is intentionally no `user_email` here. */
export interface CursorEvent {
  tool_name?: string;
  tool_input?: { command?: string; working_directory?: string };
  cwd?: string;
  workspace_roots?: string[];
}

export interface CursorOutput {
  permission: "deny" | "allow";
  user_message?: string;
  agent_message?: string;
}

/** Only these two fields are written to the local log. */
export interface CursorWarnLogEntry {
  decision: "warn";
  rule?: RuleId;
}

export type CursorWarnLogger = (entry: CursorWarnLogEntry) => void;

export interface CursorAdapterOptions {
  /** Defaults to a no-op so the adapter has no file-system side effect. */
  logWarn?: CursorWarnLogger;
}

export type CursorAdapter = (
  event: CursorEvent,
  context?: AdapterContext,
) => CursorOutput;

function isWithin(root: string, directory: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(directory));
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

/** Select a workspace root only when the event makes the choice unambiguous. */
function cursorWorkspaceRoot(event: CursorEvent, workingDirectory: string | undefined): string | undefined {
  const roots = (event.workspace_roots ?? []).filter(
    (root) => typeof root === "string" && root.trim() !== "" && path.isAbsolute(root),
  );
  if (roots.length === 1) return roots[0];
  if (!workingDirectory || roots.length < 2) return undefined;

  const containing = roots.filter((root) => isWithin(root, workingDirectory));
  return containing.length === 1 ? containing[0] : undefined;
}

export function createCursorAdapter(
  evaluator: Evaluator,
  options: CursorAdapterOptions = {},
): CursorAdapter {
  return (event, context = {}) => {
    const command = event.tool_input?.command;
    if (typeof command !== "string" || command.length === 0) {
      return { permission: "allow" };
    }

    // Cursor documents working_directory as the Shell tool's execution
    // directory [S9]; it takes precedence over the hook process cwd.
    const cwd = event.tool_input?.working_directory ?? event.cwd;
    const projectRoot = context.projectRoot ?? cursorWorkspaceRoot(event, cwd);
    const result = evaluator({
      command,
      ...(typeof cwd === "string" ? { cwd } : {}),
      ...(typeof projectRoot === "string" ? { projectRoot } : {}),
    });

    if (result.decision === "block") {
      const message = result.message ?? "";
      return {
        permission: "deny",
        user_message: message,
        agent_message: message,
      };
    }

    if (result.decision === "warn") {
      options.logWarn?.({
        decision: "warn",
        ...(result.rule ? { rule: result.rule } : {}),
      });
    }

    // Allow and warn both use `allow`; the warning only exists in the log.
    return { permission: "allow" };
  };
}
