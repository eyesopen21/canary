/**
 * C8 — unpinned or bypassing agent configuration (CAN-F-01.4, S24 check 8).
 *
 * This check is deterministic and offline. It never emits the value it read:
 * findings carry only a rule id, a repository-relative path and a line number,
 * plus fixed danger/consequence/fix text (ADR-0003, CAN-F-02).
 *
 * ASSUMPTION (unverified against docs/sources.md): the MCP configuration file
 * names below are the conventional per-agent locations. sources.md S7 only
 * describes the local-MCP-server threat and its mitigations; it does not list
 * config paths. The names are kept in one set so they can be corrected later.
 * The same applies to the three bypass spellings that ARE documented
 * (`--dangerously-skip-permissions` and `permissions.defaultMode:
 * "bypassPermissions"` [S3], `--dangerously-bypass-hook-trust` [S8]).
 */
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import path from "node:path";
import type { Check, CheckFinding, Severity } from "../contract.ts";

const CHECK = "C8";

/** Conventional per-agent MCP config paths. Unverified — see header. */
const MCP_CONFIG_PATHS = new Set([
  ".mcp.json",
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".codex/config.toml",
  ".cursor/mcp.json",
  ".gemini/settings.json",
  "opencode.json",
  "opencode.jsonc",
]);

const SKIP_DIRS = new Set([".git", "node_modules", "canary", ".canary"]);

/** Files where a bypass flag or setting would actually take effect. */
const CONFIG_EXTENSIONS = new Set([
  ".json",
  ".jsonc",
  ".toml",
  ".yaml",
  ".yml",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".cmd",
  ".bat",
  ".env",
]);
const CONFIG_FILENAMES = new Set(["Makefile", "makefile", "Dockerfile", "Justfile", "justfile"]);

/** Rule files that may carry hidden Unicode (CAN-F-01.4). */
const UNICODE_FILES = new Set(["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules"]);
const UNICODE_DIRS = [".cursor/rules", ".claude/rules"];

const RUNTIMES = new Set([
  "node", "nodejs", "npx", "npm", "yarn", "pnpm", "bun", "deno", "python",
  "python3", "py", "uv", "uvx", "pip", "pip3", "docker", "sh", "bash", "zsh",
  "cmd", "cmd.exe", "powershell", "pwsh", "git", "uvicorn", "java", "go",
]);

const BIDI: Record<string, string> = {
  "\u202A": "U+202A", "\u202B": "U+202B", "\u202C": "U+202C",
  "\u202D": "U+202D", "\u202E": "U+202E", "\u2066": "U+2066",
  "\u2067": "U+2067", "\u2068": "U+2068", "\u2069": "U+2069",
  "\u061C": "U+061C",
};
const ZERO_WIDTH: Record<string, string> = {
  "\u200B": "U+200B", "\u200C": "U+200C", "\u200D": "U+200D",
  "\uFEFF": "U+FEFF", "\u00AD": "U+00AD", "\u180E": "U+180E",
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
interface Token {
  value: string;
  line: number | null;
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
  severity: Severity,
  rel: string,
  line: number | null,
  danger: string,
  consequence: string,
  fix: string | null,
  manual: string | null,
): CheckFinding {
  return { id: stableId(rule, rel, line), check: CHECK, rule, severity, path: rel, line, danger, consequence, fix, manual };
}

function relPath(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

function walk(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        found.push(path.join(dir, entry.name));
      }
      // Symlinks/junctions are deliberately not followed: C8 reads only files
      // inside the repository root.
    }
  };
  visit(root);
  return found;
}

function readText(abs: string): string | null {
  try {
    if (lstatSync(abs).size > 1_000_000) return null;
    const text = readFileSync(abs, "utf8");
    return text.includes("\0") ? null : text;
  } catch {
    return null;
  }
}

function lineOf(text: string, needle: string, from = 0): number | null {
  const idx = text.indexOf(needle, from);
  return idx < 0 ? null : text.slice(0, idx).split("\n").length;
}

function stripVersion(name: string): string {
  const start = name.startsWith("@") ? name.indexOf("/") + 1 : 0;
  const at = name.indexOf("@", start);
  return at > 0 ? name.slice(0, at) : name;
}

function isPinned(name: string): boolean {
  const start = name.startsWith("@") ? name.indexOf("/") + 1 : 0;
  const at = name.indexOf("@", start);
  if (at <= 0) return false;
  const version = name.slice(at + 1);
  return /^\d/.test(version) && !/[\^~*]/.test(version) && !/^(?:latest|next|beta|alpha|canary)\b/i.test(version);
}

function looksLikePackage(value: string): boolean {
  const name = value.trim();
  if (!name || name.startsWith("-") || name.startsWith(".") || name.startsWith("/") ||
      name.startsWith("~") || name.includes("\\") || name.includes("://") ||
      /^[A-Za-z]:/.test(name)) {
    return false;
  }
  if (RUNTIMES.has(name.toLowerCase())) return false;
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash <= 0 || slash === name.length - 1) return false;
    const pkg = stripVersion(name.slice(slash + 1));
    return /^[a-z0-9][a-z0-9._-]*$/i.test(pkg);
  }
  const pkg = stripVersion(name);
  return /^[a-z0-9][a-z0-9._-]*$/i.test(pkg) && /[a-z]/i.test(pkg);
}

