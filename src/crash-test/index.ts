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
  FALLBACK_DECISIONS,
  prepareScenario,
  SCENARIO_IDS,
  SCENARIO_META,
} from "./scenarios.ts";
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
function redact(text: string, root: string): string {
  return text
    .replaceAll(FAKE_DATABASE_URL, "[redacted]")
    .replaceAll(root, "[temporary-directory]")
    .replace(/[\u0000-\u001F\u007F]/g, "");
}

function evaluateFor(id: CrashScenarioId, options: CrashTestOptions): EvaluationResult {
  const fallback = FALLBACK_DECISIONS[id];
  if (!options.evaluator) return fallback;
  try {
    const result = options.evaluator({
      command: SCENARIO_META[id].command,
      // Only a synthetic value is ever given to an evaluator.
      env: id === "database" ? { DATABASE_URL: FAKE_DATABASE_URL } : {},
    });
    if (result && typeof result.decision === "string") return result;
  } catch {
    // Fail closed: an evaluator error is treated as a block.
  }
  return fallback;
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
  if (phase === "without" && shared.options.forceSimulation) {
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
    return simulated(reasonOf(error), "A guard refused the operation; simulation shown instead.");
  }
}

async function runScenario(id: CrashScenarioId, shared: Shared): Promise<ScenarioResult> {
  const decision = evaluateFor(id, shared.options);
  const safeDecision: EvaluationResult = {
    decision: decision.decision,
    rule: decision.rule,
    message: redact(decision.message ?? "", shared.root),
  };

  const withoutCanary = await runPhase(id, "without", shared);
  const withCanary =
    decision.decision === "block"
      ? {
          simulated: false,
          label: "prevented" as const,
          detail: "Canary withheld the command; no destructive operation ran.",
        }
      : await runPhase(id, "with", shared);

  return {
    id,
    title: SCENARIO_META[id].title,
    command: redact(SCENARIO_META[id].command, shared.root),
    withoutCanary,
    withCanary: { ...withCanary, ...safeDecision },
  };
}

function allSimulatedReport(reason: SimulationReason): CrashTestReport {
  const detail = "A guard refused the operation; simulation shown instead.";
  return {
    schema_version: 1,
    simulatedScenarios: [...SCENARIO_IDS],
    cleanup: "not-started",
    scenarios: SCENARIO_IDS.map((id) => {
      const decision = FALLBACK_DECISIONS[id];
      return {
        id,
        title: SCENARIO_META[id].title,
        command: SCENARIO_META[id].command,
        withoutCanary: simulated(reason, detail),
        withCanary: {
          simulated: false,
          label: "prevented" as const,
          detail: "Canary withheld the command; no destructive operation ran.",
          ...decision,
        },
      };
    }),
  };
}

/** Run all three scenarios in a fresh, guarded temporary directory. */
export async function runCrashTest(options: CrashTestOptions = {}): Promise<CrashTestReport> {
  let root: string;
  try {
    root = await createSandboxRoot(options.onTempRoot);
  } catch (error) {
    return allSimulatedReport(reasonOf(error));
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
    scenarios = SCENARIO_IDS.map((id) => {
      const decision = FALLBACK_DECISIONS[id];
      return {
        id,
        title: SCENARIO_META[id].title,
        command: SCENARIO_META[id].command,
        withoutCanary: simulated("RUNTIME_ERROR", "A guard refused the operation; simulation shown instead."),
        withCanary: {
          simulated: false,
          label: "prevented" as const,
          detail: "Canary withheld the command; no destructive operation ran.",
          ...decision,
        },
      };
    });
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
