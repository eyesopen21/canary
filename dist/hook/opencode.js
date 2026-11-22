import { createOpenCodeAdapter,                              } from "../adapters/opencode.js";
                                                       
import { createHookEvaluator, hookExecution, startHookIfDirect,                  } from "./runtime.js";

export function handleHookEvent(payload         , runtime              = {}) {
  let evaluation                              ;
  const evaluator = createHookEvaluator(runtime.env ?? process.env, (result) => { evaluation = result; });
  const source = payload                           ;
  const result = createOpenCodeAdapter(evaluator)({
    action: source.action,
    resources: source.resources,
  }, { projectRoot: runtime.cwd });
  const output = result.effect ? { effect: result.effect, message: result.message } : null;
  return hookExecution(evaluation, output);
}

export function startHook()       {
  startHookIfDirect(import.meta.url, handleHookEvent);
}
