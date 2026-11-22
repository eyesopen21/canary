/**
 * Exact message templates from docs/specs/policy.md#message-text.
 *
 * This module is pure: it performs no I/O, reads no environment and never
 * produces a secret, a host or a command value as text.
 */

import type { RuleId } from "../contract.ts";

/** Trigger words listed in policy.md#evaluation (B0). */
export const TRIGGER_WORDS = [
  "rm",
  "rimraf",
  "Remove-Item",
  "rmdir",
  "rd",
  "DROP",
  "TRUNCATE",
  "migrate",
  "push",
  "-auto-approve",
] as const;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REMOTE_NAME = /^[A-Za-z0-9._-]+$/;
const CLEAN_FLAGS = /^-[A-Za-z]+( -[A-Za-z]+)*$/;

const EFFECTS = [
  "DROPS tables",
  "DROPS the database or schema",
  "TRUNCATES tables (deletes every row)",
  "DELETES every row of a table",
  "DROPS a MongoDB database or collection",
  "applies or reverts schema migrations, which can drop tables or columns",
  "RESETS the database schema",
] as const;

// Fixed effects exported so the classifier never invents prose.
export const EFFECT = {
  dropsTables: EFFECTS[0],
  dropsDatabaseOrSchema: EFFECTS[1],
  truncatesTables: EFFECTS[2],
  deletesEveryRow: EFFECTS[3],
  dropsMongo: EFFECTS[4],
  migrations: EFFECTS[5],
  resetsSchema: EFFECTS[6],
} as const;

/** The one non-identifier value that policy.md defines for {var}. */
export const HOST_ARGUMENT = "the --host argument";

function sanitizeTarget(value: string | undefined): string {
  const cleaned = (value ?? "").replace(CONTROL_CHARS, "");
  const truncated = cleaned.length > 80 ? cleaned.slice(0, 80) : cleaned;
  return `\`${truncated}\``;
}

function sanitizeToken(value: string | undefined): string {
  const raw = value ?? "";
  const match = TRIGGER_WORDS.find((word) => word.toLowerCase() === raw.toLowerCase());
  // A B0 message must always name one of the fixed trigger words.
  return match ?? "rm";
}

function sanitizeVar(value: string | undefined): string {
  const raw = value ?? "";
  if (raw === HOST_ARGUMENT) return raw; // Fixed policy text, not user input.
  return IDENTIFIER.test(raw) ? `\`${raw}\`` : "the database connection setting";
}

function sanitizeEffect(value: string | undefined): string {
  const raw = value ?? "";
  const match = EFFECTS.find((effect) => effect === raw);
  return match ?? EFFECT.migrations;
}

function sanitizeRemote(value: string | undefined): string {
  const raw = value ?? "";
  return REMOTE_NAME.test(raw) ? `\`${raw}\`` : "the remote";
}

function sanitizeTool(value: string | undefined): string {
  return value === "tofu" ? "tofu" : "terraform";
}

function sanitizeSubcommand(value: string | undefined): string {
  return value === "destroy" ? "destroy" : "apply";
}

function sanitizeFlags(value: string | undefined): string {
  const raw = value ?? "";
  return CLEAN_FLAGS.test(raw) ? raw : "-f";
}

/**
 * Render the exact template for a rule with policy.md placeholder sanitization.
 */
export function getMessage(rule: RuleId, values: Record<string, string>): string {
  switch (rule) {
    case "B0":
      return `Canary blocked this command. Danger: it contains "${sanitizeToken(values.token)}", which Canary treats as destructive, but Canary could not parse the command. Consequence: Canary cannot tell what it would delete or change. Instead: split it into simple commands without nested substitutions.`;

    case "B1a":
      return `Canary blocked a recursive delete. Danger: the target ${sanitizeTarget(values.target)} contains a variable or command substitution that Canary cannot resolve before it runs. Consequence: if it expands to an empty or wrong path, the command deletes files outside the intended folder, and they cannot be restored from this machine. Instead: use a literal path inside the project.`;

    case "B1b":
      return `Canary blocked a recursive delete. Danger: the pattern ${sanitizeTarget(values.target)} matches nothing or matches paths outside the project root. Consequence: the command could delete files that are not part of this project, and they cannot be restored from this machine. Instead: use a literal path inside the project.`;

    case "B1c":
      return `Canary blocked a recursive delete. Danger: ${sanitizeTarget(values.target)} resolves to a path outside the project root, directly or through a link. Consequence: the command deletes files that are not part of this project, and they cannot be restored from this machine. Instead: delete only paths inside the project.`;

    case "B1d":
      return `Canary blocked a recursive delete. Danger: ${sanitizeTarget(values.target)} is the project root, your home directory, or a filesystem root. Consequence: the command deletes everything under it, and it cannot be restored from this machine. Instead: delete the specific subfolder you mean.`;

    case "B1e":
      return `Canary blocked a recursive delete. Danger: Canary could not determine the project root, so it cannot check where ${sanitizeTarget(values.target)} points. Consequence: the command could delete files outside the project, and they cannot be restored from this machine. Instead: run the agent from the project folder, or ask a human to run this command.`;

    case "B2": {
      const variable = sanitizeVar(values.var);
      return `Canary blocked a destructive database command. Danger: ${variable} points to a non-local host, which may be production. Consequence: this command ${sanitizeEffect(values.effect)}, and the data cannot be recovered from this machine. Instead: point ${variable} to a local database, or ask a human to run this command.`;
    }

    case "B3": {
      const remote = sanitizeRemote(values.remote);
      return `Canary blocked a force push. Danger: this push rewrites history on ${remote}. Consequence: commits that exist only on ${remote} are lost for everyone who uses it. Instead: push without forcing, or ask a human to approve a force push.`;
    }

    case "B4": {
      const tool = sanitizeTool(values.tool);
      return `Canary blocked an infrastructure change without review. Danger: ${tool} ${sanitizeSubcommand(values.subcommand)} with -auto-approve applies changes without showing the plan for approval. Consequence: it can destroy or replace live infrastructure, and deleted resources may not be recoverable. Instead: run ${tool} plan and let a human review and apply it.`;
    }

    case "W1": {
      const remote = sanitizeRemote(values.remote);
      return `Canary warning. Danger: --force-with-lease still overwrites commits on ${remote} that your local copy has fetched but not merged. Consequence: those commits are lost for everyone who uses ${remote}. Use it only on a branch nobody else pushes to.`;
    }

    case "W2":
      return `Canary warning. Danger: git reset --hard discards every uncommitted change in this working tree. Consequence: those changes cannot be recovered with Git.`;

    case "W3":
      return `Canary warning. Danger: git clean ${sanitizeFlags(values.flags)} deletes untracked files in this working tree. Consequence: they are not in Git and cannot be recovered with Git.`;
  }
}
