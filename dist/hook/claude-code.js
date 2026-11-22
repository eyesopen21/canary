import { createClaudeCodeAdapter } from "../adapters/claude-code.js";
                                                                  
                                                       
import { createHookEvaluator, hookExecution, startHookIfDirect,                  } from "./runtime.js";

export function handleHookEvent(payload         , runtime              = {}) {
  let evaluation                              ;
  const evaluator = createHookEvaluator(runtime.env ?? process.env, (result) => { evaluation = result; });
  const output = createClaudeCodeAdapter(evaluator)(payload                   );
  return hookExecution(evaluation, output);
}

export function startHook()       {
  startHookIfDirect(import.meta.url, handleHookEvent, () => ({
    systemMessage: "Canary could not evaluate the hook event. Check the hook configuration.",
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Canary could not evaluate the hook event. Check the hook configuration.",
    },
  }));
}
