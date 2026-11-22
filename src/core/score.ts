/**
 * Severity weights, the Blast Radius Score and the canonical finding order.
 *
 * CAN-F-03, A8. The weights are the values assumed in A8; that assumption is
 * still unconfirmed by the maintainer. The module uses only Node built-ins
 * (in fact none at runtime) and is deterministic by construction: no locale
 * dependent comparison, no clock, no environment.
 */
import type { CheckFinding, Severity } from "../contract.ts";

/** A8: critical 25, high 15, medium 5, low 1. */
export const SEVERITY_WEIGHTS: Readonly<Record<Severity, number>> = {
  critical: 25,
  high: 15,
  medium: 5,
  low: 1,
};

export function severityWeight(severity: Severity): number {
  return SEVERITY_WEIGHTS[severity];
}

/**
 * Start at 100 and subtract the weight of every finding, with a floor of 0.
 * Higher is safer (A8).
 */
export function computeScore(findings: readonly CheckFinding[]): number {
  let penalty = 0;
  for (const finding of findings) {
    penalty += severityWeight(finding.severity);
  }
  return Math.max(0, 100 - penalty);
}

/** Code-unit comparison: Intl/locale collation would break CAN-N-04. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** A finding without a line sorts before one anchored to a concrete line. */
function lineKey(line: number | null): number {
  return line === null ? -1 : line;
}

/**
 * CAN-F-03: descending weight, then path, then line.
 * check, rule and id are extra tie-breakers so that findings with identical
 * primary keys never depend on the order in which a check returned them.
 */
export function compareFindings(a: CheckFinding, b: CheckFinding): number {
  const byWeight = severityWeight(b.severity) - severityWeight(a.severity);
  if (byWeight !== 0) return byWeight;

  const byPath = compareStrings(a.path, b.path);
  if (byPath !== 0) return byPath;

  const byLine = lineKey(a.line) - lineKey(b.line);
  if (byLine !== 0) return byLine;

  const byCheck = compareStrings(a.check, b.check);
  if (byCheck !== 0) return byCheck;

  const byRule = compareStrings(a.rule, b.rule);
  if (byRule !== 0) return byRule;

  return compareStrings(a.id, b.id);
}

/** Returns a new array; the input is never mutated. */
export function sortFindings(findings: readonly CheckFinding[]): CheckFinding[] {
  return [...findings].sort(compareFindings);
}

export interface SeveritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export function summarizeSeverities(findings: readonly CheckFinding[]): SeveritySummary {
  const summary: SeveritySummary = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) {
    summary[finding.severity] += 1;
  }
  return summary;
}
