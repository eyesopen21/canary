/**
 * D2 prototype parity test.
 *
 * All hosts and credential-shaped values below are synthetic marker fixtures;
 * no real environment value, database URL, or credential host is used.
 *
 * The shortcut under test: `.env` / `.env.local` are filesystem reads, and the
 * evaluator performs them only after a segment is confirmed to have a
 * destructive database effect (a B2 prerequisite). For every other segment the
 * files are never opened.
 *
 * "Shortcut on" is the production `evaluate()` path with marker values stored
 * in the project's env files. "Shortcut off" is the same evaluation with the
 * identical host information supplied through the process env, which
 * `findHostSource` consults before files; no file read is then possible. If the
 * shortcut changed any decision or message, the two results would differ.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { EvaluationResult } from "../src/contract.ts";
import { evaluate } from "../src/core/evaluate.ts";
import { findEnvFileHostSource, findHostSource } from "../src/core/host.ts";
import { HOST_ARGUMENT } from "../src/core/messages.ts";
import type { EnvFileReader } from "../src/core/host.ts";

const MARKER = "SYNTHETIC-CANARY-D2-MARKER";
const MARKER_HOST = `${MARKER}.synthetic.invalid`;
const MARKER_URL = `postgresql://user:${MARKER}@${MARKER_HOST}:5432/app`;
const LOCAL_URL = "postgresql://user:password@localhost:5432/app";

interface Fixture {
  name: string;
  command: string;
  /** Marker env files created in the "shortcut on" project root. */
  files: Record<string, string>;
  /** Same host information supplied directly for the "shortcut off" run. */
  env: Record<string, string>;
  kind: "allow" | "warn" | "B1" | "B2" | "B3" | "B4";
  decision: EvaluationResult["decision"];
  rule?: EvaluationResult["rule"];
}

const fixtures: Fixture[] = [
  {
    name: "allow",
    kind: "allow",
    command: "npm test",
    files: { ".env": `DATABASE_URL=${MARKER_URL}\n`, ".env.local": `PGHOST=${MARKER_HOST}\n` },
    env: { DATABASE_URL: MARKER_URL, PGHOST: MARKER_HOST },
    decision: "allow",
  },
  {
    name: "warn W1",
    kind: "warn",
    command: "git push --force-with-lease origin main",
    files: { ".env": `DATABASE_URL=${MARKER_URL}\n` },
    env: { DATABASE_URL: MARKER_URL },
    decision: "warn",
    rule: "W1",
  },
  {
    name: "warn W2",
    kind: "warn",
    command: "git reset --hard",
    files: { ".env": `DATABASE_URL=${MARKER_URL}\n` },
    env: { DATABASE_URL: MARKER_URL },
    decision: "warn",
    rule: "W2",
  },
  {
    name: "warn W3",
    kind: "warn",
    command: "git clean -fd",
    files: { ".env.local": `PGHOST=${MARKER_HOST}\n` },
    env: { PGHOST: MARKER_HOST },
    decision: "warn",
    rule: "W3",
  },
  {
    name: "B1a",
    kind: "B1",
    command: 'rm -rf "$BUILD_DIR"',
    files: { ".env": `DATABASE_URL=${MARKER_URL}\n` },
    env: { DATABASE_URL: MARKER_URL },
    decision: "block",
    rule: "B1a",
  },
  {
    name: "B1c",
    kind: "B1",
    command: "rm -rf ../shared",
    files: { ".env": `DATABASE_URL=${MARKER_URL}\n` },
    env: { DATABASE_URL: MARKER_URL },
    decision: "block",
    rule: "B1c",
  },
  {
    name: "B2 from .env",
    kind: "B2",
    command: 'psql -c "DROP TABLE users"',
    files: { ".env": `DATABASE_URL=${MARKER_URL}\n` },
    env: { DATABASE_URL: MARKER_URL },
    decision: "block",
    rule: "B2",
  },
  {
    name: "B2 from .env.local",
    kind: "B2",
    command: "npx prisma migrate deploy",
    files: { ".env.local": `PGHOST=${MARKER_HOST}\n` },
    env: { PGHOST: MARKER_HOST },
    decision: "block",
    rule: "B2",
  },
  {
    name: "B2 local host from .env is allowed",
    kind: "B2",
    command: "npx prisma migrate deploy",
    files: { ".env": `DATABASE_URL=${LOCAL_URL}\n` },
    env: { DATABASE_URL: LOCAL_URL },
    decision: "allow",
  },
  {
    name: "B3",
    kind: "B3",
    command: "git push --force origin main",
    files: { ".env": `DATABASE_URL=${MARKER_URL}\n` },
    env: { DATABASE_URL: MARKER_URL },
    decision: "block",
    rule: "B3",
  },
  {
    name: "B4",
    kind: "B4",
    command: "terraform apply -auto-approve",
    files: { ".env": `DATABASE_URL=${MARKER_URL}\n` },
    env: { DATABASE_URL: MARKER_URL },
    decision: "block",
    rule: "B4",
  },
];

