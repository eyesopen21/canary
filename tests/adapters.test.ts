/**
 * WP-02 adapter contract tests (CAN-T-04, CAN-I-03, CAN-I-05..07, CAN-C-03).
 *
 * The core from WP-01 is not wired yet: every adapter gets a fake Evaluator
 * injected, exactly as it will in production. Tests use synthetic events from
 * docs/specs/agent-adapters.md and validate the documented output fields.
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { EvaluationInput, EvaluationResult, Evaluator } from "../src/contract.ts";
import {
  CLAUDE_CODE_FAIL_CLOSED,
  CLAUDE_FIELD_LIMIT,
  CURSOR_FAIL_CLOSED,
  FAIL_OPEN_NOTICE,
  HOOK_EXIT_CODE,
  createClaudeCodeAdapter,
  createCodexAdapter,
  createCursorAdapter,
  createGeminiCliAdapter,
  createOpenCodeAdapter,
  toStdout,
  type CursorEvent,
  type CursorWarnLogEntry,
} from "../src/adapters/index.ts";

const BLOCK: EvaluationResult = {
  decision: "block",
  rule: "B1a",
  message: "CANARY: blocked irreversible command.",
};
const WARN: EvaluationResult = {
  decision: "warn",
  rule: "W1",
  message: "CANARY: review this command.",
};
const ALLOW: EvaluationResult = { decision: "allow" };
const SYNTHETIC_MARKER = "SYNTHETIC-DO-NOT-USE-9f3c";

function fakeEvaluator(result: EvaluationResult) {
  const calls: EvaluationInput[] = [];
  const evaluator: Evaluator = (input) => {
    calls.push(input);
    return result;
  };
  return { evaluator, calls };
}

// ---------------------------------------------------------------- Claude Code

test("Claude Code block: documented fields, exit 0, identical messages", () => {
  const { evaluator, calls } = fakeEvaluator(BLOCK);
  const output = createClaudeCodeAdapter(evaluator)({
    tool_name: "Bash",
    tool_input: { command: "git push --force" },
    cwd: "/work",
    permission_mode: "default",
  });

  assert.equal(HOOK_EXIT_CODE, 0);
  assert.deepEqual(calls, [{ command: "git push --force", cwd: "/work" }]);
  assert.equal(output?.systemMessage, BLOCK.message);
  assert.deepEqual(output?.hookSpecificOutput, {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: BLOCK.message,
  });
  assert.equal(output?.hookSpecificOutput.permissionDecisionReason, output?.systemMessage);
  assert.equal("additionalContext" in (output?.hookSpecificOutput ?? {}), false);
  assert.doesNotMatch(toStdout(output), /allow/);
});

test("Claude Code warn: additionalContext and systemMessage, no permissionDecision", () => {
  const { evaluator } = fakeEvaluator(WARN);
  const output = createClaudeCodeAdapter(evaluator)({
    tool_name: "PowerShell",
    tool_input: { command: "Remove-Item -Recurse target" },
  });

  assert.deepEqual(output, {
    systemMessage: WARN.message,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: WARN.message,
    },
  });
  assert.equal("permissionDecision" in (output?.hookSpecificOutput ?? {}), false);
});

test("Claude Code allow: no stdout and never an explicit allow", () => {
  const { evaluator } = fakeEvaluator(ALLOW);
  const output = createClaudeCodeAdapter(evaluator)({
    tool_input: { command: "ls" },
  });
  assert.equal(output, null);
  assert.equal(toStdout(output), "");
});

test("Claude Code: long messages are truncated at the end with an ellipsis", () => {
  const long = "x".repeat(CLAUDE_FIELD_LIMIT + 50);
  const { evaluator } = fakeEvaluator({ decision: "block", message: long });
  const output = createClaudeCodeAdapter(evaluator)({
    tool_input: { command: "git push --force" },
  });
  assert.equal(output?.systemMessage.length, CLAUDE_FIELD_LIMIT);
  assert.equal(output?.systemMessage.endsWith("…"), true);
  assert.equal(output?.hookSpecificOutput.permissionDecisionReason, output?.systemMessage);
});

// ---------------------------------------------------------------------- Codex

test("Codex block: same shape as Claude Code", () => {
  const { evaluator, calls } = fakeEvaluator(BLOCK);
  const output = createCodexAdapter(evaluator)({
    tool_name: "Bash",
    tool_input: { command: "git push --force" },
    cwd: "/work",
  });

  assert.deepEqual(calls, [{ command: "git push --force", cwd: "/work" }]);
  assert.deepEqual(output, {
    systemMessage: BLOCK.message,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: BLOCK.message,
    },
  });
});

test("Codex warn: no field that marks the hook run as failed", () => {
  const { evaluator } = fakeEvaluator(WARN);
  const output = createCodexAdapter(evaluator)({
    tool_input: { command: "rm -rf dir" },
  });
  const stdout = toStdout(output);

  assert.deepEqual(output, {
    systemMessage: WARN.message,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: WARN.message,
    },
  });
  for (const forbidden of ["ask", "approve", "continue", "stopReason", "suppressOutput"]) {
    assert.doesNotMatch(stdout, new RegExp(forbidden));
  }
});

test("Codex allow: no stdout and no explicit allow", () => {
  const { evaluator } = fakeEvaluator(ALLOW);
  assert.equal(createCodexAdapter(evaluator)({ tool_input: { command: "ls" } }), null);
});

// --------------------------------------------------------------------- Cursor

test("Cursor block: deny with the same message for user and agent", () => {
  const { evaluator, calls } = fakeEvaluator(BLOCK);
  const output = createCursorAdapter(evaluator)({
    tool_name: "Shell",
    tool_input: { command: "git push --force", working_directory: "/work" },
    workspace_roots: ["/work"],
  });

  assert.deepEqual(calls, [{ command: "git push --force", cwd: "/work" }]);
  assert.deepEqual(output, {
    permission: "deny",
    user_message: BLOCK.message,
    agent_message: BLOCK.message,
  });
  assert.deepEqual(JSON.parse(toStdout(output)), output);
});

test("Cursor warn: allow plus a local log containing only rule and decision", () => {
  const { evaluator } = fakeEvaluator(WARN);
  const entries: CursorWarnLogEntry[] = [];
  const output = createCursorAdapter(evaluator, {
    logWarn: (entry) => entries.push(entry),
  })({ tool_input: { command: "rm -rf dir" } });

  assert.deepEqual(output, { permission: "allow" });
  assert.deepEqual(entries, [{ decision: "warn", rule: "W1" }]);
  assert.doesNotMatch(toStdout(output), /CANARY:/);
});

test("Cursor: user_email is never read or stored", () => {
  let emailReads = 0;
  const { evaluator } = fakeEvaluator(BLOCK);
  const event: CursorEvent & { user_email: string } = {
    tool_name: "Shell",
    tool_input: { command: "git push --force" },
    get user_email() {
      emailReads += 1;
      return `victim@${SYNTHETIC_MARKER}.test`;
    },
  };

  const output = createCursorAdapter(evaluator)(event);
  assert.equal(emailReads, 0);
  assert.doesNotMatch(toStdout(output), /user_email|victim|SYNTHETIC/);
});

// ----------------------------------------------------------------- Gemini CLI

test("Gemini CLI block: one JSON object on stdout with deny, reason, systemMessage", () => {
  const { evaluator, calls } = fakeEvaluator(BLOCK);
  const output = createGeminiCliAdapter(evaluator)({
    tool_name: "run_shell_command",
    tool_input: { command: "git push --force", dir_path: "/work" },
  });
  const stdout = toStdout(output);

  assert.deepEqual(calls, [{ command: "git push --force", cwd: "/work" }]);
  assert.deepEqual(output, {
    decision: "deny",
    reason: BLOCK.message,
    systemMessage: BLOCK.message,
  });
  assert.equal(stdout.split("\n").length, 1);
  assert.deepEqual(JSON.parse(stdout), output);
});

test("Gemini CLI warn and allow: no explicit allow decision", () => {
  const warnAdapter = createGeminiCliAdapter(fakeEvaluator(WARN).evaluator);
  const allowAdapter = createGeminiCliAdapter(fakeEvaluator(ALLOW).evaluator);
  const event = { tool_input: { command: "ls" } };

  assert.deepEqual(warnAdapter(event), { systemMessage: WARN.message });
  assert.deepEqual(allowAdapter(event), {});
  assert.doesNotMatch(toStdout(allowAdapter(event)), /allow/);
});

test("Gemini CLI: diagnostics go to stderr, stdout stays one valid JSON object", () => {
  const diagnostics: string[] = [];
  const failing: Evaluator = (input) => {
    throw new Error(`leak ${input.command} ${SYNTHETIC_MARKER}`);
  };
  const output = createGeminiCliAdapter(failing, {
    diagnostics: (message) => diagnostics.push(message),
  })({
    tool_input: { command: `rm -rf ${SYNTHETIC_MARKER}` },
  });

  assert.equal(diagnostics.length, 1);
  assert.doesNotMatch(diagnostics[0], new RegExp(SYNTHETIC_MARKER));
  assert.deepEqual(JSON.parse(toStdout(output)), {});
});

// ------------------------------------------------------------------- OpenCode

test("OpenCode block: effect deny and message, never allow", () => {
  const { evaluator, calls } = fakeEvaluator(BLOCK);
  const event = {
    action: "shell",
    resources: ["git push --force", "rm -rf dir"],
  };
  const result = createOpenCodeAdapter(evaluator)(event, { projectRoot: "/repo" });

  assert.deepEqual(calls, [
    { command: "git push --force\nrm -rf dir", projectRoot: "/repo" },
  ]);
  assert.equal(result.effect, "deny");
  assert.equal(result.message, BLOCK.message);
});

test("OpenCode warn: effect ask, never allow", () => {
  const { evaluator } = fakeEvaluator(WARN);
  const result = createOpenCodeAdapter(evaluator)({
    action: "shell",
    resources: "rm -rf dir",
  });

  assert.equal(result.effect, "ask");
  assert.equal(result.message, WARN.message);
  assert.notEqual(result.effect, "allow");
});

test("OpenCode allow and non-shell events leave effect untouched", () => {
  const allow = createOpenCodeAdapter(fakeEvaluator(ALLOW).evaluator)({
    action: "shell",
    resources: "ls",
  });
  assert.equal(allow.effect, undefined);
  assert.equal("message" in allow, false);

  const nonShell = createOpenCodeAdapter(fakeEvaluator(BLOCK).evaluator)({
    action: "read",
    resources: "file",
  });
  assert.deepEqual(nonShell, { action: "read", resources: "file" });
});

// ----------------------------------------------------------- Cross-adapter rules

test("No adapter emits an explicit allow where the agent would treat it as approval", () => {
  const event = { tool_input: { command: "ls" } };
  const claude = createClaudeCodeAdapter(fakeEvaluator(ALLOW).evaluator)(event);
  const codex = createCodexAdapter(fakeEvaluator(ALLOW).evaluator)(event);
  const gemini = createGeminiCliAdapter(fakeEvaluator(ALLOW).evaluator)(event);
  const opencode = createOpenCodeAdapter(fakeEvaluator(ALLOW).evaluator)({
    action: "shell",
    resources: "ls",
  });

  // Claude Code and Codex: empty stdout, no permissionDecision at all.
  for (const output of [claude, codex]) {
    assert.equal(output, null);
    assert.equal(toStdout(output), "");
  }
  // Gemini CLI: a valid object with no `decision` key.
  assert.deepEqual(gemini, {});
  assert.equal("decision" in gemini, false);
  // OpenCode: the effect is not overwritten to "allow".
  assert.notEqual(opencode.effect, "allow");

  // Cursor's `permission: "allow"` IS its documented allow/warn format [S9];
  // it is the one agent where an explicit allow does not skip a prompt here.
  const cursor = createCursorAdapter(fakeEvaluator(ALLOW).evaluator)(event);
  assert.deepEqual(cursor, { permission: "allow" });
});

test("Fail-closed constants match the documented snippets", () => {
  assert.deepEqual(CLAUDE_CODE_FAIL_CLOSED, { onFailure: "block" });
  assert.deepEqual(CURSOR_FAIL_CLOSED, { failClosed: true });
  for (const agent of ["codex", "gemini-cli", "opencode"] as const) {
    assert.match(FAIL_OPEN_NOTICE[agent], /hook failure|unverified/);
  }
});
