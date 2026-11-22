import { readFileSync } from "node:fs";
import {
  createClaudeCodeAdapter,
  createCodexAdapter,
  createCursorAdapter,
  createGeminiCliAdapter,
  createOpenCodeAdapter,
  toStdout,
} from "../adapters/index.js";
                                                                       
                                                
import { evaluate } from "../core/evaluate.js";
import { resolveProjectRoot } from "../core/paths.js";
import { appendProjectLog } from "./output.js";
                                           

const ENV_NAMES = [
  "CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "GEMINI_PROJECT_DIR",
  "DATABASE_URL", "POSTGRES_URL", "PGHOST", "MYSQL_HOST", "MONGODB_URI", "MONGO_URL",
]         ;

export function hookEvaluator()            {
  const env = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  return (input) => evaluate({ ...input, env });
}

export function runHook(agent           )       {
  const payload          = JSON.parse(readFileSync(0, "utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid hook event.");
  }
  const event = payload                                                         ;
  const evaluator = hookEvaluator();
  let output               ;

  switch (agent) {
    case "claude-code":
      output = createClaudeCodeAdapter(evaluator)(event);
      break;
    case "codex":
      output = createCodexAdapter(evaluator)(event);
      break;
    case "cursor": {
      let projectRoot                    ;
      const adapter = createCursorAdapter((input) => {
        projectRoot = resolveProjectRoot({ ...input, env: {
          CURSOR_PROJECT_DIR: process.env.CURSOR_PROJECT_DIR,
        } });
        return evaluator(input);
      }, {
        logWarn(entry) {
          if (!projectRoot) return;
          appendProjectLog(projectRoot, JSON.stringify(entry) + "\n");
        },
      });
      output = adapter(event);
      break;
    }
    case "gemini-cli":
      output = createGeminiCliAdapter(evaluator, {
        diagnostics: (message) => process.stderr.write(message + "\n"),
      })(event);
      break;
    case "opencode": {
      // The installed server plugin runs in-process. The CLI also accepts a
      // synthetic permission event for contract verification.
      const source = payload                           ;
      const result = createOpenCodeAdapter(evaluator)({
        action: source.action,
        resources: source.resources,
      }, { projectRoot: process.cwd() });
      output = result.effect ? { effect: result.effect, message: result.message } : null;
      break;
    }
  }

  process.stdout.write(toStdout(output));
}
