/** Project-root resolution and B1 target safety. Only local filesystem reads. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
                                                      
import { unquote } from "./tokens.js";
                                             

/**
 * First available project root, in the order defined by policy.md.
 * OpenCode's `ctx.location.directory` is carried by `input.projectRoot`.
 */
export function resolveProjectRoot(input                 )                     {
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

function normalizeSeparators(value        )         {
  return value.replace(/\\/g, "/");
}

function isInside(root        , candidate        )          {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function isFilesystemRoot(candidate        )          {
  const resolved = path.resolve(candidate);
  return resolved === path.parse(resolved).root;
}

function isHome(candidate        )          {
  const resolved = path.resolve(candidate);
  const home = path.resolve(os.homedir());
  return path.relative(home, resolved) === "";
}

function hasVariableOrSubstitution(raw        )          {
  return (
    /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\$env:[A-Za-z_][A-Za-z0-9_]*|%[^%]+%|\$\(|`/.test(
      raw,
    )
  );
}

function hasGlob(raw        )          {
  return /[*?[]/.test(raw);
}

function wildcardMatch(pattern        , name        )          {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] ;
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

function realPathOrSelf(candidate        )         {
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
  rawTarget        ,
  root                    ,
  baseDir                    ,
)                                                                {
  if (hasVariableOrSubstitution(rawTarget)) return "B1a";
  if (root === undefined) return "B1e";

  const literal = normalizeSeparators(unquote(rawTarget));
  const base = baseDir ? path.resolve(baseDir) : root;
  const canonicalRoot = realPathOrSelf(root);

  if (hasGlob(literal)) {
    const dirname = path.dirname(literal);
    const basename = path.basename(literal);
    // A glob in a directory component cannot be expanded safely here.
    if (hasGlob(dirname)) return "B1b";

    const directory = path.resolve(base, dirname);
    let entries          ;
    try {
      entries = fs.readdirSync(directory);
    } catch {
      return "B1b"; // Empty or unreadable expansion fails closed.
    }
    const matches = entries
      .filter((entry) => wildcardMatch(basename, entry))
      .map((entry) => path.resolve(directory, entry));
    if (matches.length === 0) return "B1b";

    const directoryIsWholeRoot = path.relative(root, directory) === "";
    if (directoryIsWholeRoot || isHome(directory) || isFilesystemRoot(directory)) {
      const visible = entries.filter((entry) => !entry.startsWith("."));
      if (visible.length > 0 && matches.length === visible.length) return "B1d";
    }
    if (matches.some((match) => !isInside(root, match) || !isInside(canonicalRoot, realPathOrSelf(match)))) return "B1b";
    return null;
  }

  const resolved = path.resolve(base, literal);
  if (isFilesystemRoot(resolved) || isHome(resolved)) return "B1d";
  if (path.relative(root, resolved) === "") {
    return "B1d";
  }
  if (!isInside(root, resolved)) return "B1c";

  const real = realPathOrSelf(resolved);
  if (path.relative(canonicalRoot, real) === "") {
    return "B1d";
  }
  if (!isInside(canonicalRoot, real)) return "B1c";
  return null;
}
