import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(workspace, "package.json"), "utf8"));
assert.equal(packageJson.dependencies, undefined, "package must stay dependency-free");
assert.equal(packageJson.optionalDependencies, undefined, "package must stay dependency-free");

const tempRoot = mkdtempSync(join(tmpdir(), "canary-package-smoke-"));
const prefix = join(tempRoot, "prefix");
const fixture = join(tempRoot, "fixture");
const isolatedHome = join(tempRoot, "home");
mkdirSync(prefix);
mkdirSync(fixture);
mkdirSync(isolatedHome);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function runNpm(args, label) {
  const result = spawnSync(npm, args, {
    cwd: workspace,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.error, undefined, `${label} could not start`);
  assert.equal(result.status, 0, `${label} failed`);
  return result.stdout;
}

try {
  const packed = JSON.parse(runNpm([
    "pack", "--json", "--ignore-scripts", "--pack-destination", tempRoot,
  ], "npm pack"));
  assert.equal(packed.length, 1, "npm pack must produce one package");
  const tarball = join(tempRoot, packed[0].filename);

  runNpm([
    "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund",
    "--prefix", prefix, tarball,
  ], "offline package install");

  const executable = join(prefix, "node_modules", ".bin", "canary");
  const scan = spawnSync(executable, ["scan"], {
    cwd: fixture,
    encoding: "utf8",
    env: { ...process.env, CANARY_HOME: isolatedHome },
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(scan.error, undefined, "installed canary executable could not start");
  assert.equal(scan.status, 0, "installed canary scan did not exit successfully");

  const findings = JSON.parse(readFileSync(join(fixture, "canary", "findings.json"), "utf8"));
  assert.deepEqual(findings.findings, [], "fresh clean fixture must have no findings");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
