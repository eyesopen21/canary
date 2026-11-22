import assert from "node:assert/strict";
import test from "node:test";
import type { CheckFinding, Severity } from "../src/contract.ts";
import {
  SEVERITY_WEIGHTS,
  compareFindings,
  computeScore,
  severityWeight,
  sortFindings,
  summarizeSeverities,
} from "../src/core/score.ts";

function f(id: string, severity: Severity, path: string, line: number | null): CheckFinding {
  return {
    id,
    check: "C2",
    rule: "rule",
    severity,
    path,
    line,
    danger: "A danger.",
    consequence: "A consequence.",
    fix: null,
    manual: null,
  };
}

test("A8 weights are critical 25, high 15, medium 5, low 1", () => {
  assert.deepEqual(SEVERITY_WEIGHTS, { critical: 25, high: 15, medium: 5, low: 1 });
  assert.equal(severityWeight("critical"), 25);
  assert.equal(severityWeight("high"), 15);
  assert.equal(severityWeight("medium"), 5);
  assert.equal(severityWeight("low"), 1);
});

test("score starts at 100 and subtracts each finding's weight", () => {
  assert.equal(computeScore([]), 100);
  assert.equal(computeScore([f("a", "critical", "a.ts", 1)]), 75);
  assert.equal(
    computeScore([
      f("a", "critical", "a.ts", 1),
      f("b", "high", "b.ts", 2),
      f("c", "medium", "c.ts", 3),
    ]),
    55,
  );
  assert.equal(computeScore([f("a", "low", "a.ts", 1)]), 99);
});

test("score has a floor of 0", () => {
  const many = Array.from({ length: 8 }, (_, index) => f(`c${index}`, "critical", `c${index}.ts`, index + 1));
  assert.equal(computeScore(many), 0);
  assert.equal(
    computeScore([
      f("a", "critical", "a.ts", 1),
      f("b", "critical", "b.ts", 2),
      f("c", "critical", "c.ts", 3),
      f("d", "critical", "d.ts", 4),
    ]),
    0,
  );
});

test("findings are ordered by descending weight, then path, then line", () => {
  const findings = [
    f("low", "low", "a/low.ts", 1),
    f("crit-z", "critical", "z/crit.ts", 9),
    f("high", "high", "b/high.ts", 2),
    f("crit-b", "critical", "b/crit.ts", 1),
    f("medium", "medium", "a/medium.ts", 5),
  ];

  assert.deepEqual(
    sortFindings(findings).map((finding) => finding.id),
    ["crit-b", "crit-z", "high", "medium", "low"],
  );
  // The three worst findings come first (CAN-F-03).
  assert.deepEqual(
    sortFindings(findings).slice(0, 3).map((finding) => finding.severity),
    ["critical", "critical", "high"],
  );
});

test("a null line sorts before a numbered line for the same weight and path", () => {
  const withoutLine = f("null-line", "high", "a.ts", null);
  const withLine = f("line-1", "high", "a.ts", 1);
  assert.equal(compareFindings(withoutLine, withLine) < 0, true);
  assert.deepEqual(sortFindings([withLine, withoutLine]).map((finding) => finding.id), ["null-line", "line-1"]);
});

test("identical primary keys break ties deterministically", () => {
  const first = f("id-z", "high", "a.ts", 1);
  const second = f("id-a", "high", "a.ts", 1);
  first.check = "C2";
  first.rule = "zeta";
  second.check = "C2";
  second.rule = "alpha";

  assert.deepEqual(sortFindings([first, second]).map((finding) => finding.id), ["id-a", "id-z"]);
  assert.deepEqual(sortFindings([second, first]).map((finding) => finding.id), ["id-a", "id-z"]);
});

test("sorting does not mutate its input", () => {
  const findings = [f("low", "low", "b.ts", 1), f("high", "high", "a.ts", 1)];
  const before = findings.map((finding) => finding.id);
  sortFindings(findings);
  assert.deepEqual(findings.map((finding) => finding.id), before);
});

test("summary counts each severity", () => {
  const findings = [
    f("c1", "critical", "c1.ts", 1),
    f("c2", "critical", "c2.ts", 1),
    f("h", "high", "h.ts", 1),
    f("m", "medium", "m.ts", 1),
  ];
  assert.deepEqual(summarizeSeverities(findings), { critical: 2, high: 1, medium: 1, low: 0 });
  assert.deepEqual(summarizeSeverities([]), { critical: 0, high: 0, medium: 0, low: 0 });
});
