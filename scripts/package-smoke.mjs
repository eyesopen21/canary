import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(workspace, "package.json"), "utf8"));
assert.equal(packageJson.dependencies, undefined, "package must stay dependency-free");
assert.equal(packageJson.optionalDependencies, undefined, "package must stay dependency-free");
assert.equal(packageJson.peerDependencies, undefined, "package must stay dependency-free");

const npmCli = process.env.npm_execpath;
assert.ok(npmCli && isAbsolute(npmCli), "run this smoke through npm so npm_execpath is available");
assert.ok(existsSync(npmCli), "npm CLI is unavailable");

const tempRoot = mkdtempSync(join(tmpdir(), "canary-package-smoke-"));
const prefix = join(tempRoot, "prefix");
const fixture = join(tempRoot, "fixture");
const isolatedHome = join(tempRoot, "home");
const npmConfig = join(tempRoot, "npmrc");
const npmGlobalConfig = join(tempRoot, "global-npmrc");
const npmCache = join(tempRoot, "npm-cache");
mkdirSync(prefix);
mkdirSync(fixture);
mkdirSync(isolatedHome);
mkdirSync(npmCache);
writeFileSync(npmConfig, "\n");
writeFileSync(npmGlobalConfig, "\n");

const tempResolved = realpathSync.native(resolve(tempRoot));
const tempBase = realpathSync.native(resolve(tmpdir()));
const tempRelation = relative(tempBase, tempResolved);
assert.ok(tempRelation && tempRelation !== "." && tempRelation !== ".." && !tempRelation.startsWith(`..${sep}`) && !isAbsolute(tempRelation),
  "temporary workspace must be a child of the OS temp directory");
assert.match(tempResolved, /canary-package-smoke-[^\\/]+$/i, "cleanup target must be a generated smoke directory");

const minimalEnv = {
  PATH: process.env.PATH ?? "",
  CANARY_HOME: isolatedHome,
  HOME: isolatedHome,
  USERPROFILE: isolatedHome,
  APPDATA: join(isolatedHome, "AppData", "Roaming"),
  LOCALAPPDATA: join(isolatedHome, "AppData", "Local"),
  NPM_CONFIG_USERCONFIG: npmConfig,
  NPM_CONFIG_GLOBALCONFIG: npmGlobalConfig,
  NPM_CONFIG_CACHE: npmCache,
};
for (const key of ["SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP"]) {
  if (process.env[key]) minimalEnv[key] = process.env[key];
}

function runNpm(args, label) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: workspace,
    encoding: "utf8",
    env: minimalEnv,
    timeout: 60_000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.error, undefined, `${label} could not start or timed out`);
  assert.equal(result.status, 0, `${label} failed`);
  return result.stdout;
}

try {
  cpSync(join(workspace, "fixtures", "clean"), fixture, { recursive: true });

  const packed = JSON.parse(runNpm([
    "pack", "--json", "--ignore-scripts", "--pack-destination", tempRoot,
  ], "npm pack"));
  assert.equal(packed.length, 1, "npm pack must produce one package");
  const tarball = join(tempRoot, packed[0].filename);
  assert.ok(existsSync(tarball), "npm pack did not create its tarball");

  runNpm([
    "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock",
    "--prefix", prefix, tarball,
  ], "offline package install");

  const installedPackage = join(prefix, "node_modules", "@eyesopen21", "canary");
  const executable = join(prefix, "node_modules", ".bin", process.platform === "win32" ? "canary.cmd" : "canary");
  const cliEntry = join(installedPackage, "bin", "canary.js");
  assert.ok(existsSync(executable), "npm executable shim is missing");
  assert.ok(existsSync(cliEntry), "installed CLI entry is missing");

  const scan = spawnSync(process.execPath, [cliEntry, "scan"], {
    cwd: fixture,
    encoding: "utf8",
    env: minimalEnv,
    timeout: 30_000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(scan.error, undefined, "installed canary scan could not start or timed out");
  assert.equal(scan.status, 0, "installed canary scan did not exit successfully");

  const findings = JSON.parse(readFileSync(join(fixture, "canary", "findings.json"), "utf8"));
  assert.deepEqual(findings.findings, [], "fresh clean fixture must have no findings");
} finally {
  const cleanupPath = realpathSync.native(resolve(tempRoot));
  assert.equal(cleanupPath, tempResolved, "refusing cleanup if the temporary target changed");
  const cleanupBase = realpathSync.native(resolve(tmpdir()));
  assert.equal(cleanupBase, tempBase, "refusing cleanup if the OS temp directory changed");
  const cleanupRelation = relative(cleanupBase, cleanupPath);
  assert.ok(cleanupRelation && cleanupRelation !== "." && cleanupRelation !== ".." && !cleanupRelation.startsWith(`..${sep}`) && !isAbsolute(cleanupRelation),
    "refusing cleanup outside the OS temp directory");
  assert.match(cleanupPath, /canary-package-smoke-[^\\/]+$/i, "refusing unexpected cleanup target");
  rmSync(cleanupPath, { recursive: true, force: true });
}
