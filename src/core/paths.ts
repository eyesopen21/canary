/** Project-root resolution and B1 target safety. Only local filesystem reads. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EvaluationInput } from "../contract.ts";
import { unquote } from "./tokens.ts";
import type { RuleId } from "../contract.ts";

/**
 * First available project root, in the order defined by policy.md.
 * OpenCode's `ctx.location.directory` is carried by `input.projectRoot`.
 */
export function resolveProjectRoot(input: EvaluationInput): string | undefined {
  const env = input.env ?? {};
  const candidates = [
    env.CLAUDE_PROJECT_DIR,
    env.CURSOR_PROJECT_DIR,
    env.GEMINI_PROJECT_DIR,
    input.projectRoot,
    input.cwd,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      try {
        return path.resolve(candidate);
      } catch {
        // Fall through to the next source.
      }
    }
  }
  return undefined;
}

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isFilesystemRoot(candidate: string): boolean {
  const resolved = path.resolve(candidate);
  return resolved === path.parse(resolved).root;
}

function isHome(candidate: string): boolean {
  const resolved = path.resolve(candidate);
  const home = path.resolve(os.homedir());
  return normalizeSeparators(resolved).toLowerCase() === normalizeSeparators(home).toLowerCase();
}

function hasVariableOrSubstitution(raw: string): boolean {
  return (
    /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\$env:[A-Za-z_][A-Za-z0-9_]*|%[^%]+%|\$\(|`/.test(
      raw,
    )
  );
}

function hasGlob(raw: string): boolean {
  return /[*?[]/.test(raw);
}

function wildcardMatch(pattern: string, name: string): boolean {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "*") source += ".*";
    else if (ch === "?") source += ".";
    else if (ch === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close > i + 1) {
        source += pattern.slice(i, close + 1);
        i = close;
      } else {
        source += "\\[";
      }
    } else {
      source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, process.platform === "win32" ? "i" : "").test(name);
}

function realPathOrSelf(candidate: string): string {
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return candidate;
  }
}

/**
 * Classify one delete target. Returns the failing B1 rule, or null when the
 * target is a literal path that is safe inside the project.
 */
export function checkDeleteTarget(
  rawTarget: string,
  root: string | undefined,
  baseDir: string | undefined,
): Extract<RuleId, "B1a" | "B1b" | "B1c" | "B1d" | "B1e"> | null {
  if (hasVariableOrSubstitution(rawTarget)) return "B1a";
  if (root === undefined) return "B1e";

  const literal = normalizeSeparators(unquote(rawTarget));
  const base = baseDir ? path.resolve(baseDir) : root;

  if (hasGlob(literal)) {
    const dirname = path.dirname(literal);
    const basename = path.basename(literal);
    // A glob in a directory component cannot be expanded safely here.
    if (hasGlob(dirname)) return "B1b";

    const directory = path.resolve(base, dirname);
    let entries: string[];
    try {
      entries = fs.readdirSync(directory);
    } catch {
      return "B1b"; // Empty or unreadable expansion fails closed.
    }
    const matches = entries
      .filter((entry) => wildcardMatch(basename, entry))
      .map((entry) => path.resolve(directory, entry));
    if (matches.length === 0) return "B1b";

    const directoryIsWholeRoot =
      normalizeSeparators(directory).toLowerCase() === normalizeSeparators(root).toLowerCase();
    if (directoryIsWholeRoot || isHome(directory) || isFilesystemRoot(directory)) {
      const visible = entries.filter((entry) => !entry.startsWith("."));
      if (visible.length > 0 && matches.length === visible.length) return "B1d";
    }
    if (matches.some((match) => !isInside(root, match))) return "B1b";
    return null;
  }

  const resolved = path.resolve(base, literal);
  if (isFilesystemRoot(resolved) || isHome(resolved)) return "B1d";
  if (normalizeSeparators(resolved).toLowerCase() === normalizeSeparators(root).toLowerCase()) {
    return "B1d";
  }
  if (!isInside(root, resolved)) return "B1c";

  const real = realPathOrSelf(resolved);
  if (normalizeSeparators(real).toLowerCase() === normalizeSeparators(root).toLowerCase()) {
    return "B1d";
  }
  if (!isInside(root, real)) return "B1c";
  return null;
}
