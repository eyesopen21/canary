/**
 * CAN-T-06 / ADR-0004 confirmation tests.
 *
 * The crash test runs under an in-process write watcher and a network
 * tripwire. A second set of tests points a target outside the temporary
 * directory and checks that the guard refuses it and the scenario falls back
 * to a clearly labeled simulation. External commands are intercepted by a
 * spy runner wherever a real destructive command is not needed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { promises as fsp } from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { TEMP_PREFIX, runCrashTest } from "../src/crash-test/index.ts";
import { isStrictlyInside } from "../src/crash-test/guards.ts";
import { FAKE_DATABASE_URL } from "../src/crash-test/scenarios.ts";
import type { CommandRunner, CommandSpec, CrashTestReport } from "../src/crash-test/index.ts";

interface WriteRecord {
  op: string;
  target: string;
}

const SYNC_WRITES = [
  "writeFileSync",
  "appendFileSync",
  "mkdirSync",
  "mkdtempSync",
  "rmSync",
  "rmdirSync",
  "unlinkSync",
  "renameSync",
  "copyFileSync",
  "symlinkSync",
  "linkSync",
  "truncateSync",
  "createWriteStream",
];
const ASYNC_WRITES = [
  "writeFile",
  "appendFile",
  "mkdir",
  "mkdtemp",
  "rm",
  "rmdir",
  "unlink",
  "rename",
  "copyFile",
  "symlink",
  "link",
  "truncate",
];
const PROMISE_WRITES = [
  "writeFile",
  "appendFile",
  "mkdir",
  "mkdtemp",
  "rm",
  "rmdir",
  "unlink",
  "rename",
  "copyFile",
  "symlink",
  "link",
];

type Patchable = Record<string, unknown>;

// The ESM namespace of a built-in is read-only. The CommonJS exports object is
// mutable and is the very same object behind `import { promises } from "node:fs"`.
const requireCjs = createRequire(import.meta.url);
const cjsFs = requireCjs("node:fs") as Patchable;
const cjsPromises = cjsFs.promises as Patchable;

function installWriteWatcher(): { records: WriteRecord[]; restore: () => void } {
  const records: WriteRecord[] = [];
  const originals: Array<{ obj: Patchable; key: string; value: unknown }> = [];

  const patch = (obj: Patchable, key: string): void => {
    const original = obj[key];
    if (typeof original !== "function") return;
    originals.push({ obj, key, value: original });
    obj[key] = function (this: unknown, ...args: unknown[]): unknown {
      if (args.length > 0) {
        records.push({ op: key, target: path.resolve(String(args[0])) });
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  };

  for (const key of SYNC_WRITES) patch(cjsFs, key);
  for (const key of ASYNC_WRITES) patch(cjsFs, key);
  for (const key of PROMISE_WRITES) patch(cjsPromises, key);

  return {
    records,
    restore: () => {
      for (const entry of originals.reverse()) entry.obj[entry.key] = entry.value;
    },
  };
}

function installNetworkTripwire(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const originals: Array<() => void> = [];

  const wrap = (obj: Patchable, key: string, label: string): void => {
    const original = obj[key];
    if (typeof original !== "function") return;
    originals.push(() => {
      obj[key] = original;
    });
    obj[key] = function (this: unknown, ...args: unknown[]): unknown {
      calls.push(label);
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  };

  wrap(net.Socket.prototype as unknown as Patchable, "connect", "net.Socket.connect");
  wrap(requireCjs("node:dns") as Patchable, "lookup", "dns.lookup");
  wrap(requireCjs("node:http") as Patchable, "request", "http.request");
  wrap(requireCjs("node:https") as Patchable, "request", "https.request");
  wrap(globalThis as unknown as Patchable, "fetch", "fetch");

  return {
    calls,
    restore: () => {
      for (const undo of originals.reverse()) undo();
    },
  };
}

function assertWritesInside(records: WriteRecord[], root: string): void {
  assert.ok(records.length > 0, "the write watcher observed no writes at all");
  const mkdtempPrefix = path.join(os.tmpdir(), TEMP_PREFIX);
  for (const record of records) {
    if (
      (record.op === "mkdtemp" || record.op === "mkdtempSync") &&
      record.target.startsWith(mkdtempPrefix)
    ) {
      continue;
    }
    assert.ok(
      record.target === root || isStrictlyInside(root, record.target),
      `write outside the temporary directory by ${record.op}`,
    );
  }
}

function snapshotTree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const hash = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
        out.set(path.relative(dir, full), hash);
      }
    }
  };
  walk(dir);
  return out;
}

function spyRunner(recorded: CommandSpec[]): CommandRunner {
  let rev = 0;
  return (spec) => {
    recorded.push(spec);
    // Emulate just enough of `git init` for the realpath guards to find a
    // target. No destructive command is executed by the spy.
    if (spec.args[0] === "init") {
      const target = spec.args[spec.args.length - 1];
      if (target) fs.mkdirSync(target, { recursive: true });
    }
    return {
      ok: true,
      stdout: spec.args.includes("rev-parse") ? `synthetic-ref-${(rev += 1)}` : undefined,
    };
  };
}

function assertMinimalEnvironment(specs: CommandSpec[], root: string): void {
  assert.ok(specs.length > 0, "no child commands were observed");
  for (const spec of specs) {
    assert.ok(isStrictlyInside(root, spec.cwd), "command cwd is outside the temporary directory");
    assert.equal(spec.file, process.platform === "win32" ? "git.exe" : "git");
    assert.equal(spec.env.HOME, spec.env.USERPROFILE);
    assert.ok(spec.env.HOME && isStrictlyInside(root, spec.env.HOME));
    assert.equal(spec.env.DATABASE_URL, undefined);
    assert.equal(spec.env.GIT_TERMINAL_PROMPT, "0");
    assert.ok((spec.env.PATH ?? "").split(path.delimiter).filter(Boolean).length <= 4);
    for (const name of Object.keys(spec.env)) {
      assert.doesNotMatch(name, /DATABASE|PASSWORD|SECRET|TOKEN|API_?KEY|AWS|CREDENTIAL/i);
    }
  }
}

test("CAN-T-06: crash test writes only inside its fresh temporary directory", async () => {
  const cwd = process.cwd();
  const before = snapshotTree(cwd);
  const watcher = installWriteWatcher();
  const network = installNetworkTripwire();
  const specs: CommandSpec[] = [];
  const guardChecks: Array<[string, boolean]> = [];
  let root: string | undefined;
  let report: CrashTestReport | undefined;

  try {
    report = await runCrashTest({
      onTempRoot: (value) => {
        root = value;
      },
      onGuardCheck: (phase, ok) => guardChecks.push([phase, ok]),
      commandRunner: spyRunner(specs),
    });
  } finally {
    network.restore();
    watcher.restore();
  }

  assert.ok(root, "the temporary root was not created");
  assert.ok(report, "no report was produced");
  assert.ok(path.basename(root).startsWith(TEMP_PREFIX));
  assert.ok(isStrictlyInside(await fsp.realpath(os.tmpdir()), root));

  assertWritesInside(watcher.records, root);
  assert.deepEqual(snapshotTree(cwd), before, "a file changed outside the temporary directory");
  assert.deepEqual(network.calls, [], "the crash test attempted a network operation");
  assert.ok(guardChecks.some(([phase]) => phase === "build"));
  assert.ok(guardChecks.some(([phase]) => phase === "run"));
  assertMinimalEnvironment(specs, root);

  assert.deepEqual(report.scenarios.map((item) => item.id), ["delete", "database", "force-push"]);
  for (const scenario of report.scenarios) {
    assert.equal(scenario.withCanary.decision, "block");
    assert.equal(scenario.withCanary.label, "prevented");
    assert.match(scenario.withCanary.message ?? "", /^Canary blocked /);
  }
  assert.equal(report.scenarios[0].withoutCanary.label, "real run");
  assert.equal(report.scenarios[0].withoutCanary.artifactsRemoved, 3);
  assert.equal(report.scenarios[1].withoutCanary.reason, "DATABASE_SIMULATED_BY_DESIGN");
  assert.equal(report.scenarios[2].withoutCanary.label, "real run");
  assert.deepEqual(report.simulatedScenarios, ["database"]);
  assert.equal(report.cleanup, "cleaned");
  assert.equal(fs.existsSync(root), false);

  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes(FAKE_DATABASE_URL));
  assert.ok(!serialized.includes(root));
});

test("negative guard: a target outside the temporary directory falls back to simulation", async () => {
  const outsideTarget = path.join(process.cwd(), "AGENTS.md");
  const before = snapshotTree(process.cwd());
  const watcher = installWriteWatcher();
  let root: string | undefined;
  let report: CrashTestReport | undefined;

  try {
    report = await runCrashTest({
      targetOverrides: { delete: outsideTarget },
      onTempRoot: (value) => {
        root = value;
      },
      commandRunner: spyRunner([]),
    });
  } finally {
    watcher.restore();
  }

  assert.ok(root);
  assert.ok(report);
  const del = report.scenarios.find((item) => item.id === "delete");
  assert.ok(del);
  assert.equal(del.withoutCanary.simulated, true);
  assert.equal(del.withoutCanary.reason, "GUARD_OUTSIDE_TEMP");
  assert.equal(del.withoutCanary.artifactsRemoved, undefined);
  assert.equal(del.withCanary.decision, "block");
  assertWritesInside(watcher.records, root);
  assert.deepEqual(snapshotTree(process.cwd()), before);
  assert.ok(report.simulatedScenarios.includes("delete"));
});

test("negative guard: a symlink or junction target fails the second realpath check", async () => {
  const outside = process.cwd();
  const linkType = process.platform === "win32" ? "junction" : "dir";
  const watcher = installWriteWatcher();
  const guardChecks: Array<[string, boolean]> = [];
  let root: string | undefined;
  let report: CrashTestReport | undefined;

  try {
    report = await runCrashTest({
      onTempRoot: (value) => {
        root = value;
      },
      onGuardCheck: (phase, ok) => guardChecks.push([phase, ok]),
      onScenarioPrepared: (id, phase, info) => {
        if (id === "delete" && phase === "without") {
          fs.rmSync(info.target, { recursive: true, force: true });
          fs.symlinkSync(outside, info.target, linkType);
        }
      },
      commandRunner: spyRunner([]),
    });
  } finally {
    watcher.restore();
  }

  assert.ok(root);
  assert.ok(report);
  const del = report.scenarios.find((item) => item.id === "delete");
  assert.ok(del);
  assert.equal(del.withoutCanary.simulated, true);
  assert.equal(del.withoutCanary.reason, "GUARD_OUTSIDE_TEMP");
  assert.ok(
    guardChecks.some(([phase, ok]) => phase === "run" && ok === false),
    "the pre-execution guard did not reject the link",
  );
  assertWritesInside(watcher.records, root);
  assert.equal(report.cleanup, "cleaned");
  assert.equal(fs.existsSync(root), false);
  assert.equal(fs.existsSync(outside), true);
});

test("forceSimulation labels every scenario as a simulation and runs no command", async () => {
  const specs: CommandSpec[] = [];
  const report = await runCrashTest({
    forceSimulation: true,
    commandRunner: spyRunner(specs),
  });
  assert.deepEqual(report.simulatedScenarios, ["delete", "database", "force-push"]);
  for (const scenario of report.scenarios) {
    assert.equal(scenario.withoutCanary.simulated, true);
    assert.equal(scenario.withoutCanary.reason, "FORCED");
    assert.equal(scenario.withCanary.decision, "block");
  }
  assert.deepEqual(specs, []);
});

test("the force-push scenario really runs against a bare repository in the temporary directory", async (t) => {
  const git = process.platform === "win32" ? "git.exe" : "git";
  if (spawnSync(git, ["--version"], { stdio: "ignore" }).status !== 0) {
    t.skip("git is not installed");
    return;
  }

  const before = snapshotTree(process.cwd());
  const watcher = installWriteWatcher();
  let root: string | undefined;
  let report: CrashTestReport | undefined;
  try {
    report = await runCrashTest({
      onTempRoot: (value) => {
        root = value;
      },
    });
  } finally {
    watcher.restore();
  }

  assert.ok(root);
  assert.ok(report);
  const push = report.scenarios.find((item) => item.id === "force-push");
  assert.ok(push);
  assert.equal(push.withoutCanary.label, "real run");
  assert.equal(push.withoutCanary.remoteRefChanged, true);
  assertWritesInside(watcher.records, root);
  assert.deepEqual(snapshotTree(process.cwd()), before);
  assert.equal(report.cleanup, "cleaned");
});
