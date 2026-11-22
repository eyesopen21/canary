/**
 * CAN-T-03 / CAN-T-04 exercised against the shipped, self-contained hook
 * bundles at `dist/hook/<agent>.mjs`.
 *
 * scripts/build.mjs inlines the whole runtime into each bundle: the entry
 * reads one JSON event from stdin and prints the adapter's decision to stdout.
 * Nothing here goes through the `hook --agent` CLI dispatcher or the adapter
 * index. The command cases are the ones from tests/policy.test.ts, and the
 * expected text is transcribed from docs/specs/policy.md (#examples and
 * #message-text). Agent wire fields follow docs/specs/agent-adapters.md and
 * are cited in docs/sources.md as [S1][S8][S9][S11][S14].
 *
 * Every host and identity value below is a synthetic marker fixture: no real
 * secret, credential, database URL or environment value is used or printed.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const AGENTS = ["claude-code", "codex", "cursor", "gemini-cli", "opencode"] as const;
type Agent = (typeof AGENTS)[number];

const FACTORY: Record<Agent, string> = {
  "claude-code": "createClaudeCodeAdapter",
  codex: "createCodexAdapter",
  cursor: "createCursorAdapter",
  "gemini-cli": "createGeminiCliAdapter",
  opencode: "createOpenCodeAdapter",
};

const root = fileURLToPath(new URL("..", import.meta.url));
const bundlePath = (agent: Agent): string => join(root, "dist", "hook", `${agent}.mjs`);

const MARKER = "SYNTHETIC-CANARY-MARKER";
const CLOUD_HOST = `${MARKER}.synthetic.invalid`;
const USER_EMAIL = `synthetic-${MARKER}@example.invalid`;

// Exact canonical strings from docs/specs/policy.md#message-text.
const B1A_TARGET = '`"$BUILD_DIR"`';
const MESSAGE = {
  B1a: `Canary blocked a recursive delete. Danger: the target ${B1A_TARGET} contains a variable or command substitution that Canary cannot resolve before it runs. Consequence: if it expands to an empty or wrong path, the command deletes files outside the intended folder, and they cannot be restored from this machine. Instead: use a literal path inside the project.`,
  B1c: "Canary blocked a recursive delete. Danger: `../shared` resolves to a path outside the project root, directly or through a link. Consequence: the command deletes files that are not part of this project, and they cannot be restored from this machine. Instead: delete only paths inside the project.",
  B2: "Canary blocked a destructive database command. Danger: `PGHOST` points to a non-local host, which may be production. Consequence: this command RESETS the database schema, and the data cannot be recovered from this machine. Instead: point `PGHOST` to a local database, or ask a human to run this command.",
  B3: "Canary blocked a force push. Danger: this push rewrites history on `origin`. Consequence: commits that exist only on `origin` are lost for everyone who uses it. Instead: push without forcing, or ask a human to approve a force push.",
  B4: "Canary blocked an infrastructure change without review. Danger: terraform apply with -auto-approve applies changes without showing the plan for approval. Consequence: it can destroy or replace live infrastructure, and deleted resources may not be recoverable. Instead: run terraform plan and let a human review and apply it.",
  W1: "Canary warning. Danger: --force-with-lease still overwrites commits on the remote that your local copy has fetched but not merged. Consequence: those commits are lost for everyone who uses the remote. Use it only on a branch nobody else pushes to.",
} as const;

let tempRoot: string;

before(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "canary-bundles-"));
});

after(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

function withProject<T>(run: (projectRoot: string) => T): T {
  const projectRoot = mkdtempSync(join(tempRoot, "project-"));
  mkdirSync(join(projectRoot, "dist"), { recursive: true });
  try {
    return run(projectRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

function runBundle(
  agent: Agent,
  projectRoot: string,
  event: Record<string, unknown>,
  extraEnv: Record<string, string> = {},
) {
  // Deliberately minimal: the child gets no inherited credential or database
  // variables. The three project-dir variables point at a temporary cwd so the
  // B1 checks resolve inside it (docs/specs/policy.md#project-root).
  const env: NodeJS.ProcessEnv = {
    CLAUDE_PROJECT_DIR: projectRoot,
    CURSOR_PROJECT_DIR: projectRoot,
    GEMINI_PROJECT_DIR: projectRoot,
    HOME: tempRoot,
    USERPROFILE: tempRoot,
    ...extraEnv,
  };
  for (const name of ["SystemRoot", "WINDIR", "PATHEXT"]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return spawnSync(process.execPath, [bundlePath(agent)], {
    cwd: projectRoot,
    env,
    input: JSON.stringify(event),
    encoding: "utf8",
    timeout: 30_000,
  });
}

/** Event shapes from tests/cli.test.ts and scripts/bench-hook.mjs eventFor(). */
function eventFor(agent: Agent, command: string, projectRoot: string): Record<string, unknown> {
  switch (agent) {
    case "claude-code":
      return { tool_name: "Bash", tool_input: { command }, cwd: projectRoot, permission_mode: "default" };
    case "codex":
      return { tool_name: "Bash", tool_input: { command }, cwd: projectRoot };
    case "cursor":
      return {
        tool_name: "Shell",
        tool_input: { command, working_directory: projectRoot },
        cwd: projectRoot,
        workspace_roots: [projectRoot],
        user_email: USER_EMAIL, // deliberately supplied: the adapter must not read it [S9]
      };
    case "gemini-cli":
      return { tool_name: "run_shell_command", tool_input: { command, dir_path: projectRoot }, cwd: projectRoot };
    case "opencode":
      return { action: "shell", resources: command };
  }
}

