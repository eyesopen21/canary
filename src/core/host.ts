/** B2 host resolution. Values are parsed in memory and never returned. */

import fs from "node:fs";
import path from "node:path";
import { HOST_ARGUMENT } from "./messages.ts";
import { unquote } from "./tokens.ts";

const HOST_VARIABLES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "PGHOST",
  "MYSQL_HOST",
  "MONGODB_URI",
  "MONGO_URL",
] as const;

export interface HostSource {
  /** Variable name in backticks via the message layer, or the fixed -h text. */
  variable: string;
  value: string;
}

/** Extract the host from a connection string. Returns null if unparseable. */
export function parseHost(value: string): string | null {
  const raw = value.trim().replace(/^['"]|['"]$/g, "");
  if (raw === "") return null;

  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) {
    try {
      const hostname = new URL(raw).hostname;
      return hostname === "" ? null : hostname;
    } catch {
      return null;
    }
  }

  // Unix socket paths and relative socket paths count as local.
  if (
    raw.startsWith("/") ||
    raw.startsWith("./") ||
    raw.startsWith("../") ||
    raw.startsWith("~/") ||
    raw.includes("/") ||
    /\.sock$/i.test(raw)
  ) {
    return raw;
  }

  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return end > 1 ? raw.slice(1, end) : null;
  }
  if (/^[0-9A-Fa-f:]+$/.test(raw) && raw.includes(":")) {
    return raw; // Bare IPv6, e.g. ::1
  }

  let candidate = raw;
  const at = candidate.lastIndexOf("@");
  if (at >= 0) candidate = candidate.slice(at + 1);
  candidate = candidate.split(/[:/]/)[0] ?? "";
  return candidate === "" ? null : candidate;
}

function parseAssignment(token: string): { name: string; value: string } | null {
  const value = unquote(token);
  const equals = value.indexOf("=");
  if (equals <= 0) return null;
  const name = value.slice(0, equals);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;
  return { name, value: value.slice(equals + 1).replace(/^['"]|['"]$/g, "") };
}

function envFileValues(root: string, file: string): Record<string, string> {
  const values: Record<string, string> = {};
  let text: string;
  try {
    text = fs.readFileSync(path.join(root, file), "utf8");
  } catch {
    return values;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("export ")) continue;
    const equals = trimmed.indexOf("=");
    if (equals <= 0) continue;
    const name = trimmed.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    values[name] = trimmed.slice(equals + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

/** Resolve the host source in the priority order defined by policy.md. */
export function findHostSource(
  tokens: string[],
  env: Record<string, string | undefined>,
  root: string | undefined,
): HostSource | null {
  // 1. Explicit -h / --host argument.
  for (let i = 0; i < tokens.length; i++) {
    const token = unquote(tokens[i] ?? "");
    if (token.startsWith("--host=")) {
      return { variable: HOST_ARGUMENT, value: token.slice("--host=".length) };
    }
    if (token === "--host" || token === "-h") {
      const value = unquote(tokens[i + 1] ?? "");
      if (value !== "") return { variable: HOST_ARGUMENT, value };
    }
  }

  // 2. Variable assigned inline in the segment.
  for (const token of tokens) {
    const assignment = parseAssignment(token);
    if (assignment && (HOST_VARIABLES as readonly string[]).includes(assignment.name)) {
      return { variable: assignment.name, value: assignment.value };
    }
  }

  // 3. Hook process environment.
  for (const name of HOST_VARIABLES) {
    const value = env[name];
    if (value !== undefined) return { variable: name, value };
  }

  // 4. .env then .env.local in the project root.
  if (root !== undefined) {
    for (const file of [".env", ".env.local"]) {
      const values = envFileValues(root, file);
      for (const name of HOST_VARIABLES) {
        if (values[name] !== undefined) return { variable: name, value: values[name]! };
      }
    }
  }

  return null;
}

/** Service names declared in a Compose file in the project root. */
export function composeServices(root: string): Set<string> {
  const services = new Set<string>();
  for (const file of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
    let text: string;
    try {
      text = fs.readFileSync(path.join(root, file), "utf8");
    } catch {
      continue;
    }
    let inServices = false;
    let serviceIndent: number | null = null;
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      const indent = line.length - line.trimStart().length;
      if (!inServices) {
        if (/^services\s*:/.test(trimmed)) inServices = true;
        continue;
      }
      if (indent === 0) break;
      const match = /^([A-Za-z0-9._-]+)\s*:/.exec(trimmed);
      if (!match) continue;
      if (serviceIndent === null) serviceIndent = indent;
      if (indent === serviceIndent) services.add(match[1]!.toLowerCase());
    }
  }
  return services;
}

/** Local-host determination from policy.md#local-host. */
export function isLocalHost(host: string, root: string | undefined): boolean {
  const value = host.toLowerCase();
  if (value === "localhost" || value.endsWith(".localhost")) return true;
  if (value === "::1") return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return true;
  if (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("~/") ||
    value.includes("/") ||
    value.endsWith(".sock")
  ) {
    return true;
  }
  return root !== undefined && composeServices(root).has(value);
}
