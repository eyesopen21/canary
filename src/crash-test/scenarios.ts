/**
 * The three destructive scenarios and their disposable payloads.
 *
 * Every file created here lives below the crash-test temporary root. The
 * database scenario never opens a connection; its "without Canary" side is a
 * labeled simulation, as required by ADR-0004 rule 4.
 */
import { promises as fsp } from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { GuardError, guardPath, type GuardContext } from "./guards.ts";
import type {
  CommandOutcome,
  CommandRunner,
  CommandSpec,
  CrashScenarioId,
  EvaluationResult,
} from "./types.ts";

export const SCENARIO_IDS: readonly CrashScenarioId[] = ["delete", "database", "force-push"];

/** Synthetic, non-local and unreachable. Never emitted in a report. */
export const FAKE_DATABASE_URL = "postgresql://canary@db.canary.invalid:5432/canary";

export const SCENARIO_META: Record<
  CrashScenarioId,
  { title: string; command: string }
> = {
  delete: {
    title: "Recursive delete with an empty variable",
    command: 'rm -rf "$CRASH_TARGET"',
  },
  database: {
    title: "DROP TABLE against a non-local DATABASE_URL",
    command: 'psql -c "DROP TABLE users"',
  },
  "force-push": {
    title: "Force push to a local bare remote",
    command: "git push --force sandbox-origin main",
  },
};

/** Exact block messages from docs/specs/policy.md, placeholders already filled. */
export const FALLBACK_DECISIONS: Record<CrashScenarioId, EvaluationResult> = {
  delete: {
    decision: "block",
    rule: "B1a",
    message:
      "Canary blocked a recursive delete. Danger: the target `$CRASH_TARGET` contains a variable or command substitution that Canary cannot resolve before it runs. Consequence: if it expands to an empty or wrong path, the command deletes files outside the intended folder, and they cannot be restored from this machine. Instead: use a literal path inside the project.",
  },
  database: {
    decision: "block",
    rule: "B2",
    message:
      "Canary blocked a destructive database command. Danger: `DATABASE_URL` points to a non-local host, which may be production. Consequence: this command DROPS tables, and the data cannot be recovered from this machine. Instead: point `DATABASE_URL` to a local database, or ask a human to run this command.",
  },
  "force-push": {
    decision: "block",
    rule: "B3",
    message:
      "Canary blocked a force push. Danger: this push rewrites history on `sandbox-origin`. Consequence: commits that exist only on `sandbox-origin` are lost for everyone who uses it. Instead: push without forcing, or ask a human to approve a force push.",
  },
};

export const defaultCommandRunner: CommandRunner = (spec) => {
  const result = spawnSync(spec.file, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    timeout: spec.timeoutMs,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    unavailable: result.error?.code === "ENOENT",
    stdout: typeof result.stdout === "string" ? result.stdout : undefined,
  };
};

export interface ScenarioEffect {
  artifactsRemoved?: number;
  remoteRefChanged?: boolean;
}

export interface PreparedScenario {
  sandbox: string;
  target: string;
  run: () => Promise<ScenarioEffect>;
}

interface PrepareArgs {
  ctx: GuardContext;
  env: Record<string, string | undefined>;
  runner: CommandRunner;
  phase: "without" | "with";
  override?: string;
}

function command(
  file: string,
  args: string[],
  cwd: string,
  env: Record<string, string | undefined>,
): CommandSpec {
  return { file, args, cwd, env, timeoutMs: 20_000 };
}

function mustSucceed(outcome: CommandOutcome): void {
  if (outcome.unavailable) throw new GuardError("COMMAND_UNAVAILABLE");
  if (!outcome.ok) throw new GuardError("COMMAND_FAILED");
}

async function prepareDelete({ ctx, phase, override }: PrepareArgs): Promise<PreparedScenario> {
  const sandbox = path.join(ctx.root, `delete-${phase}`);
  assertBuildTarget(ctx, sandbox);
  await fsp.mkdir(sandbox);

  const work = path.join(sandbox, "work");
  await fsp.mkdir(work);

  // The override never receives a write: it is only realpath-checked below.
  const target = override ?? path.join(work, "sentinels");
  let sentinelCount = 0;
  if (!override) {
    await fsp.mkdir(target);
    sentinelCount = 3;
    for (let i = 0; i < sentinelCount; i += 1) {
      await fsp.writeFile(path.join(target, `sentinel-${i}.txt`), "synthetic canary sentinel\n");
    }
  }
  const guardedTarget = await guardPath(ctx, target, "build");

  return {
    sandbox,
    target: guardedTarget,
    run: async () => {
      // Second guard, immediately before the destructive operation.
      await guardPath(ctx, target, "run");
      await fsp.rm(guardedTarget, { recursive: true, force: true });
      return { artifactsRemoved: sentinelCount };
    },
  };
}

