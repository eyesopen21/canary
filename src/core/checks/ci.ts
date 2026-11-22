/**
 * C9 — agent in CI on untrusted input (CAN-F-01.5, S24 check 9).
 *
 * Offline and deterministic. GitHub Actions workflows are read as text; no
 * YAML dependency is used and no value from a workflow is copied into a
 * finding. The workflow directory (.github/workflows) is the documented
 * GitHub Actions layout, but it is not cited in docs/sources.md — treated as
 * an assumption, like the configurable agent-action names below.
 */
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import path from "node:path";
import type { Check, CheckFinding } from "../contract.ts";

const CHECK = "C9";
const WORKFLOWS_DIR = ".github/workflows";
const UNTRUSTED = new Set(["issues", "issue_comment", "pull_request_review_comment"]);

/**
 * ASSUMPTION (unverified against docs/sources.md): the configurable list of
 * agent actions. None of these marketplace action names appears in sources.md;
 * the requirement only says the list must be configurable, so callers may
 * override it with createCiCheck({ agentActions: [...] }).
 */
const DEFAULT_AGENT_ACTIONS: readonly string[] = [
  "claude-code-action",
  "codex-action",
  "cursor-agent",
  "gemini-cli",
  "opencode",
];

interface Line {
  text: string;
  number: number;
}

interface ParsedWorkflow {
  triggers: Map<string, number>;
  uses: Line[];
  secretsAccess: boolean;
  permissions: "missing" | "write" | "read";
}

