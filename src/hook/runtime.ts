import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CursorWarnLogEntry } from "../adapters/cursor.ts";
import { toStdout } from "../adapters/shared.ts";
import { evaluate } from "../core/evaluate.ts";
import type { EvaluationInput, EvaluationResult, RuleId } from "../contract.ts";

const ENV_NAMES = [
  "CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "GEMINI_PROJECT_DIR",
  "DATABASE_URL", "POSTGRES_URL", "PGHOST", "MYSQL_HOST", "MONGODB_URI", "MONGO_URL",
] as const;

export interface HookRuntime {
  env?: Record<string, string | undefined>;
  cwd?: string;
  cursorWarnLogger?: (entry: CursorWarnLogEntry) => void;
}

export interface HookExecution {
  decision: EvaluationResult["decision"];
  rule?: RuleId;
  message?: string;
  output: object | null;
}

export type HookHandler = (payload: unknown, runtime: HookRuntime) => HookExecution;

export function hookEnvironment(environment: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(ENV_NAMES.map((name) => [name, environment[name]]));
}

export function createHookEvaluator(
  environment: Record<string, string | undefined>,
  capture: (result: EvaluationResult) => void,
): (input: EvaluationInput) => EvaluationResult {
  const env = hookEnvironment(environment);
  return (input) => {
    const result = evaluate({ ...input, env });
    capture(result);
    return result;
  };
}

export function hookExecution(result: EvaluationResult | undefined, output: object | null): HookExecution {
  return {
    decision: result?.decision ?? "allow",
    ...(result?.rule ? { rule: result.rule } : {}),
    ...(result?.message ? { message: result.message } : {}),
    output,
  };
}

export function startHookIfDirect(
  moduleUrl: string,
  handler: HookHandler,
  onFailure?: () => object | null,
): void {
  const entry = process.argv[1];
  if (!entry || path.resolve(entry) !== path.resolve(fileURLToPath(moduleUrl))) return;

  try {
    const payload: unknown = JSON.parse(readFileSync(0, "utf8"));
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
