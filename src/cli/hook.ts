import { readFileSync } from "node:fs";
import {
  createClaudeCodeAdapter,
  createCodexAdapter,
  createCursorAdapter,
  createGeminiCliAdapter,
  createOpenCodeAdapter,
  toStdout,
} from "../adapters/index.ts";
import type { OpenCodePermissionEvent } from "../adapters/opencode.ts";
import type { Evaluator } from "../contract.ts";
import { evaluate } from "../core/evaluate.ts";
import { resolveProjectRoot } from "../core/paths.ts";
import { appendProjectLog } from "./output.ts";
import type { AgentName } from "./main.ts";

const ENV_NAMES = [
  "CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "GEMINI_PROJECT_DIR",
  "DATABASE_URL", "POSTGRES_URL", "PGHOST", "MYSQL_HOST", "MONGODB_URI", "MONGO_URL",
] as const;

export function hookEvaluator(): Evaluator {
  const env = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  return (input) => evaluate({ ...input, env });
}

export function runHook(agent: AgentName): void {
  const payload: unknown = JSON.parse(readFileSync(0, "utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid hook event.");
  }
  const event = payload as Parameters<ReturnType<typeof createCursorAdapter>>[0];
  const evaluator = hookEvaluator();
  let output: object | null;

  switch (agent) {
    case "claude-code":
      output = createClaudeCodeAdapter(evaluator)(event);
      break;
    case "codex":
      output = createCodexAdapter(evaluator)(event);
      break;
    case "cursor": {
      let projectRoot: string | undefined;
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
      const source = payload as OpenCodePermissionEvent;
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
