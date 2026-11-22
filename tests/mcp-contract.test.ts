/**
 * Synthetic LOCAL harness contract tests for the opt-in MCP tool prototype.
 *
 * These tests are NOT live-agent behavior. They drive the built prototype over
 * its own stdio JSON-RPC endpoint from this test process, using synthetic
 * marker fixtures only. They verify what the prototype itself does: input
 * validation, first-call behavior on a fresh process, protocol errors, and
 * result sanitization (ADR-0003).
 *
 * They CANNOT verify a Claude Code or Codex session: host fail-open/block
 * behavior, connection lifetime, first-command timing, and whether the model
 * can call the tool directly are outside this harness and remain Open in
 * docs/open-questions.md [Q21][Q23][Q26]. No live agent session was run.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "canary.js");
const TOOL = "canary_pre_tool_use";

// Synthetic fixtures only. `.invalid` is a reserved TLD; no real host or value.
const MARKER = "CANARY_SYNTHETIC_MARKER_7f3a";
const ENV_MARKER = "CANARY_SYNTHETIC_ENV_9f3c";
const HOST = `${MARKER}.synthetic.invalid`;
const DB_URL = `postgresql://synthetic:${ENV_MARKER}@${HOST}:5432/app`;
const GENERIC_INPUT_ERROR = "Canary could not evaluate this hook event.";

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

interface Waiter {
  resolve: (message: JsonRpcMessage) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface Session {
  rpc(method: string, params: unknown, id?: number): Promise<JsonRpcMessage>;
  notify(method: string, params: unknown): void;
  requestLine(line: string): Promise<JsonRpcMessage>;
  end(): void;
  close(): Promise<void>;
  lines: string[];
}

/** Start one fresh prototype process and speak line-delimited JSON-RPC to it. */
function startServer(): Promise<Session> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, "mcp-server"], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      // Synthetic values only; they are never printed, logged or committed.
      env: { ...process.env, DATABASE_URL: DB_URL, PGHOST: HOST },
    });

    child.once("error", (error) => {
      reject(new Error("Synthetic harness could not start the prototype server: " + error.message));
    });

    let exitedResolve!: () => void;
    const exited = new Promise<void>((done) => { exitedResolve = done; });
    child.once("exit", () => exitedResolve());

    const lines: string[] = [];
    const waiters: Waiter[] = [];
    const reader = createInterface({ input: child.stdout });
    reader.on("line", (line) => {
      lines.push(line);
      const waiter = waiters.shift();
      if (!waiter) return;
      clearTimeout(waiter.timer);
      try {
        waiter.resolve(JSON.parse(line) as JsonRpcMessage);
      } catch {
        waiter.reject(new Error("Prototype server emitted a non-JSON line."));
      }
    });
    reader.on("close", () => {
      while (waiters.length) {
        const waiter = waiters.shift()!;
        clearTimeout(waiter.timer);
        waiter.reject(new Error("Prototype server closed before answering."));
      }
    });

    function requestLine(line: string): Promise<JsonRpcMessage> {
      return new Promise((resolveRequest, rejectRequest) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.timer === timer);
          if (index >= 0) waiters.splice(index, 1);
          rejectRequest(new Error("Synthetic harness request timed out."));
        }, 5000);
        waiters.push({ resolve: resolveRequest, reject: rejectRequest, timer });
        child.stdin.write(line + "\n");
      });
    }

    let id = 0;
    resolve({
      lines,
      requestLine,
      async rpc(method, params, requestId = ++id) {
        return requestLine(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }));
      },
      notify(method, params) {
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
      },
      end() {
        if (!child.stdin.writableEnded) child.stdin.end();
      },
      async close() {
        if (!child.stdin.writableEnded) child.stdin.end();
        const timer = setTimeout(() => { if (!child.killed) child.kill(); }, 2000);
        await exited;
        clearTimeout(timer);
        reader.close();
      },
    });
  });
}

function callArgs(command: string): Record<string, unknown> {
  return { agent: "claude-code", tool_name: "Bash", command, cwd: ROOT };
}

function textOf(message: JsonRpcMessage): string {
  const content = message.result?.content as Array<{ type: string; text: string }> | undefined;
  assert.ok(Array.isArray(content) && content.length > 0, "result must carry text content");
  return content[0].text;
}

// -------------------------------------------------------------- first call

