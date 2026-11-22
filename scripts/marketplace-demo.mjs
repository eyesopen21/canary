#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMP_PREFIX = "canary-marketplace-demo-";
const FIXTURES = ["clean", "trap-c1"];
const MAX_BUFFER = 1024 * 1024;

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function runCanary(args, cwd, env = {}) {
  const result = spawnSync(process.execPath, [path.join(ROOT, "bin", "canary.js"), ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") {
    throw new Error("Canary did not complete the local demo step.");
  }
  return result.stdout;
}

function readCrashSummary(text) {
  const without = [...text.matchAll(/^\s+Without Canary \(([^)]+)\)/gm)].map((match) => match[1]);
  const withCanary = [...text.matchAll(/^\s+With Canary \(([^)]+)\)/gm)].map((match) => match[1]);
  const labels = new Set(["real run", "simulation", "prevented"]);
  if (without.length !== 3 || withCanary.length !== 3
    || [...without, ...withCanary].some((label) => !labels.has(label))) {
    throw new Error("Canary returned an unexpected crash-test summary.");
  }
  return {
    realRuns: without.filter((label) => label === "real run").length,
    prevented: withCanary.filter((label) => label === "prevented").length,
    simulated: without.filter((label) => label === "simulation").length,
  };
}

function readScanSummary(text) {
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    throw new Error("Canary did not return a readable fixture summary.");
  }
  const summary = report?.summary;
  const score = report?.score;
  const counts = summary && [summary.critical, summary.high, summary.medium, summary.low];
  if (!Number.isInteger(score) || score < 0 || score > 100
    || !counts || counts.some((count) => !Number.isInteger(count) || count < 0)) {
    throw new Error("Canary returned an unexpected fixture summary.");
  }
  return { score, findings: counts.reduce((total, count) => total + count, 0) };
}

function textElement(x, y, value, color = "#d8e2ea", size = 15, weight = 400) {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}">${escapeXml(value)}</text>`;
}

function plural(count, singular) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function makeSvg(crash, scans) {
  const crashLine = `${crash.realRuns} contained demo ${crash.realRuns === 1 ? "operation" : "operations"} · ${plural(crash.prevented, "Canary block decision")} · ${plural(crash.simulated, "simulation")}`;
  const rows = [
    textElement(28, 62, "CANARY / LOCAL SAFETY PREVIEW", "#94c5e6", 13, 700),
    textElement(28, 98, "Guarded crash test", "#f4f7f9", 21, 700),
    textElement(28, 126, crashLine, "#b6c3cd", 14),
    textElement(28, 169, "Synthetic fixture scans", "#f4f7f9", 18, 700),
    textElement(28, 202, `clean  ·  score ${scans.clean.score}/100  ·  ${plural(scans.clean.findings, "finding")}`, "#b6c3cd", 14),
    textElement(28, 231, `trap   ·  score ${scans["trap-c1"].score}/100  ·  ${plural(scans["trap-c1"].findings, "finding")}`, "#b6c3cd", 14),
    textElement(28, 278, "Temp-only fixtures · no network · no credentials or command transcript", "#7fe0b0", 12, 600),
    textElement(28, 311, "Generated from local Canary output; sensitive details are omitted.", "#71808b", 11),
  ].join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="340" viewBox="0 0 760 340" role="img" aria-labelledby="title desc" font-family="ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace">
  <title id="title">Canary sanitized local demo</title>
  <desc id="desc">Summary of a guarded local crash test and synthetic fixture scans.</desc>
  <rect width="760" height="340" rx="16" fill="#101820"/>
  <rect x="1" y="1" width="758" height="338" rx="15" fill="none" stroke="#2c3d49"/>
  <circle cx="24" cy="24" r="5" fill="#fa7777"/><circle cx="43" cy="24" r="5" fill="#f3c969"/><circle cx="62" cy="24" r="5" fill="#6ed7a4"/>
  <path d="M20 44h720" stroke="#2c3d49"/>
  ${rows}
</svg>\n`;
}

async function createTempRoot() {
  const tempRoot = await realpath(os.tmpdir());
  const created = await mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  const root = await realpath(created);
  if (!path.basename(root).startsWith(TEMP_PREFIX) || !isInside(tempRoot, root)) {
    throw new Error("The OS temporary directory guard failed.");
  }
  return { root, tempRoot };
}

async function cleanupTempRoot(root, tempRoot) {
  const resolved = await realpath(root).catch(() => "");
  const currentTempRoot = await realpath(os.tmpdir()).catch(() => "");
  if (resolved !== root || currentTempRoot !== tempRoot
    || !path.basename(root).startsWith(TEMP_PREFIX) || !isInside(tempRoot, resolved)) return false;
  await rm(resolved, { recursive: true, force: true });
  return true;
}

async function main() {
  let temp;
  let result;
  try {
    temp = await createTempRoot();
    const crashOutput = runCanary(["crash-test"], ROOT);
    const crash = readCrashSummary(crashOutput);
    const scans = {};
    for (const fixture of FIXTURES) {
      const source = path.join(ROOT, "fixtures", fixture);
      const canonicalSource = await realpath(source);
      if (!isInside(ROOT, canonicalSource)) throw new Error("Fixture source guard failed.");
      const target = path.join(temp.root, "fixtures", fixture);
      const scanHome = path.join(temp.root, "scan-home", fixture);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(canonicalSource, target, { recursive: true, errorOnExist: true, force: false });
      await mkdir(scanHome, { recursive: true });
      const output = runCanary(["scan", "--json"], target, { CANARY_HOME: scanHome });
      scans[fixture] = readScanSummary(output);
    }
    result = { crash, scans };
  } catch {
    process.stderr.write("Demo could not finish safely; no raw output was retained.\n");
    process.exitCode = 1;
  }

  let cleaned = false;
  if (temp) cleaned = await cleanupTempRoot(temp.root, temp.tempRoot).catch(() => false);
  if (!cleaned) {
    process.stderr.write("Temporary fixture cleanup could not be confirmed; demo artifact was not updated.\n");
    process.exitCode = 1;
    return;
  }
  if (process.exitCode || !result) return;

  try {
    const artifact = path.join(ROOT, "docs", "marketplace-demo.svg");
    const docsRoot = await realpath(path.dirname(artifact));
    if (!isInside(ROOT, docsRoot)) throw new Error("Demo output guard failed.");
    await writeFile(artifact, makeSvg(result.crash, result.scans), { encoding: "utf8" });
    process.stdout.write("Wrote docs/marketplace-demo.svg\n");
  } catch {
    process.stderr.write("Demo could not write its repository-local SVG.\n");
    process.exitCode = 1;
  }
}

await main();
