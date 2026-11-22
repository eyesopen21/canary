import { createCodexAdapter } from "../adapters/codex.ts";
import type { CodexEvent } from "../adapters/codex.ts";
import type { EvaluationResult } from "../contract.ts";
import { createHookEvaluator, hookExecution, startHookIfDirect, type HookRuntime } from "./runtime.ts";

export function handleHookEvent(payload: unknown, runtime: HookRuntime = {}) {
  let evaluation: EvaluationResult | undefined;
  const evaluator = createHookEvaluator(runtime.env ?? process.env, (result) => { evaluation = result; });
  const output = createCodexAdapter(evaluator)(payload as CodexEvent);
  return hookExecution(evaluation, output);
}

export function startHook(): void {
  startHookIfDirect(import.meta.url, handleHookEvent);
}