function stableId(rule: string, rel: string, line: number | null): string {
  const base = `${CHECK}|${rule}|${rel}|${line === null ? "null" : line}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < base.length; i++) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${CHECK}-${rule}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function finding(
  rule: string,
  severity: "critical" | "high",
  rel: string,
  line: number,
  danger: string,
  consequence: string,
): CheckFinding {
  return {
    id: stableId(rule, rel, line),
    check: CHECK,
    rule,
    severity,
    path: rel,
    line,
    danger,
    consequence,
    fix: "Use a read-only workflow that does not run an agent on untrusted input, or move the agent job to a protected trigger.",
    manual: "Have a human review this workflow and its token scope before allowing it to run.",
  };
}

function indentOf(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function tokenizeInline(value: string): string[] {
  const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  return inner.split(",").map((v) => v.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

function parseTriggers(lines: Line[]): Map<string, number> {
  const triggers = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].text.match(/^\s*(?:"on"|'on'|on)\s*:\s*(.*)$/);
    if (!match) continue;
    const value = match[1].trim().replace(/#.*$/, "").trim();
    if (value) {
      for (const token of tokenizeInline(value)) {
        if (!triggers.has(token)) triggers.set(token, lines[i].number);
      }
      continue;
    }
    const baseIndent = indentOf(lines[i].text);
    for (let j = i + 1; j < lines.length; j++) {
      const text = lines[j].text;
      if (!text.trim()) continue;
      if (indentOf(text) <= baseIndent) break;
      const list = text.match(/^\s*-\s*["']?([\w.-]+)["']?\s*$/);
      const key = list ? list[1] : text.match(/^\s*(["']?[\w.-]+["']?)\s*:/)?.[1];
      if (key) {
        const name = key.replace(/^["']|["']$/g, "");
        if (!triggers.has(name)) triggers.set(name, lines[j].number);
      }
    }
    break;
  }
  return triggers;
}

function parsePermissions(lines: Line[]): ParsedWorkflow["permissions"] {
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].text.match(/^\s*permissions\s*:\s*(.*)$/);
    if (!match) continue;
    const value = match[1].trim().replace(/#.*$/, "").trim();
    if (/write-all/i.test(value) || /:\s*write\b/i.test(value)) return "write";
    if (/read-all|\{\s*\}/i.test(value)) return "read";
    if (!value) {
      const baseIndent = indentOf(lines[i].text);
      for (let j = i + 1; j < lines.length; j++) {
        const text = lines[j].text;
        if (!text.trim()) continue;
        if (indentOf(text) <= baseIndent) break;
        if (/^\s*[\w.-]+\s*:\s*write\b/i.test(text)) return "write";
      }
      return "read";
    }
  }
  return "missing";
}

function parseWorkflow(text: string): ParsedWorkflow {
  const lines: Line[] = text.split(/\r?\n/).map((line, index) => ({ text: line, number: index + 1 }));
  const uses: Line[] = [];
  let secretsAccess = false;
  for (const line of lines) {
    if (/\$\{\{\s*secrets\s*[.}]|\bsecrets\s*:/.test(line.text)) secretsAccess = true;
    const match = line.text.match(/^\s*(?:-\s*)?uses\s*:\s*["']?([^"'\s#]+)/);
    if (match) uses.push({ text: match[1], number: line.number });
  }
  return { triggers: parseTriggers(lines), uses, secretsAccess, permissions: parsePermissions(lines) };
}

function headCheckoutLine(lines: Line[], uses: Line[]): number | null {
  for (const use of uses) {
    if (!/actions\/checkout@/i.test(use.text)) continue;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].number <= use.number) continue;
      const text = lines[i].text;
      if (/^\s*(?:-\s*)?(?:uses|name|run|id)\s*:/.test(text)) break;
      if (/^\s*ref\s*:\s*.*(?:pull_request\.head|head_ref|pull_request\.number)/i.test(text)) return lines[i].number;
      if (/^\s*repository\s*:\s*.*pull_request\.head/i.test(text)) return lines[i].number;
    }
  }
  return null;
}

export interface CiCheckOptions {
  /** Overrides the configurable list of agent actions (CAN-F-01.5). */
  agentActions?: readonly string[];
}

export function createCiCheck(options: CiCheckOptions = {}): Check {
  const actions = options.agentActions ?? DEFAULT_AGENT_ACTIONS;
  const isAgentAction = (uses: string): boolean => {
    const normalized = uses.toLowerCase();
    return actions.some((name) => normalized.includes(name.toLowerCase()));
  };

  return (root) => {
    const findings: CheckFinding[] = [];
    const workflowsRoot = path.join(root, ".github", "workflows");
    let filenames: string[];
    try {
      filenames = readdirSync(workflowsRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(?:ya?ml)$/i.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch {
      return findings;
    }

    for (const filename of filenames) {
      const abs = path.join(workflowsRoot, filename);
      try {
        if (lstatSync(abs).size > 1_000_000) continue;
      } catch {
        continue;
      }
      let text: string;
      try {
        text = readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      if (text.includes("\0")) continue;

      const rel = `.github/workflows/${filename}`;
      const parsed = parseWorkflow(text);
      const lines: Line[] = text.split(/\r?\n/).map((line, index) => ({ text: line, number: index + 1 }));

      const prTargetLine = parsed.triggers.get("pull_request_target");
      if (prTargetLine !== undefined) {
        const checkoutLine = headCheckoutLine(lines, parsed.uses);
        const line = checkoutLine ?? prTargetLine;
        findings.push(checkoutLine === null
          ? finding(
              "ci-pr-target",
              "high",
              rel,
              line,
              "This workflow uses the pull_request_target trigger.",
              "A pull request can cause workflow code to run in the base repository context with secrets or write tokens.",
            )
          : finding(
              "ci-pr-target-head-checkout",
              "critical",
              rel,
              line,
              "A pull_request_target workflow checks out the pull request head.",
              "Untrusted pull request code runs in a context that has access to secrets and write tokens.",
            ));
      }

      const hasUntrusted = [...UNTRUSTED].some((name) => parsed.triggers.has(name));
      const agentStep = parsed.uses.find((use) => isAgentAction(use.text));
      const privileged = parsed.secretsAccess || parsed.permissions !== "read";
      if (hasUntrusted && agentStep && privileged) {
        findings.push(finding(
          "ci-agent-untrusted-trigger",
          "high",
          rel,
          agentStep.number,
          "An agent action runs on an untrusted event while the workflow has secrets or broad permissions.",
          "Text from an issue or comment can steer the agent while it has access to secrets or write access.",
        ));
      }
    }

    findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule));
    return findings;
  };
}

export const ciCheck: Check = createCiCheck();
export default ciCheck;