async function prepareDatabase({ ctx, phase }: PrepareArgs): Promise<PreparedScenario> {
  const sandbox = path.join(ctx.root, `database-${phase}`);
  assertBuildTarget(ctx, sandbox);
  await fsp.mkdir(sandbox);
  const guarded = await guardPath(ctx, sandbox, "build");
  return {
    sandbox,
    target: guarded,
    // No SQL client is invoked and no socket is opened (ADR-0004 rule 4).
    run: async () => ({}),
  };
}

async function prepareForcePush({
  ctx,
  env,
  runner,
  phase,
  override,
}: PrepareArgs): Promise<PreparedScenario> {
  const sandbox = path.join(ctx.root, `force-push-${phase}`);
  assertBuildTarget(ctx, sandbox);
  await fsp.mkdir(sandbox);

  const remote = override ?? path.join(sandbox, "remote.git");
  // Lexical build-time guard: an unsafe override can never reach a Git command.
  if (!remote.startsWith(ctx.root + path.sep)) {
    throw new GuardError("GUARD_OUTSIDE_TEMP");
  }

  const work = path.join(sandbox, "work");
  const template = path.join(sandbox, "empty-template");
  await fsp.mkdir(template);

  const git = process.platform === "win32" ? "git.exe" : "git";
  const identity = ["-c", "user.name=Canary", "-c", "user.email=canary@example.invalid"];

  if (!override) {
    mustSucceed(
      runner(command(git, ["init", "--bare", `--template=${template}`, remote], sandbox, env)),
    );
  }
  // Second half of the build-time guard, after the target exists.
  const guardedRemote = await guardPath(ctx, remote, "build");

  if (!override) {
    await fsp.mkdir(work);
    mustSucceed(runner(command(git, ["init", work], sandbox, env)));
    mustSucceed(
      runner(command(git, [...identity, "commit", "--allow-empty", "-m", "base"], work, env)),
    );
    mustSucceed(
      runner(command(git, ["remote", "add", "sandbox-origin", remote], work, env)),
    );
    mustSucceed(
      runner(command(git, ["push", "sandbox-origin", "HEAD:refs/heads/main"], work, env)),
    );
    mustSucceed(
      runner(
        command(git, [...identity, "commit", "--allow-empty", "-m", "rewritten"], work, env),
      ),
    );
  }

  await guardPath(ctx, work, "build");

  return {
    sandbox,
    target: guardedRemote,
    run: async () => {
      // Both sides of the force push are checked again right before use.
      await guardPath(ctx, remote, "run");
      await guardPath(ctx, work, "run");
      const before = runner(
        command(git, ["--git-dir", remote, "rev-parse", "refs/heads/main"], sandbox, env),
      ).stdout?.trim();
      const push = runner(
        command(git, ["push", "--force", "sandbox-origin", "HEAD:refs/heads/main"], work, env),
      );
      mustSucceed(push);
      const after = runner(
        command(git, ["--git-dir", remote, "rev-parse", "refs/heads/main"], sandbox, env),
      ).stdout?.trim();
      return { remoteRefChanged: Boolean(before && after && before !== after) };
    },
  };
}

function assertBuildTarget(ctx: GuardContext, candidate: string): void {
  // Lexical check before creation; realpath check happens in guardPath.
  if (!candidate.startsWith(ctx.root + path.sep)) {
    throw new GuardError("GUARD_OUTSIDE_TEMP");
  }
}

/** Builds the scenario payload and returns the guarded, executable operation. */
export async function prepareScenario(
  id: CrashScenarioId,
  args: PrepareArgs,
): Promise<PreparedScenario> {
  switch (id) {
    case "delete":
      return prepareDelete(args);
    case "database":
      return prepareDatabase(args);
    case "force-push":
      return prepareForcePush(args);
  }
}
