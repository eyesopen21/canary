import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Check, CheckFinding, Severity } from "../../contract.ts";

/**
 * Small shared helpers for the P0 scanner checks. They live here because the
 * work package owns these three files only; `findings.ts` belongs to WP-05.
 */

/** FNV-1a over check/rule/path/line. Stable across runs and platforms. */
export function stableId(
  check: string,
  rule: string,
  path: string,
  line: number | null,
): string {
  const key = `${check}\u0000${rule}\u0000${path.replace(/\\/g, "/")}\u0000${line ?? ""}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${check}-${rule}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** Repository-relative path with forward slashes, independent of host OS. */
export function repoPath(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join("/");
}

interface Tree {
  files: string[];
  links: string[];
}

function traverse(root: string): Tree {
  const files: string[] = [];
  const links: string[] = [];
  const stack: string[] = [root];

  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      // Junctions are reported as symlinks by Node on Windows. Never follow
      // a link while walking: it can point outside the scanned repository.
      if (entry.isSymbolicLink()) {
        links.push(full);
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        stack.push(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }

  files.sort();
  links.sort();
  return { files, links };
}

/** Regular files under root, sorted, with links and .git excluded. */
export function walkFiles(root: string): string[] {
  return traverse(root).files;
}

/** Symlinks and Windows junctions under root, sorted. */
export function walkLinks(root: string): string[] {
  return traverse(root).links;
}

export function readText(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// C1: non-local test/development/preview databases
// ---------------------------------------------------------------------------

const DB_SCHEMES = new Set([
  "postgres:",
  "postgresql:",
  "mysql:",
  "mariadb:",
  "mongodb:",
  "mongodb+srv:",
  "redis:",
  "rediss:",
  "mssql:",
]);

const DANGER =
  "A test, development, or preview configuration points to a non-local database host.";
const CONSEQUENCE =
  "Tests or setup scripts can change or destroy data on a host that is not disposable.";
const FIX =
  "Point this configuration at a local or container database, or use a dedicated disposable instance.";
const MANUAL =
  "Confirm that the host holds no data you cannot afford to lose before running tests.";

const URL_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s"'`;,)\]}]+/gi;
const DESTRUCTIVE_RE = /\b(drop|truncate|reset|migrate)\b/i;
const SCRIPT_RE =
  /\.(sh|bash|ps1|bat|cmd|sql|test\.[cm]?[jt]s|spec\.[cm]?[jt]s)$/i;
const SCRIPT_BASENAMES = new Set(["makefile", "package.json", "docker-compose.yml", "docker-compose.yaml"]);

function isScriptFile(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  const base = lower.slice(lower.lastIndexOf("/") + 1);
  return (
    SCRIPT_RE.test(base) ||
    SCRIPT_BASENAMES.has(base) ||
    /^makefile\./.test(base) ||
    /\.(test|spec)\.[cm]?[jt]s$/.test(base)
  );
}

function isConfigurationFile(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  if (/(^|\/)(production|prod)(\/|\.|$)/.test(lower)) return false;
  const base = lower.slice(lower.lastIndexOf("/") + 1);
  if (base.startsWith(".env")) return true;
  if (/(^|\/)(tests?|specs?|dev|develop|development|preview|staging)(\/|$)/.test(lower)) return true;
  if (/\b(test|spec|dev|development|preview|staging)\b/.test(base)) return true;
  if (/(^|\/)(docker-compose|compose)\.ya?ml$/.test(lower)) return true;
  if (base === "package.json") return true;
  if (/(vite|vitest|jest|next|webpack|rollup)\.config\./.test(base)) return true;
  return false;
}

/** Hosts declared as Docker Compose services are local for A9. */
function composeServices(files: string[], root: string): Set<string> {
  const services = new Set<string>();
  for (const file of files) {
    const base = repoPath(root, file).toLowerCase();
    if (!/(^|\/)(docker-compose|compose)\.ya?ml$/.test(base)) continue;
    let inServices = false;
    for (const raw of readText(file).split(/\r?\n/)) {
      if (/^\s*services\s*:\s*$/.test(raw)) {
        inServices = true;
        continue;
      }
      if (!inServices) continue;
      if (/^\S/.test(raw)) {
        inServices = false;
        continue;
      }
      const match = raw.match(/^ {2}([A-Za-z0-9_.-]+)\s*:\s*$/);
      if (match) services.add(match[1].toLowerCase());
    }
  }
  return services;
}

/** Returns the host in memory only; the caller never writes it to output. */
function databaseHost(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!DB_SCHEMES.has(url.protocol)) return null;
  if (url.hostname === "") return null; // unix-socket URL => local
  return url.hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

function isLocalHost(host: string, services: Set<string>): boolean {
  if (host === "localhost" || host === "::1") return true;
  if (/^127\./.test(host)) return true;
  if (host.endsWith(".localhost")) return true;
  return services.has(host);
}

function variableName(line: string): string {
  const match = line.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*/);
  return match ? match[1] : "database URL";
}

function hasDestructiveScript(files: string[], root: string): boolean {
  return files.some(
    (file) => isScriptFile(repoPath(root, file)) && DESTRUCTIVE_RE.test(readText(file)),
  );
}

export const checkDatabase: Check = (root) => {
  const files = walkFiles(root);
  const services = composeServices(files, root);
  const critical = hasDestructiveScript(files, root);
  const severity: Severity = critical ? "critical" : "high";
  const findings: CheckFinding[] = [];

  for (const file of files) {
    const path = repoPath(root, file);
    if (!isConfigurationFile(path)) continue;

    const lines = readText(file).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
      for (const match of line.matchAll(URL_RE)) {
        const host = databaseHost(match[0]);
        if (host === null || isLocalHost(host, services)) continue;
        findings.push({
          id: stableId("C1", "non-local-test-database", path, index + 1),
          check: "C1",
          rule: "non-local-test-database",
          severity,
          path,
          line: index + 1,
          danger: `${DANGER} (${variableName(line)})`,
          consequence: CONSEQUENCE,
          fix: FIX,
          manual: MANUAL,
        });
      }
    }
  }

  findings.sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0));
  return findings;
};

export default checkDatabase;
