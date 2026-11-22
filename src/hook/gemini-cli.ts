import { createGeminiCliAdapter } from "../adapters/gemini-cli.ts";
import type { GeminiCliEvent } from "../adapters/gemini-cli.ts";
import type { EvaluationResult } from "../contract.ts";
import { createHookEvaluator, hookExecution, startHookIfDirect, type HookRuntime } from "./runtime.ts";

export function handleHookEvent(payload: unknown, runtime: HookRuntime = {}) {
  let evaluation: EvaluationResult | undefined;
  const evaluator = createHookEvaluator(runtime.env ?? process.env, (result) => { evaluation = result; });
  const output = createGeminiCliAdapter(evaluator, {
    diagnostics: (message) => process.stderr.write(message + "\n"),
  })(payload as GeminiCliEvent);
  return hookExecution(evaluation, output);
}

export function startHook(): void {
  startHookIfDirect(import.meta.url, handleHookEvent);
}