interface Observed {
  decision: "allow" | "warn" | "block";
  message?: string;
}

/** Translate a bundle's stdout into a decision/message using its documented fields. */
function observe(agent: Agent, stdout: string, label: string): Observed {
  switch (agent) {
    case "claude-code":
    case "codex": {
      if (stdout === "") return { decision: "allow" };
      const output = JSON.parse(stdout);
      const hook = output.hookSpecificOutput;
      assert.equal(hook.hookEventName, "PreToolUse", `${label}: hookEventName`);
      if (hook.permissionDecision === "deny") {
        assert.equal(output.systemMessage, hook.permissionDecisionReason, `${label}: same text to user and agent`);
        return { decision: "block", message: output.systemMessage };
      }
      assert.deepEqual(Object.keys(hook).sort(), ["additionalContext", "hookEventName"], `${label}: warn fields`);
      assert.equal(output.systemMessage, hook.additionalContext, `${label}: same text to user and agent`);
      return { decision: "warn", message: output.systemMessage };
    }
    case "cursor": {
      const output = JSON.parse(stdout); // Cursor always needs a valid object [S9]
      if (output.permission === "deny") {
        assert.equal(output.user_message, output.agent_message, `${label}: same text to user and agent`);
        return { decision: "block", message: output.user_message };
      }
      assert.deepEqual(output, { permission: "allow" }, `${label}: allow/warn shape`);
      return { decision: "allow" }; // a warning is logged only [S9]
    }
    case "gemini-cli": {
      const output = JSON.parse(stdout);
      if (output.decision === "deny") {
        assert.equal(output.reason, output.systemMessage, `${label}: same text to user and agent`);
        return { decision: "block", message: output.reason };
      }
      if (typeof output.systemMessage === "string") return { decision: "warn", message: output.systemMessage };
      assert.deepEqual(output, {}, `${label}: allow emits an empty object`);
      return { decision: "allow" };
    }
    case "opencode": {
      if (stdout === "") return { decision: "allow" }; // never sets effect = "allow" [S14]
      const output = JSON.parse(stdout);
      assert.equal(typeof output.message, "string", `${label}: message field`);
      if (output.effect === "deny") return { decision: "block", message: output.message };
      assert.equal(output.effect, "ask", `${label}: warn uses ask`);
      return { decision: "warn", message: output.message };
    }
  }
}

interface PolicyCase {
  name: string;
  command: string;
  decision: "allow" | "warn" | "block";
  message?: string;
  env?: Record<string, string>;
}

const POLICY_CASES: PolicyCase[] = [
  { name: "allow: npm test", command: "npm test", decision: "allow" },
  { name: "allow: rm -rf dist inside project", command: "rm -rf dist", decision: "allow" },
  { name: "warn: W1 force-with-lease", command: "git push --force-with-lease", decision: "warn", message: MESSAGE.W1 },
  { name: "block: B1a variable target", command: 'rm -rf "$BUILD_DIR"', decision: "block", message: MESSAGE.B1a },
  { name: "block: B1c target outside project", command: "rm -rf ../shared", decision: "block", message: MESSAGE.B1c },
  {
    name: "block: B2 non-local host",
    command: "npx prisma migrate reset",
    decision: "block",
    message: MESSAGE.B2,
    env: { PGHOST: CLOUD_HOST },
  },
  { name: "block: B3 force push", command: "git push --force origin main", decision: "block", message: MESSAGE.B3 },
  {
    name: "block: B4 terraform apply",
    command: "terraform apply -auto-approve",
    decision: "block",
    message: MESSAGE.B4,
  },
];

