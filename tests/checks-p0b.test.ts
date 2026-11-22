import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { Check, CheckFinding, Severity } from "../contract.ts";
import { agentConfigCheck } from "../src/core/checks/agent-config.ts";
import { ciCheck, createCiCheck } from "../src/core/checks/ci.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C8_ROOT = path.resolve(HERE, "../fixtures/trap-c8");
const C9_ROOT = path.resolve(HERE, "../fixtures/trap-c9");
const MARKER = "CANARY_SYNTHETIC_MARKER_7f3a";

// Compile-time conformance with the shared check contract.
const c8: Check = agentConfigCheck;
const c9: Check = ciCheck;

interface Expected {
  rule: string;
  severity: Severity;
  path: string;
  line: number;
}

function lineOf(root: string, rel: string, token: string): number {
  const text = readFileSync(path.join(root, ...rel.split("/")), "utf8");
  const index = text.indexOf(token);
  assert.notStrictEqual(index, -1, `token not found in ${rel}: ${token}`);
  return text.slice(0, index).split("\n").length;
}

function key(finding: CheckFinding): Expected {
  return { rule: finding.rule, severity: finding.severity, path: finding.path, line: finding.line as number };
}

function byKey(a: Expected, b: Expected): number {
  return a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule);
}

function assertFindings(actual: CheckFinding[], expected: Expected[], check: string): void {
  assert.ok(actual.every((f) => f.check === check), "every finding belongs to the check");
  assert.ok(actual.every((f) => f.line !== null && f.line > 0), "every finding has a positive line");
  assert.ok(actual.every((f) => f.id.length > 0), "every finding has an id");
  assert.deepStrictEqual(actual.map(key).sort(byKey), expected.slice().sort(byKey));
}

test("CAN-F-01.4: C8 trap fixture produces exactly the expected findings", () => {
  const expected: Expected[] = [
    { rule: "mcp-unpinned-latest", severity: "medium", path: ".mcp.json", line: lineOf(C8_ROOT, ".mcp.json", "@modelcontextprotocol/server-filesystem@latest") },
    { rule: "mcp-unpinned-npx", severity: "medium", path: ".mcp.json", line: lineOf(C8_ROOT, ".mcp.json", "@modelcontextprotocol/server-fetch") },
    { rule: "mcp-unpinned-npx", severity: "medium", path: ".codex/config.toml", line: lineOf(C8_ROOT, ".codex/config.toml", "@modelcontextprotocol/server-docs") },
    { rule: "mcp-unpinned-bare", severity: "medium", path: ".cursor/mcp.json", line: lineOf(C8_ROOT, ".cursor/mcp.json", "mcp-server-git") },
    { rule: "mcp-unpinned-bare", severity: "medium", path: "opencode.jsonc", line: lineOf(C8_ROOT, "opencode.jsonc", "mcp-server-time") },
    { rule: "bypass-claude-permissions-mode", severity: "high", path: ".claude/settings.json", line: lineOf(C8_ROOT, ".claude/settings.json", "defaultMode") },
    { rule: "bypass-claude-skip-permissions", severity: "high", path: "scripts/agent.sh", line: lineOf(C8_ROOT, "scripts/agent.sh", "--dangerously-skip-permissions") },
    { rule: "bypass-codex-hook-trust", severity: "high", path: "scripts/agent.sh", line: lineOf(C8_ROOT, "scripts/agent.sh", "--dangerously-bypass-hook-trust") },
    { rule: "hidden-unicode-bidi", severity: "high", path: "AGENTS.md", line: lineOf(C8_ROOT, "AGENTS.md", "Before running tests") },
    { rule: "hidden-unicode-zero-width", severity: "high", path: "AGENTS.md", line: lineOf(C8_ROOT, "AGENTS.md", "Use") },
    { rule: "hidden-unicode-bidi", severity: "high", path: "GEMINI.md", line: lineOf(C8_ROOT, "GEMINI.md", "ask before deleting") },
    { rule: "hidden-unicode-zero-width", severity: "high", path: ".cursorrules", line: lineOf(C8_ROOT, ".cursorrules", "exact versions") },
    { rule: "hidden-unicode-bidi", severity: "high", path: ".cursor/rules/security.mdc", line: lineOf(C8_ROOT, ".cursor/rules/security.mdc", "least privilege") },
    { rule: "hidden-unicode-zero-width", severity: "high", path: ".claude/rules/general.md", line: lineOf(C8_ROOT, ".claude/rules/general.md", "bypass a hook") },
  ];
  assertFindings(c8(C8_ROOT), expected, "C8");
});

