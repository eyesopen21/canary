/**
 * Shared types for the isolated crash test (CAN-F-07, ADR-0004).
 *
 * Nothing in this module holds a real credential, a host taken from a
 * credential, or an absolute path. Reports use fixed strings only.
 */
import type { Decision, EvaluationResult, Evaluator, RuleId } from "../contract.ts";

export type { Decision, EvaluationResult, Evaluator, RuleId };

/** Prefix used for the OS temporary directory created by each crash test. */
export const TEMP_PREFIX = "canary-crash-";

export type CrashScenarioId = "delete" | "database" | "force-push";

/**
 * Fixed reason codes. A guard failure NEVER reports a caught error message:
 * those messages can contain paths or environment values (CAN-N-10).
 */
export type SimulationReason =
  | "FORCED"
  | "GUARD_OUTSIDE_TEMP"
  | "GUARD_REALPATH_FAILED"
  | "GUARD_TEMP_ROOT_CHANGED"
  | "COMMAND_UNAVAILABLE"
  | "COMMAND_FAILED"
  | "LOCAL_GIT_TRANSPORT_FAILED"
  | "EVALUATION_UNAVAILABLE"
  | "DATABASE_SIMULATED_BY_DESIGN"
  | "RUNTIME_ERROR";

export type PhaseLabel = "real run" | "simulation" | "prevented";

export interface CommandSpec {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  timeoutMs: number;
}

export interface CommandOutcome {
  ok: boolean;
  /** Used internally only to compare Git refs; never written to a report. */
  stdout?: string;
  /** Set when the executable does not exist (git not installed). */
  unavailable?: boolean;
  /** Fixed classification only; child stderr is never returned or reported. */
  failure?: "LOCAL_GIT_TRANSPORT_FAILED";
}

export type CommandRunner = (spec: CommandSpec) => CommandOutcome;

export interface PhaseResult {
  simulated: boolean;
  label: PhaseLabel;
  reason?: SimulationReason;
  detail: string;
  artifactsRemoved?: number;
  remoteRefChanged?: boolean;
}

export interface ScenarioResult {
  id: CrashScenarioId;
  title: string;
  /** Sanitized command text; contains a variable name, never a value. */
  command: string;
  withoutCanary: PhaseResult;
  withCanary: PhaseResult & { decision?: Decision; rule?: RuleId; message?: string };
}

export interface CrashTestReport {
  schema_version: 1;
  scenarios: ScenarioResult[];
  simulatedScenarios: CrashScenarioId[];
  cleanup: "cleaned" | "refused" | "not-started";
}

/** Test-only observability hooks. They are not part of the printed report. */
export interface CrashTestOptions {
  /** The "with Canary" evaluator. Defaults to the exact policy rules below. */
  evaluator?: Evaluator;
  /** Command executor. Defaults to `spawnSync` with captured stdout only. */
  commandRunner?: CommandRunner;
  /** Label every "without Canary" phase as a simulation and run nothing. */
  forceSimulation?: boolean;
  /** Deliberately unsafe targets, used by the negative isolation tests. */
  targetOverrides?: Partial<Record<CrashScenarioId, string>>;
  /** Receives the canonical temporary root; never print it (CAN-N-10). */
  onTempRoot?: (root: string) => void;
  /** Receives each path guard outcome, to prove the guard runs twice. */
  onGuardCheck?: (phase: "build" | "run", ok: boolean) => void;
  /** Receives a prepared scenario before its "without Canary" run. */
  onScenarioPrepared?: (
    id: CrashScenarioId,
    phase: "without" | "with",
    info: { root: string; sandbox: string; target: string },
  ) => void;
}
