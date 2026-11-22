/**
 * Gemini CLI BeforeTool adapter (CAN-F-19, CAN-I-05, CAN-C-03).
 *
 * Pure translation of the documented event fields [S11][S25] into a single
 * JSON object on stdout. Any diagnostics go to an injected stderr sink:
 * extra stdout text breaks parsing and makes the CLI default to allow [S10].
 * An allow emits `{}` — a valid object with no `decision` field, never an
 * explicit approval. No policy logic here (ADR-0005).
 */

import type { Evaluator, EvaluationResult } from "../contract.ts";
import type { AdapterContext } from "./shared.ts";

/** Fields documented for a Gemini CLI BeforeTool event [S11][S25]. */
export interface GeminiCliEvent {
  tool_name?: string;
  tool_input?: { command?: string; dir_path?: string };
  cwd?: string;
}

export interface GeminiCliOutput {
  decision?: "deny";
  reason?: string;
  systemMessage?: string;
}

/** Receives stderr text; the CLI layer wires it to process.stderr. */
export type DiagnosticsSink = (message: string) => void;

export interface GeminiCliAdapterOptions {
  diagnostics?: DiagnosticsSink;
}

export type GeminiCliAdapter = (
  event: GeminiCliEvent,
  context?: AdapterContext,
) => GeminiCliOutput;

export function createGeminiCliAdapter(
  evaluator: Evaluator,
  options: GeminiCliAdapterOptions = {},
): GeminiCliAdapter {
  return (event, context = {}) => {
    const command = event.tool_input?.command;
    if (typeof command !== "string" || command.length === 0) return {};

    const dirPath = event.cwd ?? event.tool_input?.dir_path;
    let result: EvaluationResult;
    try {
      result = evaluator({
        command,
        ...(typeof dirPath === "string" ? { cwd: dirPath } : {}),
        ...(context.projectRoot ? { projectRoot: context.projectRoot } : {}),
      });
    } catch {
      // Never echo the command, an environment value or an error detail.
      options.diagnostics?.("Canary: hook evaluation failed.");
      return {};
    }

    const message = result.message ?? "";
    if (result.decision === "block") {
      return { decision: "deny", reason: message, systemMessage: message };
    }
    if (result.decision === "warn") {
      return { systemMessage: message };
    }
    return {};
  };
}
