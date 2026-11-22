/**
 * D3 prototype: prove that gating the B1 recursive-delete filesystem work
 * behind a cheap syntactic check changes no decision and no message.
 *
 * All hosts, database values and credentials below are synthetic marker
 * fixtures. No real credential or environment value is read or printed.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { Decision, EvaluationInput, RuleId } from "../src/contract.ts";
import { evaluate } from "../src/core/evaluate.ts";
import { getMessage, EFFECT } from "../src/core/messages.ts";
import { mayBeRecursiveDelete } from "../src/core/rules.ts";

const MARKER = "SYNTHETIC-CANARY-MARKER";
const CLOUD_HOST = `${MARKER}.synthetic.invalid`;
const CLOUD_URL = `postgresql://user:${MARKER}@${CLOUD_HOST}:5432/app`;

let baseDir: string;
let project: string;
let linkCreated = false;

before(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "canary-wp-d3-"));
  project = path.join(baseDir, "project");
  const outside = path.join(baseDir, "outside");
  fs.mkdirSync(path.join(project, "dist"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  try {
    fs.symlinkSync(outside, path.join(project, "escape-link"), process.platform === "win32" ? "junction" : "dir");
    linkCreated = true;
  } catch {
    linkCreated = false;
  }
});

after(() => {
  try {
    fs.rmSync(baseDir, { recursive: true, force: true });
  } catch {
    // Nothing to remove.
  }
});

function input(command: string, extra: Partial<EvaluationInput> = {}): EvaluationInput {
  return { command, projectRoot: project, cwd: project, env: {}, ...extra };
}

interface Case {
  name: string;
  given: EvaluationInput;
  decision: Decision;
  rule?: RuleId;
  values?: Record<string, string>;
  /** B1 cases enter the path-checking code; other categories must never touch it. */
  category: "B1" | "other";
  /** Whether this B1 case is expected to reach a realpath call. */
  resolvesPaths?: boolean;
}

const table: Case[] = [
  // Allow / non-B1 commands.
  { name: "allow: npm test", given: input("npm test"), decision: "allow", category: "other" },
  { name: "allow: terraform plan", given: input("terraform plan"), decision: "allow", category: "other" },
  { name: "allow: non-force git push", given: input("git push origin main"), decision: "allow", category: "other" },
  { name: "allow: prisma with localhost host", given: input("npx prisma migrate reset", { env: { DATABASE_URL: "postgresql://u:p@localhost:5432/app" } }), decision: "allow", category: "other" },

  // B1 variants.
  { name: "B1 allow: rm -rf dist", given: input("rm -rf dist"), decision: "allow", category: "B1", resolvesPaths: true },
  { name: "B1 allow: find -delete inside project", given: input("find ./dist -name '*.log' -delete"), decision: "allow", category: "B1", resolvesPaths: true },
  { name: "B1a: quoted variable", given: input('rm -rf "$BUILD_DIR"'), decision: "block", rule: "B1a", values: { target: '"$BUILD_DIR"' }, category: "B1" },
  { name: "B1a: PowerShell variable", given: input("rm -rf %BUILD_DIR%"), decision: "block", rule: "B1a", values: { target: "%BUILD_DIR%" }, category: "B1" },
  { name: "B1a: command substitution in chained segment", given: input("npm run clean && rm -rf $(cat dirs.txt)"), decision: "block", rule: "B1a", values: { target: "$(cat dirs.txt)" }, category: "B1" },
  { name: "B1b: glob matching nothing", given: input("rm -rf *.does-not-exist"), decision: "block", rule: "B1b", values: { target: "*.does-not-exist" }, category: "B1", resolvesPaths: true },
  { name: "B1b: parent glob", given: input("rm -rf ../*"), decision: "block", rule: "B1b", values: { target: "../*" }, category: "B1", resolvesPaths: true },
  { name: "B1b: rimraf empty glob", given: input("rimraf no-such-*.dir"), decision: "block", rule: "B1b", values: { target: "no-such-*.dir" }, category: "B1", resolvesPaths: true },
  { name: "B1c: parent path", given: input("rm -rf ../shared"), decision: "block", rule: "B1c", values: { target: "../shared" }, category: "B1", resolvesPaths: true },
  { name: "B1c: find -delete outside", given: input("find .. -name 'x' -delete"), decision: "block", rule: "B1c", values: { target: ".." }, category: "B1", resolvesPaths: true },
  { name: "B1c: quoted command name", given: input('"rm" -rf ../shared'), decision: "block", rule: "B1c", values: { target: "../shared" }, category: "B1", resolvesPaths: true },
  { name: "B1c: path-prefixed command name", given: input("/usr/bin/rm -rf ../shared"), decision: "block", rule: "B1c", values: { target: "../shared" }, category: "B1", resolvesPaths: true },
  { name: "B1c: upper-case command name", given: input("RM -RF ../shared"), decision: "block", rule: "B1c", values: { target: "../shared" }, category: "B1", resolvesPaths: true },
  // Pre-existing behavior: a bare "/" is skipped by positionalTargets, so this
  // is allowed today. The prototype must not change that decision.
  { name: "pre-existing allow: bare / target is skipped", given: input("rm -rf /"), decision: "allow", category: "B1" },
  { name: "B1d: all files from project root", given: input("rm -rf ./*"), decision: "block", rule: "B1d", values: { target: "./*" }, category: "B1", resolvesPaths: true },
  { name: "B1e: project root unknown", given: { command: "rm -rf dist", env: {} }, decision: "block", rule: "B1e", values: { target: "dist" }, category: "B1" },

  // W1 / W2 / W3.
  { name: "W1: force-with-lease", given: input("git push --force-with-lease"), decision: "warn", rule: "W1", values: { remote: "the remote" }, category: "other" },
  { name: "W2: git reset --hard", given: input("git reset --hard"), decision: "warn", rule: "W2", values: {}, category: "other" },
  { name: "W3: git clean -fd", given: input("git clean -fd"), decision: "warn", rule: "W3", values: { flags: "-fd" }, category: "other" },

  // B2 / B3 / B4.
  { name: "B2: cloud prisma reset", given: input("npx prisma migrate reset", { env: { DATABASE_URL: CLOUD_URL } }), decision: "block", rule: "B2", values: { var: "DATABASE_URL", effect: EFFECT.resetsSchema }, category: "other" },
  { name: "B3: force push", given: input("git push --force origin main"), decision: "block", rule: "B3", values: { remote: "origin" }, category: "other" },
  { name: "B4: terraform auto-approve", given: input("terraform apply -auto-approve"), decision: "block", rule: "B4", values: { tool: "terraform", subcommand: "apply" }, category: "other" },

  // B0 / combination order.
  { name: "B0: unbalanced quote", given: input('rm -rf "dist'), decision: "block", rule: "B0", values: { token: "rm" }, category: "other" },
  { name: "block outranks warn", given: input("git reset --hard && git push --force origin main"), decision: "block", rule: "B3", values: { remote: "origin" }, category: "other" },
];

