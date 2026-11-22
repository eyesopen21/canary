import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckFinding } from "../src/contract.ts";
import { checkDatabase } from "../src/core/checks/database.ts";
import { checkCredentials } from "../src/core/checks/credentials.ts";
import { checkDeletes } from "../src/core/checks/deletes.ts";

const ROOT = process.cwd();
const LEAK_TOKENS = [
  "CANARY_SYNTHETIC_MARKER_7f3a",
  "db.prod.example.internal",
  "test.db.example.net",
  "preview.db.example.org",
  "AKIAEXAMPLE7F3AKEYXX",
  "sk_live_CANARY7F3A51MULATED",
];

function fixture(...parts: string[]): string {
  return join(ROOT, "fixtures", ...parts);
}

function tempBase(): string {
  return process.env.TEMP || process.env.TMPDIR || process.env.TMP || ".";
}

function tuple(finding: CheckFinding): string {
  return [
    finding.check,
    finding.rule,
    finding.severity,
    finding.path,
    finding.line === null ? "null" : String(finding.line),
  ].join("|");
}

function summary(findings: CheckFinding[]): string[] {
  return findings.map(tuple).sort();
}

function assertNoLeak(findings: CheckFinding[], home?: string): void {
  const text = JSON.stringify(findings);
  for (const token of LEAK_TOKENS) {
    assert.equal(text.includes(token), false, `output leaked a synthetic secret: ${token}`);
  }
  assert.equal(text.includes(ROOT), false, "output leaked an absolute repository path");
  assert.equal(/[A-Za-z]:\\Users\\/.test(text), false, "output leaked a Windows home path");
  if (home) {
    assert.equal(text.includes(home), false, "output leaked the injected home path");
  }
  for (const finding of findings) {
    assert.ok(finding.danger.length > 0, "danger must be populated");
    assert.ok(finding.consequence.length > 0, "consequence must be populated");
    assert.ok(finding.fix === null || typeof finding.fix === "string");
    assert.ok(finding.manual === null || typeof finding.manual === "string");
  }
}

function assertStable(
  actual: CheckFinding[],
  check: (root: string) => CheckFinding[],
  root: string,
): void {
  assert.deepEqual(check(root), actual, "two runs must give identical findings");
  assert.equal(new Set(actual.map((finding) => finding.id)).size, actual.length, "ids must be unique");
}

function withHome<T>(home: string, run: () => T): T {
  const previous = process.env.CANARY_HOME;
  process.env.CANARY_HOME = home;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.CANARY_HOME;
    else process.env.CANARY_HOME = previous;
  }
}

test("C1 trap: exactly three non-local database findings, all critical", () => {
  const root = fixture("trap-c1");
  const findings = checkDatabase(root);

  assert.deepEqual(summary(findings), [
    "C1|non-local-test-database|critical|.env.test|1",
    "C1|non-local-test-database|critical|config/preview.json|2",
    "C1|non-local-test-database|critical|package.json|4",
  ]);
  assertNoLeak(findings);
  assertStable(findings, checkDatabase, root);
});

test("C2 trap: credential patterns, tracked .env and home presence only", () => {
  const base = mkdtempSync(join(tempBase(), "canary-c2-"));
  const root = join(base, "repo");
  cpSync(fixture("trap-c2", "repo"), root, { recursive: true });
  writeFileSync(join(root, "ignored.env"), "API_KEY=CANARY_SYNTHETIC_MARKER_7f3a_ignored\n");
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  // Git's index is authoritative even when a tracked file matches .gitignore.
  execFileSync("git", ["add", "-f", "ignored.env"], { cwd: root });
  // This secret-shaped file is present in the worktree, but not in the index.
  writeFileSync(join(root, ".env.untracked"), "API_KEY=CANARY_SYNTHETIC_MARKER_7f3a_untracked\n");
  const home = fixture("trap-c2", "home");

  try {
    withHome(home, () => {
      const findings = checkCredentials(root);

      assert.deepEqual(summary(findings), [
        "C2|aws-access-key-id|high|config/deploy.env|2",
        "C2|generic-secret|high|.env|2",
        "C2|generic-secret|high|ignored.env|1",
        "C2|home-credential|high|~/.aws/credentials|null",
        "C2|home-credential|high|~/.config/gcloud|null",
        "C2|home-credential|high|~/.kube/config|null",
        "C2|home-credential|high|~/.netrc|null",
        "C2|home-credential|high|~/.pgpass|null",
        "C2|payment-key|critical|config/deploy.env|3",
        "C2|private-key|critical|keys/private.pem|1",
        "C2|tracked-env-file|high|.env|null",
      ]);
      assertNoLeak(findings, home);
      assertStable(findings, checkCredentials, root);

      for (const finding of findings.filter((item) => item.rule === "home-credential")) {
        assert.ok(finding.path.startsWith("~/"), "home findings must use ~ paths");
        assert.equal(finding.fix, null);
      }
    });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("C3 trap: unguarded deletes and missing set -u", () => {
  const base = mkdtempSync(join(tempBase(), "canary-wp03-"));
  const root = join(base, "repo");
  cpSync(fixture("trap-c3"), root, { recursive: true });
  try {
    const findings = checkDeletes(root);

    assert.deepEqual(summary(findings), [
      "C3|missing-set-u|high|scripts/clean.sh|null",
      "C3|recursive-delete-unguarded-target|high|Makefile|2",
      "C3|recursive-delete-unguarded-target|high|package.json|4",
      "C3|recursive-delete-unguarded-target|high|scripts/clean.sh|2",
      "C3|recursive-delete-unguarded-target|high|scripts/remove.ps1|1",
    ]);
    assertNoLeak(findings);
    assertStable(findings, checkDeletes, root);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("C3 trap: an escaping junction or symlink is reported", (t) => {
  const base = mkdtempSync(join(tempBase(), "canary-c3-escape-"));
  const root = join(base, "repo");
  const outside = join(base, "outside");
  const link = join(root, "escape-link");
  cpSync(fixture("trap-c3"), root, { recursive: true });
  mkdirSync(outside, { recursive: true });

  try {
    try {
      symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      // Some restricted Windows runners deny link creation. Skip only this
      // link-specific case; the fixture assertions above still run everywhere.
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        t.skip("environment denied junction/symlink creation with EPERM");
        return;
      }
      throw error;
    }

    const findings = checkDeletes(root);
    assert.ok(summary(findings).includes("C3|link-escapes-repo|high|escape-link|null"));
    assertNoLeak(findings);
    assertStable(findings, checkDeletes, root);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("C3 trap: an in-repository junction or symlink is not reported as escaping", (t) => {
  const base = mkdtempSync(join(tempBase(), "canary-c3-internal-"));
  const root = join(base, "repo");
  const link = join(root, "internal-link");
  cpSync(fixture("trap-c3"), root, { recursive: true });

  try {
    try {
      symlinkSync(join(root, "scripts"), link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        t.skip("environment denied junction/symlink creation with EPERM");
        return;
      }
      throw error;
    }

    const findings = checkDeletes(root);
    assert.equal(summary(findings).some((item) => item.startsWith("C3|link-escapes-repo|")), false);
    assertNoLeak(findings);
    assertStable(findings, checkDeletes, root);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("clean fixture: C1, C2 and C3 report nothing", () => {
  const root = fixture("clean");
  const home = fixture("clean", "home");

  withHome(home, () => {
    for (const check of [checkDatabase, checkCredentials, checkDeletes]) {
      const findings = check(root);
      assert.deepEqual(findings, [], `${check.name} must not report the clean fixture`);
      assertNoLeak(findings, home);
    }
  });
});
