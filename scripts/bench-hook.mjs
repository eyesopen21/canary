#!/usr/bin/env node

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const WARM_UP_RUNS = 5;
const MEASURED_RUNS = 50;
const ALLOW_COMMAND = "git status --short";
const BLOCK_COMMAND = "git push --force origin main";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE_EVALUATOR = path.join(ROOT, "dist", "core", "evaluate.js");
const { evaluate } = await import(pathToFileURL(CORE_EVALUATOR).href);
const { initAgent } = await import(pathToFileURL(path.join(ROOT, "src", "cli", "init.ts")).href);

const AGENTS = ["claude-code", "codex", "cursor", "gemini-cli", "opencode"];
const SENSITIVE_ENV_NAMES = new Set([
  "database_url", "postgres_url", "pghost", "mysql_host", "mongodb_uri", "mongo_url",
]);

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function generatedHook(root, agent) {
  if (agent === "claude-code" || agent === "codex" || agent === "gemini-cli") {
    const configPath = agent === "claude-code"
      ? ".claude/settings.json"
      : agent === "codex" ? ".codex/hooks.json" : ".gemini/settings.json";
    const eventName = agent === "claude-code" || agent === "codex" ? "PreToolUse" : "BeforeTool";
    const matcher = agent === "claude-code"
      ? "Bash|PowerShell"
      : agent === "codex" ? "^Bash$" : "run_shell_command";
    const config = readJson(root, configPath);
    const group = config.hooks[eventName].find((item) => item.matcher === matcher);
    const hook = group?.hooks?.find((item) => Array.isArray(item.args)
      ? item.args.includes("hook") && item.args.includes(agent)
      : typeof item.command === "string" && item.command.includes("hook") && item.command.includes(agent));
    if (!hook || typeof hook.command !== "string") throw new Error(`Generated ${agent} hook config was not found.`);
    if (Array.isArray(hook.args)) {
      return {
        command: hook.command,
        args: hook.args.map(String),
        commandDisplay: `${hook.command} ${hook.args.map((value) => JSON.stringify(String(value))).join(" ")}`,
      };
    }
    return { command: hook.command, shell: true, commandDisplay: hook.command };
  }

  if (agent === "cursor") {
    const config = readJson(root, ".cursor/hooks.json");
    const hook = config.hooks.preToolUse.find((item) => item.matcher === "Shell");
    if (!hook || typeof hook.command !== "string") throw new Error("Generated Cursor hook config was not found.");
    return { command: hook.command, shell: true, commandDisplay: hook.command };
  }

  const plugin = readFileSync(path.join(root, ".opencode", "plugins", "canary", "index.ts"), "utf8");
  const match = plugin.match(/execFileSync\(process\.execPath,\s*(\[[^\]]+\])/);
  if (!match) throw new Error("Generated OpenCode hook command was not found.");
  const args = JSON.parse(match[1]);
  return {
    command: process.execPath,
    args,
    commandDisplay: `process.execPath ${JSON.stringify(args)}`,
  };
}

function eventFor(agent, command, cwd) {
  switch (agent) {
    case "claude-code":
      return { tool_name: "Bash", tool_input: { command }, cwd, permission_mode: "default" };
    case "codex":
      return { tool_name: "Bash", tool_input: { command }, cwd };
    case "cursor":
      return {
        tool_name: "Shell",
        tool_input: { command, working_directory: cwd },
        cwd,
        workspace_roots: [cwd],
      };
    case "gemini-cli":
      return { tool_name: "run_shell_command", tool_input: { command, dir_path: cwd }, cwd };
    case "opencode":
      return { action: "shell", resources: command };
  }
}

function validateHookResult(agent, decision, stdout) {
  const output = stdout.trim();
  if (decision === "allow") {
    if (agent === "cursor") {
      if (JSON.parse(output).permission !== "allow") throw new Error("Cursor did not allow the synthetic allow event.");
    } else if (agent === "gemini-cli") {
      if (JSON.parse(output).decision !== undefined) throw new Error("Gemini CLI did not allow the synthetic allow event.");
    } else if (output !== "") {
      throw new Error(`${agent} unexpectedly emitted output for the synthetic allow event.`);
    }
    return;
  }

  const result = JSON.parse(output);
  const blocked = agent === "cursor"
    ? result.permission === "deny"
    : agent === "gemini-cli"
      ? result.decision === "deny"
      : agent === "opencode"
        ? result.effect === "deny"
        : result.hookSpecificOutput?.permissionDecision === "deny";
  if (!blocked) throw new Error(`${agent} did not block the synthetic B3 event.`);
}

function sanitizedEnvironment(cwd) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (SENSITIVE_ENV_NAMES.has(name.toLowerCase()) || name.toLowerCase() === "canary_dev") delete env[name];
  }
  env.CLAUDE_PROJECT_DIR = cwd;
  env.CURSOR_PROJECT_DIR = cwd;
  env.GEMINI_PROJECT_DIR = cwd;
  return env;
}