test("synthetic harness: a fresh server negotiates initialize and serves its first tools/call", async () => {
  const session = await startServer();
  try {
    const init = await session.rpc("initialize", {
      protocolVersion: "2026-07-28",
      capabilities: {},
      clientInfo: { name: "synthetic-harness", version: "0.1.0" },
    });
    assert.equal(init.result?.protocolVersion, "2026-07-28");
    assert.deepEqual(init.result?.capabilities, { tools: { listChanged: false } });

    session.notify("notifications/initialized", {});
    const first = await session.rpc("tools/call", { name: TOOL, arguments: callArgs("git status --short") });
    assert.equal(first.error, undefined);
    assert.equal(first.result?.resultType, "complete");
    assert.equal(first.result?.isError, false);
    assert.deepEqual(JSON.parse(textOf(first)), {}); // allow: empty JSON object
  } finally {
    await session.close();
  }
});

test("synthetic harness: a fresh server serves tools/call without notifications/initialized [Q26]", async () => {
  const session = await startServer();
  try {
    await session.rpc("initialize", { protocolVersion: "2026-07-28", capabilities: {} });
    // Deliberately omit notifications/initialized.
    const result = await session.rpc("tools/call", { name: TOOL, arguments: callArgs("git status --short") });
    assert.equal(result.error, undefined);
    assert.equal(result.result?.isError, false);
  } finally {
    await session.close();
  }
});

test("synthetic harness: initialize echoes three accepted versions and defaults an unknown one [Q26]", async () => {
  for (const requested of ["2026-07-28", "2025-11-25", "2025-06-18", "1900-01-01"]) {
    const session = await startServer();
    try {
      const reply = await session.rpc("initialize", { protocolVersion: requested, capabilities: {} });
      assert.equal(reply.result?.protocolVersion, requested === "1900-01-01" ? "2026-07-28" : requested);
    } finally {
      await session.close();
    }
  }
  // This is legacy initialize-based negotiation. The catalogued 2026-07-28
  // revision uses per-request `_meta`, server/discover and -32022 errors [S5].
});

// -------------------------------------------------------------- Q22: inputs

test("synthetic harness: tools/list exposes exactly four input fields and rejects extra fields [Q22]", async () => {
  const session = await startServer();
  try {
    const listed = await session.rpc("tools/list", {});
    assert.equal(listed.result?.resultType, "complete");
    const tools = listed.result?.tools as Array<Record<string, any>>;
    assert.equal(tools.length, 1);
    const tool = tools[0];
    assert.equal(tool.name, TOOL);
    assert.deepEqual(Object.keys(tool.inputSchema.properties).sort(), ["agent", "command", "cwd", "tool_name"]);
    assert.deepEqual(tool.inputSchema.required, ["agent", "tool_name", "command", "cwd"]);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(tool.inputSchema.properties.agent.enum, ["claude-code", "codex"]);
    assert.equal(tool.inputSchema.properties.command.maxLength, 32768);
    assert.equal(tool.inputSchema.properties.cwd.maxLength, 4096);

    // A field that is not in the schema is rejected, not silently forwarded.
    const extra = await session.rpc("tools/call", {
      name: TOOL,
      arguments: { ...callArgs("git status --short"), env: { TOKEN: MARKER }, session_id: MARKER },
    });
    assert.equal(extra.result?.isError, true);
    assert.equal(textOf(extra), GENERIC_INPUT_ERROR);
    assert.equal(session.lines.join("\n").includes(MARKER), false);
  } finally {
    await session.close();
  }
});

test("synthetic harness: malformed tool arguments return a generic isError result without echoing input", async (t) => {
  const valid = callArgs("git status --short");
  const cases: Array<{ name: string; args: Record<string, unknown> }> = [
    { name: "missing command", args: { agent: "claude-code", tool_name: "Bash", cwd: ROOT } },
    { name: "empty command", args: { ...valid, command: "" } },
    { name: "non-string command", args: { ...valid, command: 42 } },
    { name: "unknown agent", args: { ...valid, agent: "other" } },
    { name: "PowerShell on Codex", args: { ...valid, agent: "codex", tool_name: "PowerShell" } },
    { name: "unsupported tool_name", args: { ...valid, tool_name: "Write" } },
    { name: "missing cwd", args: { agent: "claude-code", tool_name: "Bash", command: "git status" } },
    { name: "empty cwd", args: { ...valid, cwd: "" } },
    { name: "oversized command", args: { ...valid, command: "a".repeat(32769) } },
    { name: "oversized cwd", args: { ...valid, cwd: "a".repeat(4097) } },
    { name: "extra secret-bearing field", args: { ...valid, [MARKER]: ENV_MARKER } },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const session = await startServer();
      try {
        const reply = await session.rpc("tools/call", { name: TOOL, arguments: item.args });
        assert.equal(reply.error, undefined);
        assert.equal(reply.result?.isError, true);
        assert.equal(textOf(reply), GENERIC_INPUT_ERROR);
        assert.equal(session.lines.join("\n").includes(MARKER), false);
        assert.equal(session.lines.join("\n").includes(ENV_MARKER), false);
      } finally {
        await session.close();
      }
    });
  }
});