test("CAN-F-01.5: C9 trap fixture produces exactly the expected findings", () => {
  const expected: Expected[] = [
    {
      rule: "ci-pr-target-head-checkout",
      severity: "critical",
      path: ".github/workflows/pr-target.yml",
      line: lineOf(C9_ROOT, ".github/workflows/pr-target.yml", "github.event.pull_request.head.sha"),
    },
    {
      rule: "ci-pr-target",
      severity: "high",
      path: ".github/workflows/pr-target-safe.yml",
      line: lineOf(C9_ROOT, ".github/workflows/pr-target-safe.yml", "pull_request_target"),
    },
    {
      rule: "ci-agent-untrusted-trigger",
      severity: "high",
      path: ".github/workflows/issue-agent.yml",
      line: lineOf(C9_ROOT, ".github/workflows/issue-agent.yml", "anthropics/claude-code-action@v1"),
    },
    {
      rule: "ci-agent-untrusted-trigger",
      severity: "high",
      path: ".github/workflows/issue-secrets.yml",
      line: lineOf(C9_ROOT, ".github/workflows/issue-secrets.yml", "openai/codex-action@v1"),
    },
  ];
  assertFindings(c9(C9_ROOT), expected, "C9");

  const cleanPaths = [
    ".github/workflows/issue-readonly.yml",
    ".github/workflows/issue-no-agent.yml",
    ".github/workflows/push-agent.yml",
  ];
  for (const rel of cleanPaths) {
    assert.ok(!c9(C9_ROOT).some((f) => f.path === rel), `no finding expected for ${rel}`);
  }
});

test("CAN-F-01.5: the configurable agent-action list is honoured", () => {
  const narrowed = createCiCheck({ agentActions: ["custom-agent-action"] });
  const findings = narrowed(C9_ROOT);
  assert.deepStrictEqual(
    findings.map((f) => f.rule).sort(),
    ["ci-pr-target", "ci-pr-target-head-checkout"],
  );
});

test("CAN-T-02: no finding leaks a synthetic value, an absolute path or the home directory", () => {
  const all = [
    ...c8(C8_ROOT),
    ...c9(C9_ROOT),
  ];
  const serialized = JSON.stringify(all);
  for (const forbidden of [
    MARKER,
    "@modelcontextprotocol/server-filesystem@latest",
    "secrets.CANARY_SYNTHETIC_MARKER_7f3a",
    C8_ROOT,
    C9_ROOT,
    homedir(),
  ]) {
    if (forbidden.length > 3) {
      assert.ok(!serialized.includes(forbidden), `output must not contain a leaked value or absolute path: ${forbidden.slice(0, 12)}...`);
    }
  }
  for (const finding of all) {
    assert.ok(!path.isAbsolute(finding.path), "path must be repository-relative");
    assert.ok(!finding.path.includes("\\"), "path must use forward slashes");
    assert.ok(!finding.path.startsWith(".."), "path must stay inside the repository");
  }
});

test("CAN-T-01: a clean repository produces no C8 or C9 findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "canary-clean-"));
  try {
    writeFileSync(path.join(dir, "AGENTS.md"), "# Rules\nAsk a human before destructive commands.\n", "utf8");
    writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify({
      mcpServers: { pinned: { command: "npx", args: ["-y", "@modelcontextprotocol/server-memory@1.2.3"] } },
    }), "utf8");
    mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(path.join(dir, ".github", "workflows", "clean.yml"), [
      "name: Clean",
      "on: push",
      "permissions:",
      "  contents: read",
      "jobs:",
      "  check:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: echo ok",
      "",
    ].join("\n"), "utf8");
    assert.deepStrictEqual(c8(dir), []);
    assert.deepStrictEqual(c9(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CAN-N-04: both checks are deterministic", () => {
  assert.deepStrictEqual(c8(C8_ROOT), c8(C8_ROOT));
  assert.deepStrictEqual(c9(C9_ROOT), c9(C9_ROOT));
});