function run(command, options) {
  const { args = [], ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 15000,
    windowsHide: true,
    ...spawnOptions,
  });
  if (result.error) throw new Error(`Benchmark command failed: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`Benchmark command exited with status ${result.status ?? "unknown"}.`);
  }
  return result;
}

function linearPercentile(samples, fraction) {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarize(samples) {
  return {
    median: linearPercentile(samples, 0.5),
    p90: linearPercentile(samples, 0.9),
  };
}

function formatMs(value) {
  return value.toFixed(2);
}

function sample(label, runOnce, validate) {
  for (let index = 0; index < WARM_UP_RUNS; index += 1) validate(runOnce());
  const samples = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    const started = performance.now();
    const result = runOnce();
    samples.push(typeof result?.elapsed === "number" ? result.elapsed : performance.now() - started);
    validate(result);
  }
  return { label, ...summarize(samples) };
}

function printTable(headers, rows) {
  process.stdout.write(`| ${headers.join(" | ")} |\n`);
  process.stdout.write(`| ${headers.map(() => "---").join(" | ")} |\n`);
  for (const row of rows) process.stdout.write(`| ${row.join(" | ")} |\n`);
}

const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "canary-hook-bench-"));
try {
  if (!readFileSync(CORE_EVALUATOR, "utf8")) throw new Error("Built evaluator is empty.");

  const configurations = new Map();
  for (const agent of AGENTS) {
    const projectRoot = path.join(temporaryRoot, agent);
    mkdirSync(projectRoot);
    const write = process.stdout.write;
    process.stdout.write = () => true;
    try {
      initAgent(agent, projectRoot);
    } finally {
      process.stdout.write = write;
    }
    configurations.set(agent, { ...generatedHook(projectRoot, agent), cwd: projectRoot });
  }

  const environment = sanitizedEnvironment(temporaryRoot);
  const floor = sample(
    "node -e \"\"",
    () => run(process.execPath, { args: ["-e", ""], cwd: temporaryRoot, env: environment }),
    () => {},
  );

  const hookRows = [];
  for (const agent of AGENTS) {
    const config = configurations.get(agent);
    for (const [decision, command] of [["allow", ALLOW_COMMAND], ["B3", BLOCK_COMMAND]]) {
      const event = JSON.stringify(eventFor(agent, command, config.cwd));
      const result = sample(
        `${agent} ${decision}`,
        () => run(config.command, {
          args: config.args,
          cwd: config.cwd,
          env: sanitizedEnvironment(config.cwd),
          input: event,
          shell: config.shell,
        }),
        (child) => validateHookResult(agent, decision === "allow" ? "allow" : "block", child.stdout),
      );
      hookRows.push([
        agent,
        decision,
        `\`${config.command}\``,
        formatMs(result.median),
        formatMs(result.p90),
      ]);
    }
  }

  const evaluatorRows = [];
  for (const [decision, command] of [["allow", ALLOW_COMMAND], ["B3", BLOCK_COMMAND]]) {
    const input = {
      command,
      cwd: temporaryRoot,
      projectRoot: temporaryRoot,
      env: {},
    };
    const result = sample(
      `evaluate() ${decision}`,
      () => {
        const started = performance.now();
        const value = evaluate(input);
        return { value, elapsed: performance.now() - started };
      },
      ({ value }) => {
        const expected = decision === "allow" ? "allow" : "block";
        if (value.decision !== expected || (decision === "B3" && value.rule !== "B3")) {
          throw new Error(`evaluate() did not return the expected ${decision} decision.`);
        }
      },
    );
    // This timing intentionally excludes process startup, adapters, and JSON I/O.
    evaluatorRows.push([
      decision,
      formatMs(result.median),
      formatMs(result.p90),
    ]);
  }

  const cpu = os.cpus()[0]?.model ?? "unknown";
  const logicalProcessors = os.cpus().length;
  process.stdout.write("Canary hook benchmark\n");
  process.stdout.write(`Run: ${new Date().toISOString()}\n`);
  process.stdout.write(`OS: ${os.type()} ${os.release()} (${process.platform}, ${os.arch()})\n`);
  process.stdout.write(`CPU: ${cpu} (${logicalProcessors} logical processors)\n`);
  process.stdout.write(`Node: ${process.version}\n`);
  process.stdout.write("Implementation used by generated hooks and evaluate(): dist\n");
  process.stdout.write(`Samples per row: ${WARM_UP_RUNS} warm-up + ${MEASURED_RUNS} measured; percentiles use linear interpolation.\n\n`);

  process.stdout.write("Node startup floor\n");
  printTable(["Command", "Median (ms)", "P90 (ms)"], [[floor.label, formatMs(floor.median), formatMs(floor.p90)]]);
  process.stdout.write("\nConfigured hook command latency\n");
  printTable(["Agent", "Event", "Generated command", "Median (ms)", "P90 (ms)"], hookRows);
  process.stdout.write("\nIn-process evaluate() latency\n");
  printTable(["Event", "Median (ms)", "P90 (ms)"], evaluatorRows);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