test("synthetic harness: malformed JSON-RPC uses fixed generic error messages", async (t) => {
  const cases: Array<{ name: string; line: string; code: number }> = [
    { name: "invalid JSON", line: `{"jsonrpc":"2.0","id":1,"method":"${MARKER}"`, code: -32700 },
    { name: "missing jsonrpc", line: JSON.stringify({ id: 2, method: "tools/list" }), code: -32600 },
    { name: "unknown method", line: JSON.stringify({ jsonrpc: "2.0", id: 3, method: MARKER }), code: -32601 },
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      const session = await startServer();
      try {
        const reply = await session.requestLine(item.line);
        assert.equal(reply.error?.code, item.code);
        assert.equal(session.lines.join("\n").includes(MARKER), false);
      } finally {
        await session.close();
      }
    });
  }
});

test("synthetic harness: an unavailable tool name yields a protocol error, not a verdict [Q21]", async () => {
  const session = await startServer();
  try {
    const reply = await session.rpc("tools/call", { name: "not_a_canary_tool", arguments: callArgs("git status") });
    assert.equal(reply.error?.code, -32602);
    assert.equal(reply.error?.message, "Unknown Canary tool.");
    assert.equal(reply.result, undefined);
    assert.equal(session.lines.join("\n").includes(MARKER), false);
    // Host-level behavior (Claude Code waits/blocks, Codex fails open) is NOT
    // reproducible here; only this tool-level error path is covered.
  } finally {
    await session.close();
  }
});

// --------------------------------------------------------- ADR-0003 results

test("synthetic harness: results carry decision text only, never command, env value or host [ADR-0003]", async (t) => {
  const scenarios: Array<{ name: string; command: string; expected: string }> = [
    {
      name: "force push with a synthetic credential in the command",
      command: `git push --force origin main --token=${MARKER}`,
      expected: "Canary blocked a force push.",
    },
    {
      name: "destructive database command with a synthetic DATABASE_URL",
      command: `psql -c "DROP TABLE users" --note=${MARKER}`,
      expected: "Canary blocked a destructive database command.",
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const session = await startServer();
      try {
        const reply = await session.rpc("tools/call", { name: TOOL, arguments: callArgs(scenario.command) });
        assert.equal(reply.result?.isError, false);
        const text = textOf(reply);
        // The adapter JSON envelope wraps the message; check the decision text.
        assert.equal(text.includes(scenario.expected), true);
        for (const forbidden of [MARKER, ENV_MARKER, HOST, DB_URL, scenario.command]) {
          assert.equal(text.includes(forbidden), false, `result echoed ${forbidden.slice(0, 24)}`);
        }
        // The raw envelope must not leak either, including stderr-independent paths.
        const raw = session.lines.join("\n");
        for (const forbidden of [MARKER, ENV_MARKER, HOST, DB_URL]) {
          assert.equal(raw.includes(forbidden), false);
        }
      } finally {
        await session.close();
      }
    });
  }
});

test("synthetic harness: a block result may name a sanitized git remote but no synthetic secret [Q22]", async () => {
  const session = await startServer();
  try {
    const reply = await session.rpc("tools/call", { name: TOOL, arguments: callArgs("git push --force origin main") });
    const text = textOf(reply);
    assert.equal(text.includes("Canary blocked a force push."), true);
    // The one command-derived fragment ADR-0003 permits is a sanitized name.
    assert.equal(text.includes("`origin`"), true);
    assert.equal(text.includes("git push --force origin main"), false);
    assert.equal(text.includes(MARKER), false);
  } finally {
    await session.close();
  }
});

// --------------------------------------------------------------- disconnect

test("synthetic harness: ending the client stream produces no further verdict", async () => {
  const session = await startServer();
  try {
    await session.rpc("initialize", { protocolVersion: "2026-07-28", capabilities: {} });
    const before = session.lines.length;
    session.end();
    await session.close();
    assert.equal(session.lines.length, before);
  } finally {
    await session.close();
  }
});
