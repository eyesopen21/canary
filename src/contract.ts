/**
 * Shared contract between the Canary core and the agent adapters.
 *
 * This file is owned by the project scaffolding. Neither implementation
 * agent may change it; both import these types.
 */

export type Decision = "allow" | "warn" | "block";

export type RuleId =
  | "B0"
  | "B1a"
  | "B1b"
  | "B1c"
  | "B1d"
  | "B1e"
  | "B2"
  | "B3"
  | "B4"
  | "W1"
  | "W2"
  | "W3";

export interface EvaluationInput {
  /** The shell command text as the agent sent it. */
  command: string;
  /** The working directory reported by the agent, when available. */
  cwd?: string;
  /** The resolved project root, when available. */
  projectRoot?: string;
  /** Only variable NAMES and values needed to resolve a host, in memory. */
  env?: Record<string, string | undefined>;
}

export interface EvaluationResult {
  decision: Decision;
  rule?: RuleId;
  message?: string;
}

/** The core's public entry point, injected into adapters and tests. */
export type Evaluator = (input: EvaluationInput) => EvaluationResult;
