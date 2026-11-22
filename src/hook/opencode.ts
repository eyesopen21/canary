import { createOpenCodeAdapter, type OpenCodePermissionEvent } from "../adapters/opencode.ts";
import type { EvaluationResult } from "../contract.ts";
import { createHookEvaluator, hookExecution, startHookIfDirect, type HookRuntime } from "./runtime.ts";

export function handleHookEvent(payload: unknown, runtime: HookRuntime = {}) {
  let evaluation: EvaluationResult | undefined;
  const evaluator = createHookEvaluator(runtime.env ?? process.env, (result) => { evaluation = result; });
  const source = payload as OpenCodePermissionEvent;
  const result = createOpenCodeAdapter(evaluator)({
    action: source.action,
    resources: source.resources,
  }, { projectRoot: runtime.cwd });
  const output = result.effect ? { effect: result.effect, message: result.message } : null;
  return hookExecution(evaluation, output);
}

export function startHook(): void {
  startHookIfDirect(import.meta.url, handleHookEvent);
}
