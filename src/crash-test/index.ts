/**
 * Isolated crash test logic (CAN-F-07, CAN-T-06, ADR-0004).
 *
 * This is the library layer only; the CLI wiring belongs to WP-08.
 * Three destructive scenarios run inside a freshly created OS temporary
 * directory. Every target passes a realpath guard twice (at build time and
 * immediately before execution). If a guard fails, the "without Canary" side
 * is skipped and a simulation is shown, clearly labeled as such.
 */
import {
  buildMinimalEnv,
  cleanupRoot,
  createSandboxRoot,
  GuardError,
  type GuardContext,
} from "./guards.ts";
import {
  defaultCommandRunner,
  FAKE_DATABASE_URL,
  prepareScenario,
  SCENARIO_IDS,
  SCENARIO_META,
} from "./scenarios.ts";
import { evaluate } from "../core/evaluate.ts";
import type {
  CommandRunner,
  CrashScenarioId,
  CrashTestOptions,
  CrashTestReport,
  EvaluationResult,
  PhaseResult,
  ScenarioResult,
  SimulationReason,
} from "./types.ts";

export { TEMP_PREFIX } from "./types.ts";
export type {
  CommandOutcome,
  CommandRunner,
  CommandSpec,
  CrashScenarioId,
  CrashTestOptions,
  CrashTestReport,
  PhaseResult,
  ScenarioResult,
  SimulationReason,
} from "./types.ts";

interface Shared {
  root: string;
  guard: GuardContext;
  env: Record<string, string | undefined>;
  runner: CommandRunner;
  options: CrashTestOptions;
}

function simulated(reason: SimulationReason, detail: string): PhaseResult {
  return { simulated: true, label: "simulation", reason, detail };
}

/** Fixed reason codes only: a caught error message may contain a path (CAN-N-10). */
function reasonOf(error: unknown): SimulationReason {
  if (error instanceof GuardError) return error.code;
  return "RUNTIME_ERROR";
}

/** Last line of defence: never let a temp path or the fake URL reach a report. */
function redact(text: string, root?: string): string {
  const withoutPath = root ? text.replaceAll(root, "[temporary-directory]") : text;
  return withoutPath
    .replaceAll(FAKE_DATABASE_URL, "[redacted]")
    .replace(/[\u0000-\u001F\u007F]/g, "");
}

function evaluateFor(
  id: CrashScenarioId,
  root: string | undefined,
  options: CrashTestOptions,
): EvaluationResult | undefined {
  try {
    const result = (options.evaluator ?? evaluate)({
      command: SCENARIO_META[id].command,
      cwd: root,
      projectRoot: root,
      // Only a synthetic value is ever given to an evaluator.
      env: id === "database" ? { DATABASE_URL: FAKE_DATABASE_URL } : {},
    });
    if (result && ["allow", "warn", "block"].includes(result.decision)) return result;
  } catch {
    // Do not claim Canary blocked the command when evaluation did not happen.
  }
  return undefined;
}

function realRunDetail(id: CrashScenarioId): string {
  if (id === "delete") {
    return "A real recursive delete removed a guarded stand-in directory inside the temporary directory.";
  }
  return "A real force push rewrote a bare repository inside the temporary directory.";
}

async function runPhase(
  id: CrashScenarioId,
  phase: "without" | "with",
  shared: Shared,
): Promise<PhaseResult> {
  if (shared.options.forceSimulation) {
    return simulated("FORCED", "Simulation requested; no destructive operation ran.");
  }
  if (id === "database") {
    return simulated(
      "DATABASE_SIMULATED_BY_DESIGN",
      "No connection was attempted and no destructive SQL was executed.",
    );
  }

  try {
    const prepared = await prepareScenario(id, {
      ctx: shared.guard,
      env: shared.env,
      runner: shared.runner,
      phase,
      override: shared.options.targetOverrides?.[id],
    });
    shared.options.onScenarioPrepared?.(id, phase, {
      root: shared.root,
      sandbox: prepared.sandbox,
      target: prepared.target,
    });
    const effect = await prepared.run();
    return {
      simulated: false,
      label: "real run",
      detail: realRunDetail(id),
      ...effect,
    };
  } catch (error) {
    const reason = reasonOf(error);
    const detail = reason === "LOCAL_GIT_TRANSPORT_FAILED"
      ? "Git could not access the disposable local remote; simulation shown instead."
      : "The isolated operation could not complete; simulation shown instead.";
    return simulated(reason, detail);
  }
}