function assertAllowShape(agent: Agent, stdout: string): void {
  if (agent === "claude-code" || agent === "codex" || agent === "opencode") {
    assert.equal(stdout, "", `${agent}: allow prints nothing [S1][S8][S14]`);
  } else if (agent === "cursor") {
    assert.deepEqual(JSON.parse(stdout), { permission: "allow" }, "cursor: allow is a valid object [S9]");
  } else {
    assert.deepEqual(JSON.parse(stdout), {}, "gemini-cli: allow is an empty object [S11]");
  }
}

function assertBlockShape(agent: Agent, stdout: string, message: string): void {
  const output = JSON.parse(stdout);
  switch (agent) {
    case "claude-code":
    case "codex":
      assert.deepEqual(Object.keys(output).sort(), ["hookSpecificOutput", "systemMessage"], `${agent}: block fields`);
      assert.deepEqual(Object.keys(output.hookSpecificOutput).sort(),
        ["hookEventName", "permissionDecision", "permissionDecisionReason"], `${agent}: hook fields`);
      assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
      assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
      assert.equal(output.hookSpecificOutput.permissionDecisionReason, message);
      assert.equal(output.systemMessage, message);
      break;
    case "cursor":
      assert.deepEqual(Object.keys(output).sort(), ["agent_message", "permission", "user_message"], "cursor: block fields");
      assert.equal(output.permission, "deny");
      assert.equal(output.user_message, message);
      assert.equal(output.agent_message, message);
      break;
    case "gemini-cli":
      assert.deepEqual(Object.keys(output).sort(), ["decision", "reason", "systemMessage"], "gemini-cli: block fields");
      assert.equal(output.decision, "deny");
      assert.equal(output.reason, message);
      assert.equal(output.systemMessage, message);
      break;
    case "opencode":
      assert.deepEqual(Object.keys(output).sort(), ["effect", "message"], "opencode: block fields");
      assert.equal(output.effect, "deny");
      assert.equal(output.message, message);
      break;
  }
}