let roots: string[];

before(() => {
  roots = fixtures.map((fixture, index) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `canary-d2-${index}-`));
    for (const [file, contents] of Object.entries(fixture.files)) {
      fs.writeFileSync(path.join(root, file), contents, "utf8");
    }
    return root;
  });
});

after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/** Counts only env-file reads, leaving every other file access untouched. */
function evaluateAndCountEnvReads(
  root: string,
  command: string,
  env: Record<string, string>,
): { result: EvaluationResult; envReads: string[] } {
  const envReads: string[] = [];
  const original = fs.readFileSync;
  (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
    const name = path.basename(String(args[0]));
    if (name === ".env" || name === ".env.local") envReads.push(name);
    return Reflect.apply(original, fs, args);
  }) as typeof fs.readFileSync;
  try {
    const result = evaluate({ command, projectRoot: root, cwd: root, env });
    return { result, envReads };
  } finally {
    (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = original;
  }
}

function assertNoMarker(result: EvaluationResult): void {
  if (result.message) {
    assert.ok(!result.message.includes(MARKER), "message must not contain the synthetic marker");
    assert.ok(!result.message.includes(MARKER_HOST), "message must not contain the synthetic host");
  }
}

test("D2 parity: marker files and the equivalent process env yield identical results", () => {
  fixtures.forEach((fixture, index) => {
    const withShortcut = evaluateAndCountEnvReads(roots[index]!, fixture.command, {});
    // Shortcut off: the same host data is in the process env, so no file read
    // is needed to reproduce the unoptimized host resolution.
    const withoutShortcut = evaluateAndCountEnvReads(roots[index]!, fixture.command, fixture.env);

    assert.equal(withShortcut.result.decision, fixture.decision, `${fixture.name}: decision`);
    assert.equal(withShortcut.result.rule, fixture.rule, `${fixture.name}: rule`);
    assert.deepEqual(
      withShortcut.result,
      withoutShortcut.result,
      `${fixture.name}: shortcut must not change the result`,
    );
    assertNoMarker(withShortcut.result);

    const needsEnvFile = fixture.kind === "B2" && Object.keys(fixture.env).length > 0;
    assert.equal(
      withShortcut.envReads.length > 0,
      needsEnvFile,
      `${fixture.name}: env files read only for a B2 that relies on them`,
    );
    assert.deepEqual(withoutShortcut.envReads, [], `${fixture.name}: shortcut-off run reads no env file`);
  });
});

test("D2: env files are not opened for allow, warn, B1, B3, or B4", () => {
  const nonB2 = fixtures.filter((fixture) => fixture.kind !== "B2");
  assert.ok(nonB2.length >= 8, "representative non-B2 commands are covered");
  for (const fixture of nonB2) {
    const { envReads } = evaluateAndCountEnvReads(roots[fixtures.indexOf(fixture)]!, fixture.command, {});
    assert.deepEqual(envReads, [], `${fixture.name}: no env-file read`);
  }
});

test("D2: host resolution reads env files only after in-memory sources are exhausted", () => {
  const reads: string[] = [];
  const reader: EnvFileReader = (_root, file) => {
    reads.push(file);
    return file === ".env" ? { DATABASE_URL: MARKER_URL } : { PGHOST: MARKER_HOST };
  };

  const hostArg = findHostSource(
    ["psql", "--host", MARKER_HOST, "-c", "DROP TABLE users"],
    {},
    roots[6]!,
    reader,
  );
  assert.equal(hostArg?.variable, HOST_ARGUMENT, "explicit host wins");
  assert.deepEqual(reads, [], "no env-file read for an explicit --host");

  const processEnv = findHostSource(["psql", "-c", "DROP TABLE users"], { DATABASE_URL: MARKER_URL }, roots[6]!, reader);
  assert.equal(processEnv?.variable, "DATABASE_URL", "process env wins");
  assert.deepEqual(reads, [], "no env-file read when the process env has a host");

  reads.length = 0;
  const fromFile = findEnvFileHostSource(roots[6]!, reader);
  assert.equal(fromFile?.variable, "DATABASE_URL", ".env resolves the host");
  assert.deepEqual(reads, [".env"], ".env.local is not read once .env resolves the host");

  reads.length = 0;
  const emptyReader: EnvFileReader = (_root, file) => {
    reads.push(file);
    return file === ".env.local" ? { PGHOST: MARKER_HOST } : {};
  };
  const fromLocal = findHostSource(["psql", "-c", "DROP TABLE users"], {}, roots[6]!, emptyReader);
  assert.equal(fromLocal?.variable, "PGHOST", ".env.local resolves the host");
  assert.deepEqual(reads, [".env", ".env.local"], "both files are read in priority order when needed");
});
