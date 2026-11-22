import { createCursorAdapter, type CursorEvent, type CursorWarnLogEntry } from "../adapters/cursor.ts";
import { resolveProjectRoot } from "../core/paths.ts";
import type { EvaluationInput, EvaluationResult } from "../contract.ts";
import { appendCursorWarning } from "./cursor-log.ts";
import { createHookEvaluator, hookExecution, startHookIfDirect, type HookRuntime } from "./runtime.ts";

export function handleHookEvent(payload: unknown, runtime: HookRuntime = {}) {
  const environment = runtime.env ?? process.env;
  let evaluation: EvaluationResult | undefined;
  let projectRoot: string | undefined;
  const coreEvaluator = createHookEvaluator(environment, (result) => { evaluation = result; });
  const evaluator = (input: EvaluationInput) => {
    projectRoot = resolveProjectRoot({ ...input, env: { CURSOR_PROJECT_DIR: environment.CURSOR_PROJECT_DIR } });
    return coreEvaluator(input);
  };
  const logWarn = runtime.cursorWarnLogger ?? ((entry: CursorWarnLogEntry) => {
    if (projectRoot) appendCursorWarning(projectRoot, entry);
  });
  const output = createCursorAdapter(evaluator, { logWarn })(payload as CursorEvent);
  return hookExecution(evaluation, output);
}

export function startHook(): void {
  startHookIfDirect(import.meta.url, handleHookEvent, () => ({
    permission: "deny",
    user_message: "Canary could not evaluate the hook event. Check the hook configuration.",
    agent_message: "Canary could not evaluate the hook event. Check the hook configuration.",
  }));
}
