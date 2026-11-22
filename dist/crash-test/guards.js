/**
 * Isolation guards for the crash test (ADR-0004 rules 1, 2, 3, 5).
 *
 * All paths are resolved with `realpath` (which follows symlinks and Windows
 * junctions) and compared against the canonical temporary root. The caller
 * invokes `guardPath` twice per target: once when the scenario is built and
 * again immediately before the destructive operation.
 */
import { existsSync, promises as fsp } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { TEMP_PREFIX,                       } from "./types.js";

export class GuardError extends Error {
           code                  ;

  constructor(code                  ) {
    super(code);
    this.name = "GuardError";
    this.code = code;
  }
}

                               
               
                                                          
 

/** Containment including the root itself. */
export function isInside(root        , candidate        )          {
  const rel = path.relative(root, candidate);
  if (rel === "") return true;
  if (rel === ".." || rel.startsWith(".." + path.sep)) return false;
  return !path.isAbsolute(rel);
}

/** Strict containment: the temporary root itself is not an acceptable target. */
export function isStrictlyInside(root        , candidate        )          {
  return candidate !== root && isInside(root, candidate);
}

export function assertStrictlyInside(root        , candidate        )       {
  if (!isStrictlyInside(root, candidate)) {
    throw new GuardError("GUARD_OUTSIDE_TEMP");
  }
}

async function canonicalTmpRoot()                  {
  try {
    return await fsp.realpath(os.tmpdir());
  } catch {
    throw new GuardError("GUARD_REALPATH_FAILED");
  }
}

/**
 * ADR-0004 rule 1: a fresh directory from the operating system's temporary
 * directory API, with a canonical realpath that is itself inside the temp root.
 */
export async function createSandboxRoot(onRoot                         )                  {
  const tmp = await canonicalTmpRoot();
  const created = await fsp.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  let root        ;
  try {
    root = await fsp.realpath(created);
  } catch {
    await fsp.rm(created, { recursive: true, force: true }).catch(() => {});
    throw new GuardError("GUARD_REALPATH_FAILED");
  }
  if (!path.basename(root).startsWith(TEMP_PREFIX) || !isStrictlyInside(tmp, root)) {
    await fsp.rm(created, { recursive: true, force: true }).catch(() => {});
    throw new GuardError("GUARD_OUTSIDE_TEMP");
  }
  onRoot?.(root);
  return root;
}

/**
 * The double realpath guard. `phase` is recorded by the caller so tests can
 * verify that build-time and pre-execution checks both happened.
 */
export async function guardPath(
  ctx              ,
  candidate        ,
  phase                 ,
)                  {
  let ok = false;
  try {
    assertStrictlyInside(ctx.root, candidate);
    let real        ;
    try {
      real = await fsp.realpath(candidate);
    } catch {
      throw new GuardError("GUARD_REALPATH_FAILED");
    }
    assertStrictlyInside(ctx.root, real);
    ok = true;
    return real;
  } finally {
    ctx.onCheck?.(phase, ok);
  }
}

/**
 * ADR-0004 rule 5: delete the temporary tree only after re-resolving it and
 * confirming it is still the exact directory created for this run.
 */
export async function cleanupRoot(ctx              )                                 {
  let real        ;
  let tmp        ;
  try {
    real = await fsp.realpath(ctx.root);
    tmp = await canonicalTmpRoot();
  } catch {
    return "refused";
  }
  if (
    real !== ctx.root ||
    !isStrictlyInside(tmp, real) ||
    !path.basename(real).startsWith(TEMP_PREFIX)
  ) {
    return "refused";
  }
  await fsp.rm(real, { recursive: true, force: true });
  return "cleaned";
}

/** Keep only the directories that actually provide `git`, nothing else. */
function reducedPath()         {
  const entries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const names = process.platform === "win32" ? ["git.exe", "git.cmd"] : ["git"];
  const needed = entries.filter((dir) => names.some((name) => existsSync(path.join(dir, name))));
  return needed.slice(0, 4).join(path.delimiter);
}

/**
 * ADR-0004 rule 2: a minimal environment. We build a fresh object instead of
 * cloning `process.env`, so no inherited credential variable can reach a child
 * process. HOME and USERPROFILE point inside the temporary tree.
 */
export async function buildMinimalEnv(root        )                                              {
  const home = path.join(root, "home");
  const xdg = path.join(home, "xdg");
  const gitConfig = path.join(home, ".gitconfig");
  const hooks = path.join(root, "empty-hooks");
  await fsp.mkdir(xdg, { recursive: true });
  await fsp.mkdir(hooks, { recursive: true });
  await fsp.writeFile(gitConfig, "");

  const env                                     = {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: xdg,
    XDG_CACHE_HOME: xdg,
    XDG_DATA_HOME: xdg,
    TMP: home,
    TEMP: home,
    PATH: reducedPath(),
    // Prevent Git from reading system/global config, hooks, or prompting.
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: hooks,
    LC_ALL: "C",
  };
  if (process.platform === "win32") {
    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
    if (process.env.ComSpec) env.ComSpec = process.env.ComSpec;
  }
  return env;
}
