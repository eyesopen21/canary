import { createCursorAdapter,                                           } from "../adapters/cursor.js";
import { resolveProjectRoot } from "../core/paths.js";
                                                                        
import { appendCursorWarning } from "./cursor-log.js";
import { createHookEvaluator, hookExecution, startHookIfDirect,                  } from "./runtime.js";

export function handleHookEvent(payload         , runtime              = {}) {
  const environment = runtime.env ?? process.env;
  let evaluation                              ;
  let projectRoot                    ;
  const coreEvaluator = createHookEvaluator(environment, (result) => { evaluation = result; });
  const evaluator = (input                 ) => {
    projectRoot = resolveProjectRoot({ ...input, env: { CURSOR_PROJECT_DIR: environment.CURSOR_PROJECT_DIR } });
    return coreEvaluator(input);
  };
  const logWarn = runtime.cursorWarnLogger ?? ((entry                    ) => {
    if (projectRoot) appendCursorWarning(projectRoot, entry);
  });
  const output = createCursorAdapter(evaluator, { logWarn })(payload               );
  return hookExecution(evaluation, output);
}

export function startHook()       {
  startHookIfDirect(import.meta.url, handleHookEvent, () => ({
    permission: "deny",
    user_message: "Canary could not evaluate the hook event. Check the hook configuration.",
    agent_message: "Canary could not evaluate the hook event. Check the hook configuration.",
  }));
}
