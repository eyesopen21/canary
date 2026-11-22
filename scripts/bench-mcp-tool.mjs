import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { performance } from "node:perf_hooks";

const WARM_UP_RUNS = 5;
const MEASURED_RUNS = 50;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "canary.js");
const commands = ["git status --short", "git push --force origin main", "echo canary-bench"];
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "canary-mcp-bench-"));

function percentile(samples, p) {
  const sorted = [...samples].sort((a, b) => a - b);
  return Number(sorted[Math.ceil(p * sorted.length) - 1].toFixed(3));
}

function eventFor(command) {
  return { tool_name: "Bash", tool_input: { command }, cwd: tempRoot, permission_mode: "default" };
}

function measureCommandHook(command) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [BIN, "hook", "--agent", "claude-code"], {
    cwd: tempRoot,
    input: JSON.stringify(eventFor(command)),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error("Command-hook benchmark invocation failed.");
  return performance.now() - started;
}

async function startMcpServer() {
  const started = performance.now();
  const child = spawn(process.execPath, [BIN, "mcp-server"], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let id = 0;
  const reader = (async () => {
    for await (const line of lines) {
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      const resolve = pending.get(message.id);
      if (resolve) {
        pending.delete(message.id);
        resolve(message);
      }
    }
    for (const resolve of pending.values()) resolve({ error: { message: "MCP server closed." } });
    pending.clear();
  })();

  function rpc(method, params) {
    const requestId = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("MCP benchmark request timed out."));
      }, 5000);
      pending.set(requestId, (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error("MCP benchmark request failed."));
        else resolve(message.result);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n");
    });
  }

  const init = await rpc("initialize", {
    protocolVersion: "2026-07-28",
    capabilities: {},
    clientInfo: { name: "canary-benchmark", version: "0.1.0" },
  });
  if (init?.protocolVersion !== "2026-07-28") throw new Error("MCP protocol negotiation failed.");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  return {
    child,
    reader,
    rpc,
    startupMs: performance.now() - started,
    async call(command) {
      const startedAt = performance.now();
      const result = await rpc("tools/call", {
        name: "canary_pre_tool_use",
        arguments: {
          agent: "claude-code",
          tool_name: "Bash",
          command,
          cwd: tempRoot,
        },
      });
      if (result?.isError) throw new Error("MCP tool benchmark invocation failed.");
      return performance.now() - startedAt;
    },
    async close() {
      child.stdin.end();
      await Promise.race([
        reader,
        new Promise((resolve) => setTimeout(() => {
          if (!child.killed) child.kill();
          resolve(undefined);
        }, 2000)),
      ]);
    },
  };
}

try {
  for (let index = 0; index < WARM_UP_RUNS; index += 1) measureCommandHook(commands[index % commands.length]);
  const commandHookMs = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    commandHookMs.push(measureCommandHook(commands[index % commands.length]));
  }

  const mcp = await startMcpServer();
  try {
    for (let index = 0; index < WARM_UP_RUNS; index += 1) await mcp.call(commands[index % commands.length]);
    const mcpToolMs = [];
    for (let index = 0; index < MEASURED_RUNS; index += 1) {
      mcpToolMs.push(await mcp.call(commands[index % commands.length]));
    }
    process.stdout.write(JSON.stringify({
      benchmark: "canary command hook versus persistent stdio MCP tool",
      platform: process.platform,
      node: process.version,
      measuredCallsPerMode: MEASURED_RUNS,
      warmupCallsPerMode: WARM_UP_RUNS,
      commandHook: {
        processStarts: MEASURED_RUNS + WARM_UP_RUNS,
        medianMs: percentile(commandHookMs, 0.5),
        p95Ms: percentile(commandHookMs, 0.95),
      },
      mcpTool: {
        serverProcessStarts: 1,
        callsOnThatProcess: MEASURED_RUNS + WARM_UP_RUNS,
        coldStartAndInitializeMs: Number(mcp.startupMs.toFixed(3)),
        medianCallMs: percentile(mcpToolMs, 0.5),
        p95CallMs: percentile(mcpToolMs, 0.95),
      },
    }, null, 2) + "\n");
  } finally {
    await mcp.close();
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
