import { readFileSync } from "node:fs";
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
  if (!entry || path.resolve(entry) !== path.resolve(fileURLToPath(moduleUrl))) return;

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