test("hook bundles are self-contained: node: imports only, one adapter factory, no CLI dispatch", () => {
  for (const agent of AGENTS) {
    const source = readFileSync(bundlePath(agent), "utf8");
    const label = `${agent} bundle`;

    // (a) Every static import is a node: built-in; no third-party dependency.
    const importLines = source.match(/^import\s+.*?;[ \t]*$/gm) ?? [];
    assert.ok(importLines.length > 0, `${label}: has static imports`);
    for (const line of importLines) {
      const specifier = line.match(/from\s+(["'])([^"']+)\1/);
      assert.ok(specifier, `${label}: import has a string specifier`);
      assert.match(specifier[2], /^node:/, `${label}: only node: imports`);
    }

    // (b) No relative import, static or dynamic. Internal __require() module
    // ids are bare ("core/evaluate.js") and are deliberately not relative.
    assert.doesNotMatch(source, /\bfrom\s*["']\.{1,2}\//, `${label}: no relative static import`);
    assert.doesNotMatch(source, /\bimport\s*\(\s*["']\.{1,2}\//, `${label}: no relative dynamic import`);
    assert.doesNotMatch(source, /\brequire\s*\(\s*["']\.{1,2}\//, `${label}: no relative require`);
    assert.doesNotMatch(source, /\bimport\s*\(\s*["'](?!node:)/, `${label}: no non-built-in dynamic import`);

    // (c) Exactly one adapter factory definition: the agent's own one.
    const definitions = [...source.matchAll(/\bfunction\s+(create[A-Z]\w*Adapter)\s*\(/g)].map((match) => match[1]);
    assert.deepEqual(definitions, [FACTORY[agent]], `${label}: exactly one adapter factory`);
    for (const factory of Object.values(FACTORY)) {
      if (factory !== FACTORY[agent]) {
        assert.ok(!source.includes(factory), `${label}: no ${factory}`);
      }
    }
    assert.ok(!source.includes("adapters/index"), `${label}: no adapters/index`);

    // (d) The bundle is not a CLI dispatcher.
    assert.ok(!source.includes("cli/main"), `${label}: no cli/main`);
    assert.ok(!source.includes("hook --agent"), `${label}: no hook --agent dispatch`);

    // (e) Direct stdin/stdout plumbing (behavior is exercised by the spawn tests).
    assert.match(source, /readFileSync\(0\s*,/, `${label}: reads stdin`);
    assert.match(source, /process\.stdout\.write/, `${label}: writes stdout`);
    assert.match(source, /__entry\.startHook\(\)\s*;?\s*$/, `${label}: starts the hook directly`);
  }
});

test("CAN-T-03: bundles enforce the canonical policy table with exact messages", () => {
  for (const agent of AGENTS) {
    for (const policyCase of POLICY_CASES) {
      const label = `${agent}: ${policyCase.name}`;
      withProject((projectRoot) => {
        const result = runBundle(agent, projectRoot, eventFor(agent, policyCase.command, projectRoot), policyCase.env);
        assert.equal(result.error, undefined, label);
        assert.equal(result.status, 0, label);
        assert.equal(result.stderr, "", label);

        const observed = observe(agent, result.stdout, label);
        // Cursor records a warning in its local log and returns allow [S9].
        const expectedDecision = agent === "cursor" && policyCase.decision === "warn" ? "allow" : policyCase.decision;
        assert.equal(observed.decision, expectedDecision, label);

        if (agent === "cursor" && policyCase.decision === "warn") {
          assert.equal(observed.message, undefined, `${label}: warn has no stdout message`);
          const log = join(projectRoot, "canary", "hook.log");
          assert.deepEqual(JSON.parse(readFileSync(log, "utf8").trim()), { decision: "warn", rule: "W1" });
        } else if (policyCase.message !== undefined) {
          assert.equal(observed.message, policyCase.message, `${label}: exact message`);
        } else {
          assert.equal(observed.message, undefined, `${label}: allow is silent`);
        }

        assert.ok(!result.stdout.includes(MARKER), `${label}: no marker in stdout`);
        assert.ok(!result.stderr.includes(MARKER), `${label}: no marker in stderr`);
      });
    }
  }
});

test("CAN-T-04: bundle fields match each agent's documented contract [S1][S8][S9][S11][S14]", () => {
  for (const agent of AGENTS) {
    withProject((projectRoot) => {
      const allow = runBundle(agent, projectRoot, eventFor(agent, "git status --short", projectRoot));
      assert.equal(allow.error, undefined, `${agent} allow`);
      assert.equal(allow.status, 0, `${agent} allow`);
      assert.equal(allow.stderr, "", `${agent} allow`);
      assertAllowShape(agent, allow.stdout);

      const warn = runBundle(agent, projectRoot, eventFor(agent, "git push --force-with-lease", projectRoot));
      assert.equal(warn.error, undefined, `${agent} warn`);
      assert.equal(warn.status, 0, `${agent} warn`);
      assert.equal(warn.stderr, "", `${agent} warn`);
      if (agent === "cursor") {
        assert.deepEqual(JSON.parse(warn.stdout), { permission: "allow" }, "cursor warn degrades to allow [S9]");
      } else if (agent === "gemini-cli") {
        assert.deepEqual(JSON.parse(warn.stdout), { systemMessage: MESSAGE.W1 }, "gemini warn shape [S11]");
      } else if (agent === "opencode") {
        assert.deepEqual(JSON.parse(warn.stdout), { effect: "ask", message: MESSAGE.W1 }, "opencode warn shape [S14]");
      } else {
        const output = JSON.parse(warn.stdout);
        assert.deepEqual(Object.keys(output).sort(), ["hookSpecificOutput", "systemMessage"], `${agent} warn fields`);
        assert.equal(output.systemMessage, MESSAGE.W1);
        assert.equal(output.hookSpecificOutput.additionalContext, MESSAGE.W1);
        assert.ok(!("permissionDecision" in output.hookSpecificOutput), `${agent}: warn must not decide`);
      }

      const block = runBundle(agent, projectRoot, eventFor(agent, `git push --force origin ${MARKER}`, projectRoot));
      assert.equal(block.error, undefined, `${agent} block`);
      assert.equal(block.status, 0, `${agent} block`);
      assert.equal(block.stderr, "", `${agent} block`);
      assertBlockShape(agent, block.stdout, MESSAGE.B3);
      assert.ok(!block.stdout.includes(MARKER), `${agent}: no marker echoed`);
      assert.ok(!block.stderr.includes(MARKER), `${agent}: no marker echoed`);
    });
  }
});
