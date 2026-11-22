import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
                                                                
import { toStdout } from "../adapters/shared.js";
import { evaluate } from "../core/evaluate.js";
                                                                                

const ENV_NAMES = [
  "CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "GEMINI_PROJECT_DIR",
  "DATABASE_URL", "POSTGRES_URL", "PGHOST", "MYSQL_HOST", "MONGODB_URI", "MONGO_URL",
]         ;

                              
                                           
               
                                                         
 

                                
                                         
                
                   
                        
 

                                                                                    

export function hookEnvironment(environment                                    )                                     {
  return Object.fromEntries(ENV_NAMES.map((name) => [name, environment[name]]));
}

export function createHookEvaluator(
  environment                                    ,
  capture                                    ,
)                                               {
  const env = hookEnvironment(environment);
  return (input) => {
    const result = evaluate({ ...input, env });
    capture(result);
    return result;
  };
}

export function hookExecution(result                              , output               )                {
  return {
    decision: result?.decision ?? "allow",
    ...(result?.rule ? { rule: result.rule } : {}),
    ...(result?.message ? { message: result.message } : {}),
    output,
  };
}

export function startHookIfDirect(
  moduleUrl        ,
  handler             ,
  onFailure                      ,
)       {
  const entry = process.argv[1];
  if (!entry) return;
  const modulePath = fileURLToPath(moduleUrl);
  // Node resolves the main ES module to its realpath for `import.meta.url`
  // while `process.argv[1]` keeps the path used to launch it. A hook launched
  // through a symlinked directory (for example a macOS temp dir, where /var
  // points at /private/var) must still be recognized as the direct entry, or
  // it exits successfully without evaluating anything.
  const isDirectEntry = (() => {
    try {
      return realpathSync(entry) === realpathSync(modulePath);
    } catch {
      return path.resolve(entry) === path.resolve(modulePath);
    }
  })();
  if (!isDirectEntry) return;

  try {
    const payload          = JSON.parse(readFileSync(0, "utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid hook event.");
    }
    process.stdout.write(toStdout(handler(payload, { env: process.env, cwd: process.cwd() }).output));
  } catch {
    if (onFailure) {
      process.stdout.write(toStdout(onFailure()));
    } else {
      process.stderr.write("Canary could not evaluate the hook event. Check the hook configuration.\n");
      process.exitCode = 1;
    }
  }
}
