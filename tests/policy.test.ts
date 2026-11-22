/**
 * CAN-T-03 policy table: examples from docs/specs/policy.md plus every rule.
 * All hosts and credential-shaped values below are synthetic marker fixtures.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { Decision, EvaluationInput, EvaluationResult, RuleId } from "../src/contract.ts";
import { evaluate } from "../src/core/evaluate.ts";
import { EFFECT, getMessage } from "../src/core/messages.ts";

const MARKER = "SYNTHETIC-CANARY-MARKER";
const CLOUD_URL = `postgresql://user:${MARKER}@${MARKER}.synthetic.invalid:5432/app`;
const CLOUD_HOST = `${MARKER}.synthetic.invalid`;

let project: string;
let linkCreated = false;
let composeProject: string;

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canary-wp01-"));
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules", ".cache"), { recursive: true });
  const link = path.join(root, "node_modules", ".cache", "link");
  try {
    fs.symlinkSync(os.homedir(), link, process.platform === "win32" ? "junction" : "dir");
    linkCreated = true;
  } catch {
    // A symlink to the home directory needs extra privileges on some hosts.
    linkCreated = false;
  }
  return root;
}

function makeComposeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canary-wp01-compose-"));
  fs.writeFileSync(
    path.join(root, "docker-compose.yml"),
    "services:\n  db:\n    image: postgres:16\n    ports:\n      - '5432:5432'\n",
    "utf8",
  );
  return root;
}

before(() => {
  project = makeProject();
  composeProject = makeComposeProject();
});

after(() => {
  const link = path.join(project, "node_modules", ".cache", "link");
  try {
    fs.rmSync(link, { force: true });
  } catch {
    // Nothing to remove.
  }
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(composeProject, { recursive: true, force: true });
});

function input(command: string, extra: Partial<EvaluationInput> = {}): EvaluationInput {
  return { command, projectRoot: project, cwd: project, env: {}, ...extra };
}

interface Case {
  name: string;
  given: EvaluationInput;
  decision: Decision;
  rule?: RuleId;
  values?: Record<string, string>;
}

function check(testCase: Case): void {
  const result: EvaluationResult = evaluate(testCase.given);
  assert.equal(result.decision, testCase.decision, testCase.name);
  assert.equal(result.rule, testCase.rule, `${testCase.name}: rule`);
  if (testCase.rule && testCase.values) {
    assert.equal(result.message, getMessage(testCase.rule, testCase.values), testCase.name);
  } else if (testCase.decision === "allow") {
    assert.equal(result.message, undefined, `${testCase.name}: allow is silent`);
  }
  if (result.message) {
    assert.ok(!result.message.includes(MARKER), `${testCase.name}: marker leaked`);
    assert.ok(!result.message.includes(CLOUD_HOST), `${testCase.name}: host leaked`);
  }
}

// Every command in policy.md#examples and one case for each rule.
const table: Case[] = [
  { name: "npm test", given: input("npm test"), decision: "allow" },
  { name: "rm -rf dist (inside project)", given: input("rm -rf dist"), decision: "allow" },
  {
    name: 'rm -rf "$BUILD_DIR"',
    given: input('rm -rf "$BUILD_DIR"'),
    decision: "block",
    rule: "B1a",
    values: { target: '"$BUILD_DIR"' },
  },
  {
    name: "rm -rf ./* from project root",
    given: input("rm -rf ./*"),
    decision: "block",
    rule: "B1d",
    values: { target: "./*" },
  },
  {
    name: "rm -rf ../shared",
    given: input("rm -rf ../shared"),
    decision: "block",
    rule: "B1c",
    values: { target: "../shared" },
  },
  {
    name: "rm -rf node_modules/.cache/link (link to home)",
    given: input("rm -rf node_modules/.cache/link"),
    decision: "block",
    rule: "B1c",
    values: { target: "node_modules/.cache/link" },
  },
  {
    name: "npx prisma migrate reset with cloud DATABASE_URL",
    given: input("npx prisma migrate reset", { env: { DATABASE_URL: CLOUD_URL } }),
    decision: "block",
    rule: "B2",
    values: { var: "DATABASE_URL", effect: EFFECT.resetsSchema },
  },
  {
    name: "npx prisma migrate reset with localhost DATABASE_URL",
    given: input("npx prisma migrate reset", { env: { DATABASE_URL: "postgresql://u:p@localhost:5432/app" } }),
    decision: "allow",
  },
  {
    name: 'psql -c "DROP TABLE users" with no host set',
    given: input('psql -c "DROP TABLE users"'),
    decision: "allow",
  },
  {
    name: "git push --force origin main",
    given: input("git push --force origin main"),
    decision: "block",
    rule: "B3",
    values: { remote: "origin" },
  },
  {
    name: "git push --force-with-lease",
    given: input("git push --force-with-lease"),
    decision: "warn",
    rule: "W1",
    values: { remote: "the remote" },
  },
  {
    name: "terraform apply -auto-approve",
    given: input("terraform apply -auto-approve"),
    decision: "block",
    rule: "B4",
    values: { tool: "terraform", subcommand: "apply" },
  },
  { name: "terraform plan", given: input("terraform plan"), decision: "allow" },
  {
    name: "npm run clean && rm -rf $(cat dirs.txt)",
    given: input("npm run clean && rm -rf $(cat dirs.txt)"),
    decision: "block",
    rule: "B1a",
    values: { target: "$(cat dirs.txt)" },
  },
  { name: "bash ./scripts/reset-db.sh", given: input("bash ./scripts/reset-db.sh"), decision: "allow" },

  // B1a–B1e coverage beyond the examples.
  {
    name: "B1b: glob matching nothing",
    given: input("rm -rf *.does-not-exist"),
    decision: "block",
    rule: "B1b",
    values: { target: "*.does-not-exist" },
  },
  {
    name: "B1b: glob expanding outside the project",
    given: input("rm -rf ../*"),
    decision: "block",
    rule: "B1b",
    values: { target: "../*" },
  },
  {
    name: "B1e: project root unknown",
    given: { command: "rm -rf dist", env: {} },
    decision: "block",
    rule: "B1e",
    values: { target: "dist" },
  },
  {
    name: "B1a: PowerShell style variable",
    given: input("rm -rf %BUILD_DIR%"),
    decision: "block",
    rule: "B1a",
    values: { target: "%BUILD_DIR%" },
  },
  {
    name: "B1b: rimraf with empty glob",
    given: input("rimraf no-such-*.dir"),
    decision: "block",
    rule: "B1b",
    values: { target: "no-such-*.dir" },
  },
  {
    name: "B1c: find -delete outside the project",
    given: input("find .. -name 'x' -delete"),
    decision: "block",
    rule: "B1c",
    values: { target: ".." },
  },
  {
    name: "find -delete inside the project is allowed",
    given: input("find ./dist -name '*.log' -delete"),
    decision: "allow",
  },

  // B0 / unparseable input.
  {
    name: "B0: unbalanced quote with trigger word",
    given: input('rm -rf "dist'),
    decision: "block",
    rule: "B0",
    values: { token: "rm" },
  },
  { name: "unparseable without trigger word", given: input('echo "hello'), decision: "allow" },
  {
    name: "B0: here-doc without closing delimiter",
    given: input("psql <<SQL\nDROP TABLE users;"),
    decision: "block",
    rule: "B0",
    values: { token: "DROP" },
  },

  // Warning rules and combination order.
  { name: "W2: git reset --hard", given: input("git reset --hard"), decision: "warn", rule: "W2", values: {} },
  {
    name: "W3: git clean -fd",
    given: input("git clean -fd"),
    decision: "warn",
    rule: "W3",
    values: { flags: "-fd" },
  },
  {
    name: "W3: git clean -f -X",
    given: input("git clean -f -X"),
    decision: "warn",
    rule: "W3",
    values: { flags: "-f -X" },
  },
  {
    name: "block wins over warning",
    given: input("git reset --hard && git push --force origin main"),
    decision: "block",
    rule: "B3",
    values: { remote: "origin" },
  },
  {
    name: "first blocking segment wins",
    given: input('git push --force origin main && rm -rf "$BUILD_DIR"'),
    decision: "block",
    rule: "B3",
    values: { remote: "origin" },
  },
  {
    name: "nested shell body is classified",
    given: input(`bash -c 'rm -rf "$BUILD_DIR"'`),
    decision: "block",
    rule: "B1a",
    values: { target: '"$BUILD_DIR"' },
  },

  // B2 host resolution variants.
  {
    name: "B2 from --host argument",
    given: input(`psql -h ${CLOUD_HOST} -c "DROP TABLE users"`),
    decision: "block",
    rule: "B2",
    values: { var: "the --host argument", effect: EFFECT.dropsTables },
  },
  {
    name: "B2 from inline variable",
    given: input(`DATABASE_URL=${CLOUD_URL} npx prisma migrate deploy`),
    decision: "block",
    rule: "B2",
    values: { var: "DATABASE_URL", effect: EFFECT.migrations },
  },
  {
    name: "B2 when a host variable is set but unparseable",
    given: input("npx prisma migrate deploy", { env: { DATABASE_URL: "" } }),
    decision: "block",
    rule: "B2",
    values: { var: "DATABASE_URL", effect: EFFECT.migrations },
  },
  {
    name: "B2 local 127.0.0.1",
    given: input("npx prisma migrate deploy", { env: { PGHOST: "127.0.0.1" } }),
    decision: "allow",
  },
  {
    name: "B2 local ::1",
    given: input("npx prisma migrate deploy", { env: { PGHOST: "::1" } }),
    decision: "allow",
  },
  {
    name: "B2 local unix socket",
    given: input("npx prisma migrate deploy", { env: { DATABASE_URL: "/var/run/postgresql/.s.PGSQL.5432" } }),
    decision: "allow",
  },
  {
    name: "B2 local .localhost name",
    given: input("npx prisma migrate deploy", { env: { PGHOST: "db.localhost" } }),
    decision: "allow",
  },
  {
    name: "B2 mongosh dropDatabase",
    given: input("mongosh --eval 'db.dropDatabase()'", { env: { MONGODB_URI: `mongodb://${CLOUD_HOST}:27017` } }),
    decision: "block",
    rule: "B2",
    values: { var: "MONGODB_URI", effect: EFFECT.dropsMongo },
  },
  {
    name: "B2 DELETE FROM without WHERE",
    given: input('psql -c "DELETE FROM users"', { env: { DATABASE_URL: CLOUD_URL } }),
    decision: "block",
    rule: "B2",
    values: { var: "DATABASE_URL", effect: EFFECT.deletesEveryRow },
  },
  {
    name: "DELETE FROM with WHERE is allowed",
    given: input('psql -c "DELETE FROM users WHERE id = 1"', { env: { DATABASE_URL: CLOUD_URL } }),
    decision: "allow",
  },
  {
    name: "B2 TRUNCATE",
    given: input('psql -c "TRUNCATE users"', { env: { DATABASE_URL: CLOUD_URL } }),
    decision: "block",
    rule: "B2",
    values: { var: "DATABASE_URL", effect: EFFECT.truncatesTables },
  },
  {
    name: "B2 DROP DATABASE via --command=",
    given: input('psql --command="DROP DATABASE app"', { env: { DATABASE_URL: CLOUD_URL } }),
    decision: "block",
    rule: "B2",
    values: { var: "DATABASE_URL", effect: EFFECT.dropsDatabaseOrSchema },
  },
  {
    name: "unrelated environment variables do not set a host",
    given: input('psql -c "DROP TABLE users"', { env: { UNRELATED: CLOUD_HOST } }),
    decision: "allow",
  },

  // B3 variants.
  {
    name: "B3 combined short flag",
    given: input("git push -f origin main"),
    decision: "block",
    rule: "B3",
    values: { remote: "origin" },
  },
  {
    name: "B3 --mirror",
    given: input("git push --mirror origin"),
    decision: "block",
    rule: "B3",
    values: { remote: "origin" },
  },
  {
    name: "B3 refspec starting with +",
    given: input("git push origin +main:main"),
    decision: "block",
    rule: "B3",
    values: { remote: "origin" },
  },
  {
    name: "B3 sanitizes a URL remote",
    given: input(`git push --force https://user:${MARKER}@${CLOUD_HOST}/repo.git`),
    decision: "block",
    rule: "B3",
    values: { remote: "the remote" },
  },
  {
    name: "W1 sanitizes a URL remote",
    given: input(`git push --force-with-lease https://user:${MARKER}@${CLOUD_HOST}/repo.git`),
    decision: "warn",
    rule: "W1",
    values: { remote: "the remote" },
  },

  // B4 variants.
  {
    name: "B4 tofu destroy",
    given: input("tofu destroy --auto-approve"),
    decision: "block",
    rule: "B4",
    values: { tool: "tofu", subcommand: "destroy" },
  },
  { name: "tofu apply without approval flag", given: input("tofu apply"), decision: "allow" },
];

for (const testCase of table) {
  if (testCase.name.includes("link to home") && !linkCreated) continue;
  test(`policy: ${testCase.name}`, () => check(testCase));
}

test("compose service name counts as a local host", () => {
  check({
    name: "compose service is local",
    given: {
      command: "npx prisma migrate reset",
      cwd: composeProject,
      projectRoot: composeProject,
      env: { DATABASE_URL: `postgresql://user:${MARKER}@db:5432/app` },
    },
    decision: "allow",
  });
});

test("exact message text matches docs/specs/policy.md#message-text", () => {
  const values = {
    token: "rm",
    target: "dist",
    var: "DATABASE_URL",
    effect: EFFECT.dropsTables,
    remote: "origin",
    tool: "terraform",
    subcommand: "apply",
    flags: "-f -d",
  };
  const expected: Array<[RuleId, string]> = [
    ["B0", 'Canary blocked this command. Danger: it contains "rm", which Canary treats as destructive, but Canary could not parse the command. Consequence: Canary cannot tell what it would delete or change. Instead: split it into simple commands without nested substitutions.'],
    ["B1a", "Canary blocked a recursive delete. Danger: the target `dist` contains a variable or command substitution that Canary cannot resolve before it runs. Consequence: if it expands to an empty or wrong path, the command deletes files outside the intended folder, and they cannot be restored from this machine. Instead: use a literal path inside the project."],
    ["B1b", "Canary blocked a recursive delete. Danger: the pattern `dist` matches nothing or matches paths outside the project root. Consequence: the command could delete files that are not part of this project, and they cannot be restored from this machine. Instead: use a literal path inside the project."],
    ["B1c", "Canary blocked a recursive delete. Danger: `dist` resolves to a path outside the project root, directly or through a link. Consequence: the command deletes files that are not part of this project, and they cannot be restored from this machine. Instead: delete only paths inside the project."],
    ["B1d", "Canary blocked a recursive delete. Danger: `dist` is the project root, your home directory, or a filesystem root. Consequence: the command deletes everything under it, and it cannot be restored from this machine. Instead: delete the specific subfolder you mean."],
    ["B1e", "Canary blocked a recursive delete. Danger: Canary could not determine the project root, so it cannot check where `dist` points. Consequence: the command could delete files outside the project, and they cannot be restored from this machine. Instead: run the agent from the project folder, or ask a human to run this command."],
    ["B2", "Canary blocked a destructive database command. Danger: `DATABASE_URL` points to a non-local host, which may be production. Consequence: this command DROPS tables, and the data cannot be recovered from this machine. Instead: point `DATABASE_URL` to a local database, or ask a human to run this command."],
    ["B3", "Canary blocked a force push. Danger: this push rewrites history on `origin`. Consequence: commits that exist only on `origin` are lost for everyone who uses it. Instead: push without forcing, or ask a human to approve a force push."],
    ["B4", "Canary blocked an infrastructure change without review. Danger: terraform apply with -auto-approve applies changes without showing the plan for approval. Consequence: it can destroy or replace live infrastructure, and deleted resources may not be recoverable. Instead: run terraform plan and let a human review and apply it."],
    ["W1", "Canary warning. Danger: --force-with-lease still overwrites commits on `origin` that your local copy has fetched but not merged. Consequence: those commits are lost for everyone who uses `origin`. Use it only on a branch nobody else pushes to."],
    ["W2", "Canary warning. Danger: git reset --hard discards every uncommitted change in this working tree. Consequence: those changes cannot be recovered with Git."],
    ["W3", "Canary warning. Danger: git clean -f -d deletes untracked files in this working tree. Consequence: they are not in Git and cannot be recovered with Git."],
  ];
  for (const [rule, message] of expected) {
    assert.equal(getMessage(rule, values), message, `message for ${rule}`);
  }
});

test("placeholder sanitization", () => {
  const longTarget = `a\u0001${"x".repeat(100)}`;
  const truncated = getMessage("B1c", { target: longTarget });
  assert.ok(!truncated.includes("\u0001"));
  assert.ok(truncated.includes("`" + "a" + "x".repeat(79) + "`"));

  const unsafeVar = getMessage("B2", { var: `https://user:${MARKER}@host`, effect: EFFECT.dropsTables });
  assert.ok(unsafeVar.includes("the database connection setting"));
  assert.ok(!unsafeVar.includes(MARKER));

  const hostArg = getMessage("B2", { var: "the --host argument", effect: EFFECT.dropsTables });
  assert.ok(hostArg.includes("the --host argument"));

  const urlRemote = getMessage("B3", { remote: `https://user:${MARKER}@${CLOUD_HOST}/repo.git` });
  assert.ok(urlRemote.includes("`the remote`") === false);
  assert.ok(urlRemote.includes("the remote"));
  assert.ok(!urlRemote.includes(MARKER));

  const badFlags = getMessage("W3", { flags: "-f; rm -rf /" });
  assert.ok(badFlags.includes("git clean -f deletes"));
});
