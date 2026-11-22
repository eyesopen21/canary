import { createCodexAdapter } from "../adapters/codex.js";
                                                       
                                                       
import { createHookEvaluator, hookExecution, startHookIfDirect,                  } from "./runtime.js";

export function handleHookEvent(payload         , runtime              = {}) {
  let evaluation                              ;
  const evaluator = createHookEvaluator(runtime.env ?? process.env, (result) => { evaluation = result; });
  const output = createCodexAdapter(evaluator)(payload              );
  return hookExecution(evaluation, output);
}

export function startHook()       {
  startHookIfDirect(import.meta.url, handleHookEvent);
}