/** One finding per MCP server entry, with a documented reason. */
function unpinnedFinding(tokens: Token[], fallbackLine: number | null): { rule: string; line: number | null } | null {
  const latest = tokens.find((t) => /@latest\b/i.test(t.value));
  if (latest) return { rule: "mcp-unpinned-latest", line: latest.line ?? fallbackLine };

  const command = tokens[0]?.value ?? "";
  const args = tokens.slice(1).map((t) => t.value);
  if (/^npx$/i.test(command) && args.some((a) => /^(?:-y|--yes)$/i.test(a))) {
    const pkg = args.find((a) => !a.startsWith("-") && looksLikePackage(a) && !isPinned(a));
    if (pkg) {
      const token = tokens.find((t) => t.value === pkg);
      return { rule: "mcp-unpinned-npx", line: token?.line ?? fallbackLine };
    }
  }

  const bare = tokens.find((t) => looksLikePackage(t.value) && !isPinned(t.value));
  if (bare) return { rule: "mcp-unpinned-bare", line: bare.line ?? fallbackLine };
  return null;
}

function emitUnpinned(tokens: Token[], fallbackLine: number | null, rel: string, out: CheckFinding[]): void {
  const result = unpinnedFinding(tokens, fallbackLine);
  if (!result) return;
  out.push(finding(
    result.rule,
    "medium",
    rel,
    result.line,
    "An MCP server in this repository is not pinned to an exact version.",
    "A package update or a compromised release can change the server's startup command without a repository change.",
    "Pin the server package to an exact version and review its startup command.",
    null,
  ));
}

function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (c === "\n" || c === "\r") { lineComment = false; out += c; } else { out += " "; }
      continue;
    }
    if (blockComment) {
      if (c === "*" && next === "/") { blockComment = false; out += "  "; i++; }
      else { out += (c === "\n" || c === "\r") ? c : " "; }
      continue;
    }
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === "/" && next === "/") { lineComment = true; out += "  "; i++; continue; }
    if (c === "/" && next === "*") { blockComment = true; out += "  "; i++; continue; }
    out += c;
  }
  return out;
}

function stripTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") { out += " "; continue; }
    }
    out += c;
  }
  return out;
}

function entryTokens(entry: JsonValue): string[] {
  if (typeof entry === "string") return [entry];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
  const values: string[] = [];
  if (typeof entry.command === "string") values.push(entry.command);
  if (Array.isArray(entry.args)) {
    for (const arg of entry.args) if (typeof arg === "string") values.push(arg);
  }
  if (values.length === 0) {
    for (const value of Object.values(entry)) if (typeof value === "string") values.push(value);
  }
  return values;
}

function tokenize(values: string[], text: string, from: number): Token[] {
  return values.map((value) => ({ value, line: lineOf(text, `"${value}"`, from) }));
}

function analyzeMcpJson(text: string, rel: string, out: CheckFinding[]): void {
  const clean = stripTrailingCommas(stripJsonComments(text));
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(clean) as JsonValue;
  } catch {
    analyzeMcpLines(text, rel, out);
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
  const document = parsed as { [key: string]: JsonValue };

  const containers: Array<[string, JsonValue]> = [];
  for (const key of ["mcpServers", "mcp_servers", "mcp"]) {
    if (key in document) containers.push([key, document[key]]);
  }
  let foundStructured = false;
  for (const [containerKey, container] of containers) {
    if (!container || typeof container !== "object" || Array.isArray(container)) continue;
    for (const [name, entry] of Object.entries(container)) {
      const entryLine = lineOf(text, `"${name}"`, lineOf(text, `"${containerKey}"`) ?? 0);
      const from = entryLine === null ? 0 : text.split("\n").slice(0, entryLine).join("\n").length + 1;
      const tokens = tokenize(entryTokens(entry), text, from);
      if (tokens.length === 0) continue;
      foundStructured = true;
      emitUnpinned(tokens, entryLine, rel, out);
    }
  }
  if (!foundStructured) analyzeMcpLines(text, rel, out);
}

function quotedValues(fragment: string): string[] {
  const values: string[] = [];
  const re = /["']([^"']*)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(fragment)) !== null) values.push(match[1]);
  return values;
}

function analyzeMcpToml(text: string, rel: string, out: CheckFinding[]): void {
  const lines = text.split(/\r?\n/);
  let inMcp = false;
  let serverLine: number | null = null;
  let tokens: Token[] = [];

  const flush = (): void => {
    if (inMcp && tokens.length > 0) emitUnpinned(tokens, serverLine, rel, out);
    tokens = [];
    serverLine = null;
  };

  lines.forEach((line, index) => {
    const table = line.match(/^\s*\[([^\]]+)\]/);
    if (table) {
      flush();
      const name = table[1].trim();
      inMcp = /^(?:mcp_servers|mcp)(?:\.|$)/.test(name);
      serverLine = inMcp ? index + 1 : null;
      return;
    }
    if (!inMcp) return;
    const command = line.match(/^\s*command\s*=\s*["']([^"']+)["']/);
    if (command) tokens.push({ value: command[1], line: index + 1 });
    const args = line.match(/^\s*args\s*=\s*\[([^\]]*)\]/);
    if (args) {
      for (const value of quotedValues(args[1])) tokens.push({ value, line: index + 1 });
    }
  });
  flush();
}

