import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Check, CheckFinding, Severity } from "../../contract.ts";
import { readText, repoPath, stableId, walkFiles } from "./database.ts";

// ---------------------------------------------------------------------------
// C2: readable credentials
//
// Rule from ADR-0003: values are read only in memory for the pattern match and
// discarded. Findings hold names, rules, paths and lines only. The home
// directory is checked for PRESENCE with existsSync; never open those files.
// ---------------------------------------------------------------------------

const CREDENTIAL_PATTERNS: Array<{
  rule: string;
  severity: Severity;
  regex: RegExp;
}> = [
  {
    rule: "private-key",
    severity: "critical",
    regex: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/,
  },
  {
    rule: "payment-key",
    severity: "critical",
    regex: /\b(?:sk_live|rk_live|pk_live)_[0-9A-Za-z]{8,}/,
  },
  {
    rule: "aws-access-key-id",
    severity: "high",
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    rule: "generic-secret",
    severity: "high",
    regex:
      /\b(API_KEY|SECRET_KEY|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET|PASSWORD|SECRET|TOKEN)\b\s*[:=]\s*["']?[^\s"';,]{8,}/i,
  },
];

const HOME_FILES = [
  ".aws/credentials",
  ".kube/config",
  ".netrc",
  ".pgpass",
] as const;

/** Test seam: CANARY_HOME redirects home lookups to a synthetic fixture. */
function homeDirectory(): string {
  return (
    process.env.CANARY_HOME ||
    process.env.USERPROFILE ||
    process.env.HOME ||
    ""
  );
}

function loadIgnorePatterns(root: string): string[] {
  const text = readText(join(root, ".gitignore"));
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A small .gitignore subset: exact names, dirs, * wildcards and ! negation. */
function isIgnored(relativePath: string, patterns: string[]): boolean {
  const path = relativePath.replace(/\\/g, "/");
  let ignored = false;
  for (const raw of patterns) {
    const negated = raw.startsWith("!");
    const pattern = (negated ? raw.slice(1) : raw).replace(/^\//, "");
    if (pattern === "") continue;
    const directoryOnly = pattern.endsWith("/");
    const cleaned = pattern.replace(/\/$/, "");
    let matched = false;
    if (cleaned.includes("*")) {
      const body = cleaned.split("*").map(escapeRegex).join(".*");
      matched = new RegExp(`(?:^|/)${body}${directoryOnly ? "/.*$" : "$"}`).test(path);
    } else {
      matched =
        path === cleaned ||
        path.startsWith(`${cleaned}/`) ||
        (!directoryOnly && path.endsWith(`/${cleaned}`));
    }
    if (matched) ignored = !negated;
  }
  return ignored;
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("example") ||
    lower.includes("placeholder") ||
    lower.includes("changeme") ||
    lower.includes("your_")
  );
}

function matchCredentialPattern(line: string): { rule: string; severity: Severity } | null {
  const trimmed = line.trim();
  if (trimmed.startsWith("#") || trimmed.startsWith("//")) return null;
  for (const pattern of CREDENTIAL_PATTERNS) {
    if (!pattern.regex.test(line)) continue;
    if (pattern.rule === "generic-secret" && isPlaceholder(line)) return null;
    return { rule: pattern.rule, severity: pattern.severity };
  }
  return null;
}

function credentialFinding(
  rule: string,
  severity: Severity,
  path: string,
  line: number | null,
): CheckFinding {
  return {
    id: stableId("C2", rule, path, line),
    check: "C2",
    rule,
    severity,
    path,
    line,
    danger: "A tracked file contains a credential pattern.",
    consequence: "Anyone with read access to the repository can use the credential.",
    fix: "Remove the value, keep a placeholder in its place, and add the file to .gitignore.",
    manual: "Rotate the credential; removing it from the repository does not revoke it.",
  };
}

export const checkCredentials: Check = (root) => {
  const files = walkFiles(root);
  const ignore = loadIgnorePatterns(root);
  const findings: CheckFinding[] = [];

  for (const file of files) {
    const path = repoPath(root, file);
    if (path.startsWith("../") || isIgnored(path, ignore)) continue;

    const base = path.slice(path.lastIndexOf("/") + 1);
    const isEnvFile = base === ".env" || base.startsWith(".env.");
    if (isEnvFile && base !== ".env.example") {
      findings.push({
        id: stableId("C2", "tracked-env-file", path, null),
        check: "C2",
        rule: "tracked-env-file",
        severity: "high",
        path,
        line: null,
        danger: "A tracked .env file is present in the repository.",
        consequence: "Environment files often hold secrets readable by anyone with repository access.",
        fix: "Remove the file from Git, keep .env.example with placeholder values, and add the file to .gitignore.",
        manual: "Rotate any secret that was committed in this file.",
      });
    }

    const lines = readText(file).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const match = matchCredentialPattern(lines[index]);
      if (!match) continue;
      findings.push(
        credentialFinding(match.rule, match.severity, path, index + 1),
      );
    }
  }

  const home = homeDirectory();
  if (home !== "") {
    for (const relative of HOME_FILES) {
      if (!existsSync(join(home, relative))) continue;
      // Always render with ~: no absolute path or home value reaches output.
      const path = `~/${relative}`;
      findings.push({
        id: stableId("C2", "home-credential", path, null),
        check: "C2",
        rule: "home-credential",
        severity: "high",
        path,
        line: null,
        danger: "A credential file is present in the local home directory.",
        consequence:
          "An agent running with the user's privileges can read it without touching the repository.",
        fix: null,
        manual: "Restrict the file's permissions and confirm the credentials are still needed.",
      });
    }
  }

  findings.sort(
    (a, b) => a.path.localeCompare(b.path) || a.rule.localeCompare(b.rule) || (a.line ?? 0) - (b.line ?? 0),
  );
  return findings;
};

export default checkCredentials;