if (linkCreated) {
  table.push({
    name: "B1c: symlink/junction escaping the project",
    given: input("rm -rf escape-link"),
    decision: "block",
    rule: "B1c",
    values: { target: "escape-link" },
    category: "B1",
    resolvesPaths: true,
  });
}

/** Assert decision, rule, values and the exact message for one case. */
function assertCase(testCase: Case): void {
  const result = evaluate(testCase.given);
  assert.equal(result.decision, testCase.decision, `${testCase.name}: decision`);
  assert.equal(result.rule, testCase.rule, `${testCase.name}: rule`);
  if (testCase.rule && testCase.values) {
    assert.deepEqual(result.message, getMessage(testCase.rule, testCase.values), `${testCase.name}: message`);
  } else if (testCase.decision === "allow") {
    assert.equal(result.message, undefined, `${testCase.name}: allow is silent`);
  }
  if (result.message) {
    assert.ok(!result.message.includes(MARKER), `${testCase.name}: marker leaked`);
    assert.ok(!result.message.includes(CLOUD_HOST), `${testCase.name}: host leaked`);
  }
}

test("D3: decisions, rules, values and messages are unchanged for every rule category", () => {
  for (const testCase of table) assertCase(testCase);
});

test("D3: non-B1 commands never reach the realpath filesystem work", () => {
  const native = fs.realpathSync.native;
  let calls = 0;
  fs.realpathSync.native = ((target: fs.PathLike, options?: Parameters<typeof fs.realpathSync.native>[1]) => {
    calls += 1;
    return native(target, options);
  }) as typeof fs.realpathSync.native;
  try {
    for (const testCase of table) {
      if (testCase.category === "B1") continue;
      calls = 0;
      evaluate(testCase.given);
      assert.equal(calls, 0, `${testCase.name}: unexpected realpath call`);
    }
  } finally {
    fs.realpathSync.native = native;
  }
});

test("D3: B1 commands still perform realpath work when the target needs resolving", () => {
  const native = fs.realpathSync.native;
  let calls = 0;
  fs.realpathSync.native = ((target: fs.PathLike, options?: Parameters<typeof fs.realpathSync.native>[1]) => {
    calls += 1;
    return native(target, options);
  }) as typeof fs.realpathSync.native;
  try {
    for (const testCase of table) {
      if (testCase.category !== "B1" || !testCase.resolvesPaths) continue;
      calls = 0;
      evaluate(testCase.given);
      assert.ok(calls > 0, `${testCase.name}: B1 path resolution was skipped`);
    }
  } finally {
    fs.realpathSync.native = native;
  }
});

test("D3: early-return B1 rules remain early returns without realpath calls", () => {
  const native = fs.realpathSync.native;
  let calls = 0;
  fs.realpathSync.native = ((target: fs.PathLike, options?: Parameters<typeof fs.realpathSync.native>[1]) => {
    calls += 1;
    return native(target, options);
  }) as typeof fs.realpathSync.native;
  try {
    for (const testCase of table) {
      if (testCase.category !== "B1" || testCase.resolvesPaths) continue;
      calls = 0;
      evaluate(testCase.given);
      assert.equal(calls, 0, `${testCase.name}: B1 early return should not resolve paths`);
      assertCase(testCase);
    }
  } finally {
    fs.realpathSync.native = native;
  }
});

test("D3: the syntactic gate is a fail-safe superset of B1 command spellings", () => {
  const b1Spellings = [
    "rm -rf dist",
    "RM -RF dist",
    "rimraf dist",
    "Remove-Item -Recurse dist",
    "ri -Recurse dist",
    "del -Recurse dist",
    "rmdir /s dist",
    "rd /s dist",
    "find . -name x -delete",
    '"/usr/bin/rm" -rf dist',
    // False positives are harmless: the exact classifier still decides.
    "sudo rm -rf dist",
    'echo "rm -rf /"',
  ];
  for (const spelling of b1Spellings) {
    assert.equal(mayBeRecursiveDelete(spelling), true, `gate must not skip: ${spelling}`);
  }
  for (const spelling of ["npm test", "git push --force", "psql -c 'DROP TABLE users'", "terraform apply -auto-approve", "git clean -fd"]) {
    assert.equal(mayBeRecursiveDelete(spelling), false, `gate should skip: ${spelling}`);
  }
});