function evaluatedPhase(
  decision: EvaluationResult | undefined,
  alternative: PhaseResult | undefined,
  root?: string,
): ScenarioResult["withCanary"] {
  if (!decision) {
    return simulated("EVALUATION_UNAVAILABLE",
      "Canary evaluation was unavailable; the crash-test harness withheld the command and no policy decision was made.");
  }
  const phase = decision.decision === "block"
    ? { simulated: false, label: "prevented" as const, detail: "Canary withheld the command; no destructive operation ran." }
    : alternative ?? simulated("RUNTIME_ERROR", "The isolated operation could not start.");
  return { ...phase, decision: decision.decision, rule: decision.rule, message: redact(decision.message ?? "", root) };
}

async function runScenario(id: CrashScenarioId, shared: Shared): Promise<ScenarioResult> {
  const decision = evaluateFor(id, shared.root, shared.options);

  const withoutCanary = await runPhase(id, "without", shared);
  const permitted = decision && decision.decision !== "block"
    ? await runPhase(id, "with", shared)
    : undefined;
  const withCanary = evaluatedPhase(decision, permitted, shared.root);
  return {
    id,
    title: SCENARIO_META[id].title,
    command: redact(SCENARIO_META[id].command, shared.root),
    withoutCanary,
    withCanary,
  };
}

function simulatedScenarios(reason: SimulationReason, options: CrashTestOptions, root?: string): ScenarioResult[] {
  const phase = simulated(reason, "The isolated operation could not start; simulation shown instead.");
  return SCENARIO_IDS.map((id) => ({
    id,
    title: SCENARIO_META[id].title,
    command: redact(SCENARIO_META[id].command, root),
    withoutCanary: phase,
    withCanary: evaluatedPhase(evaluateFor(id, root, options), phase, root),
  }));
}

/** Run all three scenarios in a fresh, guarded temporary directory. */
export async function runCrashTest(options: CrashTestOptions = {}): Promise<CrashTestReport> {
  let root: string;
  try {
    root = await createSandboxRoot(options.onTempRoot);
  } catch (error) {
    return {
      schema_version: 1,
      scenarios: simulatedScenarios(reasonOf(error), options),
      simulatedScenarios: [...SCENARIO_IDS],
      cleanup: "not-started",
    };
  }

  const opts: CrashTestOptions = { ...options };
  const guard: GuardContext = { root, onCheck: opts.onGuardCheck };
  const shared: Shared = {
    root,
    guard,
    env: {},
    runner: opts.commandRunner ?? defaultCommandRunner,
    options: opts,
  };

  let scenarios: ScenarioResult[];
  try {
    shared.env = await buildMinimalEnv(root);
    scenarios = [];
    for (const id of SCENARIO_IDS) {
      scenarios.push(await runScenario(id, shared));
    }
  } catch {
    // A failure in shared setup must not leave a partial report behind.
    scenarios = simulatedScenarios("RUNTIME_ERROR", opts, root);
  }

  let cleanup: CrashTestReport["cleanup"] = "refused";
  try {
    cleanup = await cleanupRoot(guard);
  } catch {
    cleanup = "refused";
  }

  return {
    schema_version: 1,
    scenarios,
    simulatedScenarios: scenarios.filter((item) => item.withoutCanary.simulated).map((item) => item.id),
    cleanup,
  };
}
