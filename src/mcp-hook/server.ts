import { createClaudeCodeAdapter } from "../adapters/claude-code.ts";
import { createCodexAdapter } from "../adapters/codex.ts";
import { hookEvaluator } from "../cli/hook.ts";

const PROTOCOL_VERSIONS = new Set(["2026-07-28", "2025-11-25", "2025-06-18"]);
const MAX_FRAME_CHARS = 1_048_576;
const MAX_COMMAND_CHARS = 32_768;
const MAX_CWD_CHARS = 4_096;

type JsonRpcId = string | number | null;
type JsonObject = Record<string, unknown>;

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    agent: { type: "string", enum: ["claude-code", "codex"] },
    tool_name: { type: "string", description: "The documented agent tool name (Bash or PowerShell)." },
    command: { type: "string", maxLength: MAX_COMMAND_CHARS },
    cwd: { type: "string", maxLength: MAX_CWD_CHARS },
  },
  required: ["agent", "tool_name", "command", "cwd"],
  additionalProperties: false,
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function send(message: JsonObject): void {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function sendError(id: JsonRpcId, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function inputError(value: unknown): string | undefined {
  if (!isObject(value)) return "Canary could not evaluate this hook event.";
  if (value.agent !== "claude-code" && value.agent !== "codex") return "Canary could not evaluate this hook event.";
  const validTool = value.agent === "claude-code"
    ? value.tool_name === "Bash" || value.tool_name === "PowerShell"
    : value.tool_name === "Bash";
  if (!validTool || typeof value.command !== "string" || value.command.length === 0
    || value.command.length > MAX_COMMAND_CHARS || typeof value.cwd !== "string"
    || value.cwd.length === 0 || value.cwd.length > MAX_CWD_CHARS
    || Object.keys(value).some((key) => !["agent", "tool_name", "command", "cwd"].includes(key))) {
    return "Canary could not evaluate this hook event.";
  }
  return undefined;
}

function evaluateTool(args: unknown): JsonObject {
  const invalid = inputError(args);
  if (invalid) return { resultType: "complete", content: [{ type: "text", text: invalid }], isError: true };

  const input = args as {
    agent: "claude-code" | "codex";
    tool_name: "Bash" | "PowerShell";
    command: string;
    cwd: string;
  };
  const event = {
    tool_name: input.tool_name,
    tool_input: { command: input.command },
    cwd: input.cwd,
  };
  const evaluator = hookEvaluator();
  const output = input.agent === "claude-code"
    ? createClaudeCodeAdapter(evaluator)(event)
    : createCodexAdapter(evaluator)(event);

  // Hook consumers parse text content like command-hook stdout. An empty JSON
  // object represents allow without approving past the agent's permission gate.
  // Adapter messages contain the policy decision only; the input is never echoed.
  return {
    resultType: "complete",
    content: [{ type: "text", text: output ? JSON.stringify(output) : "{}" }],
    isError: false,
  };
}

function handle(request: unknown, initialized: { value: boolean }): void {
  if (!isObject(request) || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    sendError(null, -32600, "Invalid Request");
    return;
  }
  const id = request.id;
  const hasId = typeof id === "string" || typeof id === "number" || id === null;
  const params = isObject(request.params) ? request.params : {};

  if (request.method === "notifications/initialized") {
    initialized.value = true;
    return;
  }
  if (!hasId) return;

  if (request.method === "initialize") {
    const requested = params.protocolVersion;
    const protocolVersion = typeof requested === "string" && PROTOCOL_VERSIONS.has(requested)
      ? requested
      : "2026-07-28";
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "canary", version: "0.1.0" },
      },
    });
    return;
  }
  if (request.method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (request.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        resultType: "complete",
        tools: [{
          name: "canary_pre_tool_use",
          title: "Canary pre-tool-use policy",
          description: "Evaluate an untrusted shell command using Canary's deterministic policy. "
            + "Command text may contain credentials; this server never echoes or logs tool input.",
          inputSchema: INPUT_SCHEMA,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        }],
      },
    });
    return;
  }
  if (request.method === "tools/call") {
    const name = params.name;
    if (name !== "canary_pre_tool_use") {
      sendError(id, -32602, "Unknown Canary tool.");
      return;
    }
    send({ jsonrpc: "2.0", id, result: evaluateTool(params.arguments) });
    return;
  }

  sendError(id, -32601, "Method not found.");
}

/** Run the prototype MCP endpoint over line-delimited JSON-RPC on stdio. */
export function runMcpServer(): void {
  let buffer = "";
  const initialized = { value: false };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    if (buffer.length > MAX_FRAME_CHARS && !buffer.includes("\n")) {
      buffer = "";
      sendError(null, -32700, "Message too large.");
      return;
    }
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        if (line.length > MAX_FRAME_CHARS) {
          sendError(null, -32700, "Message too large.");
        } else {
          try {
            handle(JSON.parse(line), initialized);
          } catch {
            sendError(null, -32700, "Invalid JSON-RPC message.");
          }
        }
      }
      newline = buffer.indexOf("\n");
    }
  });
}