function analyzeMcpLines(text: string, rel: string, out: CheckFinding[]): void {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const at = index + 1;
    if (/@latest\b/i.test(line)) {
      emitUnpinned([{ value: "@latest", line: at }], at, rel, out);
      return;
    }
    if (/\bnpx\b/i.test(line) && /(?:-y|--yes)/i.test(line)) {
      emitUnpinned([{ value: "npx", line: at }, { value: "-y", line: at }], at, rel, out);
      return;
    }
    const command = line.match(/["']?command["']?\s*[:=]\s*["']([^"']+)["']/);
    if (command && looksLikePackage(command[1]) && !isPinned(command[1])) {
      emitUnpinned([{ value: command[1], line: at }], at, rel, out);
    }
  });
}

const BYPASS_RULES: Array<{ rule: string; re: RegExp; danger: string; consequence: string; fix: string }> = [
  {
    rule: "bypass-claude-skip-permissions",
    re: /--dangerously-skip-permissions/g,
    danger: "A documented Claude Code permission-bypass flag is enabled in a repository file [S3].",
    consequence: "Permission prompts and safety checks are skipped for that command.",
    fix: "Remove the flag and use the normal permission prompt.",
  },
  {
    rule: "bypass-claude-permissions-mode",
    re: /(?:permissions\s*\.\s*)?defaultMode["']?\s*[:=]\s*["']?bypassPermissions["']?/g,
    danger: "A Claude Code configuration sets the documented bypassPermissions default mode [S3].",
    consequence: "The agent starts in a mode that skips permission prompts and safety checks.",
    fix: "Set defaultMode to a non-bypass value.",
  },
  {
    rule: "bypass-codex-hook-trust",
    re: /--dangerously-bypass-hook-trust/g,
    danger: "A documented Codex hook-trust bypass flag is enabled in a repository file [S8].",
    consequence: "Hooks that would inspect or block the command may not be trusted.",
    fix: "Remove the flag and review hooks through the normal trust flow.",
  },
];

function analyzeBypass(text: string, rel: string, out: CheckFinding[]): void {
  for (const { rule, re, danger, consequence, fix } of BYPASS_RULES) {
    re.lastIndex = 0;
    const seen = new Set<number>();
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const line = text.slice(0, match.index).split("\n").length;
      if (seen.has(line)) continue;
      seen.add(line);
      out.push(finding(
        rule, "high", rel, line, danger, consequence, fix,
        "Confirm with a human that this bypass is intentional.",
      ));
    }
  }
}

function analyzeUnicode(text: string, rel: string, out: CheckFinding[]): void {
  const content = text.startsWith("\uFEFF") ? text.slice(1) : text;
  content.split(/\r?\n/).forEach((line, index) => {
    for (const [table, rule, label] of [
      [BIDI, "hidden-unicode-bidi", "bidirectional"],
      [ZERO_WIDTH, "hidden-unicode-zero-width", "zero-width"],
    ] as const) {
      const found = Object.keys(table).find((char) => line.includes(char));
      if (!found) continue;
      out.push(finding(
        rule,
        "high",
        rel,
        index + 1,
        `An invisible ${label} Unicode control character (${table[found]}) is present in a rule file.`,
        "Hidden characters can change how an agent reads the rule without changing how a reviewer reads it.",
        "Remove the character and review the file in a hexadecimal or Unicode-aware viewer.",
        null,
      ));
    }
  });
}

function isConfigFile(rel: string): boolean {
  const base = path.posix.basename(rel);
  return CONFIG_EXTENSIONS.has(path.posix.extname(base).toLowerCase()) || CONFIG_FILENAMES.has(base);
}

function isUnicodeFile(rel: string): boolean {
  if (UNICODE_FILES.has(rel)) return true;
  return UNICODE_DIRS.some((dir) => rel.startsWith(`${dir}/`));
}

export const agentConfigCheck: Check = (root) => {
  const findings: CheckFinding[] = [];
  for (const abs of walk(root)) {
    const rel = relPath(root, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
    const text = readText(abs);
    if (text === null) continue;

    if (MCP_CONFIG_PATHS.has(rel)) {
      if (rel.endsWith(".toml")) analyzeMcpToml(text, rel, findings);
      else analyzeMcpJson(text, rel, findings);
    }
    if (isConfigFile(rel)) analyzeBypass(text, rel, findings);
    if (isUnicodeFile(rel)) analyzeUnicode(text, rel, findings);
  }
  findings.sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule));
  return findings;
};

export default agentConfigCheck;
