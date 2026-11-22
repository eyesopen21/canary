import { createClaudeCodeAdapter } from "../adapters/claude-code.ts";
import type { ClaudeCodeEvent } from "../adapters/claude-code.ts";
import type { EvaluationResult } from "../contract.ts";
import { createHookEvaluator, hookExecution, startHookIfDirect, type HookRuntime } from "./runtime.ts";

export function handleHookEvent(payload: unknown, runtime: HookRuntime = {}) {
  let evaluation: EvaluationResult | undefined;
  const evaluator = createHookEvaluator(runtime.env ?? process.env, (result) => { evaluation = result; });
  const output = createClaudeCodeAdapter(evaluator)(payload as ClaudeCodeEvent);
  return hookExecution(evaluation, output);
}

export function startHook(): void {
  startHookIfDirect(import.meta.url, handleHookEvent, () => ({
    systemMessage: "Canary could not evaluate the hook event. Check the hook configuration.",
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Canary could not evaluate the hook event. Check the hook configuration.",
    },
  }));
}
