import test from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixtures = join(root, "fixtures");
const cli = join(root, "bin", "canary.js");
const marker = "CANARY_SYNTHETIC_MARKER_7f3a";

const AGENTS = ["claude-code", "codex", "cursor", "gemini-cli", "opencode"] as const;
type Agent = typeof AGENTS[number];

function freshDirectory(): string {
  return mkdtempSync(join(tmpdir(), "canary-acceptance-"));
}

function withFreshDirectory<T>(run: (directory: string) => T): T {
  const directory = freshDirectory();
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function isolatedEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    CANARY_HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const name of ["SystemRoot", "WINDIR", "PATHEXT"]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

function runCli(args: string[], cwd: string, home: string, input?: string) {
  return spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", cli, ...args], {
    cwd,
    env: isolatedEnv(home),
    input,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function copyTrap(name: string, target: string): string {
  const source = name === "trap-c2" ? join(fixtures, name, "repo") : join(fixtures, name);
  const destination = join(target, "repo");
  cpSync(source, destination, { recursive: true });
  return destination;
}

function runGit(args: string[], cwd: string, home: string): void {
  const result = spawnSync("git", args, {
    cwd,
    env: isolatedEnv(home),
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function allFilePaths(directory: string): string[] {
  const found: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else found.push(relative(directory, full).replace(/\\/g, "/"));
    }
  };
  visit(directory);
  return found.sort();
}

function assertNoMarker(...values: string[]): void {
  for (const value of values) assert.ok(!value.includes(marker), "synthetic marker leaked into Canary output");
}

test("CAN-T-01/07/08: CLI scans isolated trap repositories deterministically and safely", async (t) => {
  const traps = [
    ["trap-c1", "C1"],
    ["trap-c2", "C2"],
    ["trap-c3", "C3"],
    ["trap-c8", "C8"],
    ["trap-c9", "C9"],
  ] as const;

  for (const [trap, expectedCheck] of traps) {
    await t.test(`${trap} reports ${expectedCheck}`, () => withFreshDirectory((temp) => {
      const repo = copyTrap(trap, temp);
      const home = join(temp, "synthetic-home");
      mkdirSync(home, { recursive: true });

      if (trap === "trap-c2") {
        const syntheticHomeFixture = join(fixtures, "trap-c2", "home");
        cpSync(syntheticHomeFixture, home, { recursive: true });
        // C2 only inspects Git tracked files. Stage fixture inputs in the copied
        // repository so the test exercises that actual boundary.
        runGit(["init", "--quiet"], repo, home);
        runGit(["add", "-A"], repo, home);
      }

      const first = runCli(["scan", "--json", "--badge"], repo, home);
      assert.equal(first.status, 0, `${first.stderr}`);
      assert.equal(first.stderr, "");
      const firstDocument = JSON.parse(first.stdout);
      assert.ok(firstDocument.findings.some((finding: { check: string }) => finding.check === expectedCheck));
      assert.equal(firstDocument.schema_version, 1);
      assert.equal(firstDocument.tool.name, "canary");
      assert.equal(firstDocument.summary.critical + firstDocument.summary.high
        + firstDocument.summary.medium + firstDocument.summary.low, firstDocument.findings.length);

      const findingsPath = join(repo, "canary", "findings.json");
      const badgePath = join(repo, "canary", "badge.svg");
      const firstBytes = readFileSync(findingsPath, "utf8");
      const badge = readFileSync(badgePath, "utf8");
      assertNoMarker(first.stdout, first.stderr, firstBytes, badge);
      assert.match(badge, new RegExp(`<svg[^>]*>[\\s\\S]*Canary score ${firstDocument.score}/100[\\s\\S]*<\\/svg>`));
      assert.doesNotMatch(badge, /finding|danger|consequence|credential/i);

      // Normal summary mode remains safe and scan order does not affect the
      // canonical persisted report, even when the second invocation differs.
      const second = runCli(["scan"], repo, home);
      assert.equal(second.status, 0, second.stderr);
      assert.equal(second.stderr, "");
      assert.match(second.stdout, /^Blast Radius Score \d+\/100\n\d+ critical · \d+ high · \d+ medium · \d+ low\n/);
      assertNoMarker(second.stdout, second.stderr, readFileSync(findingsPath, "utf8"));
      assert.equal(readFileSync(findingsPath, "utf8"), firstBytes);

      const remakeBadge = runCli(["badge"], repo, home);
      assert.equal(remakeBadge.status, 0, remakeBadge.stderr);
      assert.equal(remakeBadge.stdout, "");
      assert.equal(remakeBadge.stderr, "");
      assert.equal(readFileSync(badgePath, "utf8"), badge);
      assertNoMarker(...allFilePaths(join(repo, "canary")).map((file) => readFileSync(join(repo, "canary", file), "utf8")));
    }));
  }

  await t.test("clean repository has no findings and a perfect score", () => withFreshDirectory((temp) => {
    const repo = copyTrap("clean", temp);
    const home = join(temp, "synthetic-home");
    mkdirSync(home, { recursive: true });
    const result = runCli(["scan", "--json", "--badge"], repo, home);
    assert.equal(result.status, 0, result.stderr);
    const document = JSON.parse(result.stdout);
    assert.deepEqual(document.findings, []);
    assert.equal(document.score, 100);
    assert.deepEqual(document.summary, { critical: 0, high: 0, medium: 0, low: 0 });
    assertNoMarker(result.stdout, readFileSync(join(repo, "canary", "findings.json"), "utf8"));
    assert.match(readFileSync(join(repo, "canary", "badge.svg"), "utf8"), /Canary score 100\/100/);
  }));
});

test("CAN-T-04: real CLI hook contracts accept synthetic events for all five agents", () => withFreshDirectory((temp) => {
  const repo = join(temp, "hook-root");
  const home = join(temp, "synthetic-home");
  mkdirSync(repo, { recursive: true });
  mkdirSync(home, { recursive: true });

  const eventByAgent: Record<Agent, Record<string, unknown>> = {
    "claude-code": {
      tool_name: "Bash",
      tool_input: { command: `git push --force origin ${marker}` },
      cwd: repo,
      permission_mode: "default",
    },
    codex: {
      tool_name: "Bash",
      tool_input: { command: `git push --force origin ${marker}` },
      cwd: repo,
    },
    cursor: {
      tool_name: "Shell",
      tool_input: { command: `git push --force origin ${marker}`, working_directory: repo },
      cwd: repo,
      workspace_roots: [repo],
      user_email: `synthetic-${marker}@example.invalid`,
    },
    "gemini-cli": {
      tool_name: "run_shell_command",
      tool_input: { command: `git push --force origin ${marker}`, dir_path: repo },
      cwd: repo,
    },
    opencode: { action: "shell", resources: `git push --force origin ${marker}` },
  };

  for (const agent of AGENTS) {
    const result = runCli(["hook", "--agent", agent], repo, home, JSON.stringify(eventByAgent[agent]));
    assert.equal(result.status, 0, `${agent}: ${result.stderr}`);
    assert.equal(result.stderr, "", agent);
    const output = JSON.parse(result.stdout);
    switch (agent) {
      case "claude-code":
      case "codex":
        assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
        assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
        assert.equal(output.hookSpecificOutput.permissionDecisionReason, output.systemMessage);
        break;
      case "cursor":
        assert.equal(output.permission, "deny");
        assert.equal(output.user_message, output.agent_message);
        break;
      case "gemini-cli":
        assert.equal(output.decision, "deny");
        assert.equal(output.reason, output.systemMessage);
        break;
      case "opencode":
        assert.equal(output.effect, "deny");
        assert.equal(typeof output.message, "string");
        break;
    }
    assertNoMarker(result.stdout, result.stderr);
  }

  assert.deepEqual(allFilePaths(repo), [], "block events should not create logs or reports");
}));

const initTargets: Record<Agent, string[]> = {
  "claude-code": [".claude/settings.json"],
  codex: [".codex/hooks.json"],
  cursor: [".cursor/hooks.json"],
  "gemini-cli": [".gemini/settings.json"],
  opencode: ["opencode.jsonc", ".opencode/plugins/canary/index.ts"],
};

function seedConfig(repo: string, agent: Agent): string | undefined {
  const target = initTargets[agent][0]!;
  const full = join(repo, target);
  mkdirSync(join(full, ".."), { recursive: true });
  if (agent === "opencode") {
    writeFileSync(full, `// user config stays intact\n{\n  "name": "existing-${marker}",\n  "permissions": [\n    {"action":"read","resource":"*","effect":"allow"}, // keep this comment\n  ],\n}\n`);
  } else {
    const settingKey = agent === "cursor" ? "preToolUse" : agent === "gemini-cli" ? "BeforeTool" : "PreToolUse";
    const matcher = agent === "cursor" ? "Shell" : agent === "gemini-cli" ? "run_shell_command" : agent === "claude-code" ? "Bash|PowerShell" : "^Bash$";
    const canaryCommand = `canary hook --agent ${agent}`;
    const otherHook = { type: "command", command: "other-tool --check" };
    const canaryHook = agent === "cursor"
      ? { command: canaryCommand, matcher, timeout: 1 }
      : { type: "command", command: canaryCommand };
    const group = agent === "cursor"
      ? [canaryHook, otherHook]
      : [{ matcher, hooks: [canaryHook, otherHook] }];
    const config = {
      userNote: `retain-${marker}`,
      ...(agent === "cursor" ? { version: 1 } : {}),
      hooks: { [settingKey]: group, UserEvent: [{ marker: "preserve" }] },
    };
    writeFileSync(full, JSON.stringify(config, null, 2) + "\n");
  }
  return full;
}

function assertInitialized(agent: Agent, configPath: string, output: string): void {
  const assertBuiltCommand = (command: string, agent: Agent): void => {
    assert.match(command, /^node\s/);
    assert.match(command, new RegExp(`dist[\\\\/]hook[\\\\/]${agent}\\.mjs`));
    assert.doesNotMatch(command, /entry\.js/);
    assert.doesNotMatch(command, /\bcanary(?:\.cmd)?\s+hook/);
    assert.doesNotMatch(command, /--agent/);
    const quotedPath = command.match(/^node\s+["']([^"']+)["']\s*$/);
    assert.ok(quotedPath, "generated command must quote the bundle path");
    assert.ok(isAbsolute(quotedPath[1]), "generated bundle path must be absolute");
  };
  switch (agent) {
    case "claude-code": {
      const config = readJson(configPath);
      assert.equal(config.userNote, `retain-${marker}`);
      const group = config.hooks.PreToolUse.find((item: any) => item.matcher === "Bash|PowerShell");
      const hooks = group.hooks.filter((hook: any) => hook.command === "node" && Array.isArray(hook.args)
        && hook.args.length === 1 && hook.args[0].endsWith("claude-code.mjs"));
      assert.equal(hooks.length, 1);
      assert.ok(group.hooks.some((hook: any) => hook.command === "other-tool --check"));
      assert.match(hooks[0].args[0], /dist[\\/]hook[\\/]claude-code\.mjs$/);
      assert.ok(isAbsolute(hooks[0].args[0]), "Claude Code build path must be absolute");
      assert.equal(hooks[0].onFailure, "block");
      assert.doesNotMatch(output, new RegExp(marker));
      break;
    }
    case "codex": {
      const config = readJson(configPath);
      const group = config.hooks.PreToolUse.find((item: any) => item.matcher === "^Bash$");
      const hooks = group.hooks.filter((hook: any) => hook.command.includes("codex.mjs"));
      assert.equal(hooks.length, 1);
      assertBuiltCommand(hooks[0].command, "codex");
      assert.ok(group.hooks.some((hook: any) => hook.command === "other-tool --check"));
      assert.match(output, /hook failure lets the command run/);
      break;
    }
    case "cursor": {
      const config = readJson(configPath);
      assert.equal(config.userNote, `retain-${marker}`);
      const hooks = config.hooks.preToolUse;
      const canaryHooks = hooks.filter((hook: any) => hook.command.includes("cursor.mjs"));
      assert.equal(canaryHooks.length, 1);
      assertBuiltCommand(canaryHooks[0].command, "cursor");
      assert.ok(hooks.some((hook: any) => hook.command === "other-tool --check"));
      assert.equal(canaryHooks[0].failClosed, true);
      break;
    }
    case "gemini-cli": {
      const config = readJson(configPath);
      assert.equal(config.userNote, `retain-${marker}`);
      const group = config.hooks.BeforeTool.find((item: any) => item.matcher === "run_shell_command");
      const hooks = group.hooks.filter((hook: any) => hook.command.includes("gemini-cli.mjs"));
      assert.equal(hooks.length, 1);
      assertBuiltCommand(hooks[0].command, "gemini-cli");
      assert.ok(group.hooks.some((hook: any) => hook.command === "other-tool --check"));
      assert.match(output, /hook failure lets the command run/);
      assert.match(output, /policies\/ directory/);
      break;
    }
    case "opencode": {
      const config = readFileSync(configPath, "utf8");
      assert.match(config, /existing-CANARY_SYNTHETIC_MARKER_7f3a/);
      assert.match(config, /"resource"\s*:\s*"\*"/);
      assert.match(config, /"resource"\s*:\s*"git push --force \*"/);
      assert.match(config, /keep this comment/);
      const withoutJsonc = config.replace(/\/\/[^\n]*/g, "").replace(/,(?=\s*[}\]])/g, "");
      const parsed = JSON.parse(withoutJsonc);
      assert.equal(parsed.permissions.length, 2);
      assert.match(output, /fail-closed behaviour is unverified/);
      assert.doesNotMatch(output, new RegExp(marker));
      const plugin = readFileSync(join(dirnameOf(configPath), ".opencode", "plugins", "canary", "index.ts"), "utf8");
      assert.match(plugin, /execFileSync\(process\.execPath/);
      assert.match(plugin, /dist.*hook.*opencode\.mjs/);
      const execArgs = plugin.match(/execFileSync\(process\.execPath,\s*(\[[^\]]+\])/);
      assert.ok(execArgs, "generated OpenCode plugin must pass an argument array");
      assert.ok(isAbsolute(JSON.parse(execArgs[1])[0]), "OpenCode build path must be absolute");
      assert.doesNotMatch(plugin, /canary hook --agent opencode/);
      break;
    }
  }
}

function dirnameOf(path: string): string {
  return dirname(path);
}

test("init validates flags, previews before writing, merges safely, and reports status", () => {
  const badFlags = withFreshDirectory((temp) => {
    const repo = join(temp, "repo");
    const home = join(temp, "home");
    mkdirSync(repo);
    mkdirSync(home);
    const bad = runCli(["init", "--agent", "not-an-agent"], repo, home);
    assert.equal(bad.status, 2);
    assert.equal(allFilePaths(repo).length, 0);
    const missing = runCli(["init"], repo, home);
    assert.equal(missing.status, 2);
    assert.equal(allFilePaths(repo).length, 0);
    return true;
  });
  assert.equal(badFlags, true);

  for (const agent of AGENTS) {
    withFreshDirectory((temp) => {
      const repo = join(temp, "repo");
      const home = join(temp, "home");
      mkdirSync(repo);
      mkdirSync(home);
      const seededConfig = seedConfig(repo, agent)!;
      const result = runCli(["init", "--agent", agent], repo, home);
      assert.equal(result.status, 0, `${agent}: ${result.stderr}`);
      assert.equal(result.stderr, "", agent);

      const primaryPath = join(repo, initTargets[agent][0]!);
      const previewMarker = result.stdout.indexOf(`--- ${initTargets[agent][0]} ---`);
      const configuredMarker = result.stdout.indexOf(`Configured ${initTargets[agent][0]}.`);
      assert.ok(previewMarker >= 0, `${agent} prints its preview`);
      assert.ok(configuredMarker > previewMarker, `${agent} prints status after the preview`);
      assert.match(result.stdout, /Canary init preview/);
      assert.match(result.stdout, /Node\.js must be available/);
      assertInitialized(agent, primaryPath, result.stdout);

      for (const target of initTargets[agent]) {
        assert.ok(existsSync(join(repo, target)), `${agent} creates ${target}`);
      }
      assert.deepEqual(allFilePaths(repo), initTargets[agent].slice().sort(), `${agent} writes only its documented target files`);

      const firstState = initTargets[agent].map((target) => readFileSync(join(repo, target), "utf8"));
      const repeated = runCli(["init", "--agent", agent], repo, home);
      assert.equal(repeated.status, 0, `${agent} repeat: ${repeated.stderr}`);
      assert.deepEqual(initTargets[agent].map((target) => readFileSync(join(repo, target), "utf8")), firstState,
        `${agent} init is idempotent`);
      assert.ok(existsSync(seededConfig));
    });
  }
});

test("C3 script scan reports unguarded variable and substitution targets without requiring symlinks", () => withFreshDirectory((temp) => {
  const repo = copyTrap("trap-c3", temp);
  const home = join(temp, "home");
  mkdirSync(home);

  const result = runCli(["scan", "--json"], repo, home);
  assert.equal(result.status, 0, result.stderr);
  const document = JSON.parse(result.stdout);
  const c3 = document.findings.filter((finding: any) => finding.check === "C3");
  assert.ok(c3.some((finding: any) => /variable|substitution|unguarded/i.test(`${finding.rule} ${finding.danger}`)));
}));

test("C3 scan reports symlink targets outside the repository", (t) => withFreshDirectory((temp) => {
  const repo = copyTrap("trap-c3", temp);
  const home = join(temp, "home");
  const outside = join(temp, "outside-target");
  mkdirSync(home);
  mkdirSync(outside);

  try {
    symlinkSync(outside, join(repo, "external-target"), "junction");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform === "win32" && (code === "EPERM" || code === "EACCES" || code === "UNKNOWN")) {
      t.skip("Windows denied junction/symlink creation");
      return;
    }
    throw error;
  }

  const result = runCli(["scan", "--json"], repo, home);
  assert.equal(result.status, 0, result.stderr);
  const document = JSON.parse(result.stdout);
  const c3 = document.findings.filter((finding: any) => finding.check === "C3");
  assert.ok(c3.some((finding: any) => /link|junction/i.test(`${finding.rule} ${finding.danger}`)));
}));

test("CAN-T-08: scan completes with Node networking disabled", () => {
  withFreshDirectory((temp) => {
    const repo = copyTrap("trap-c1", temp);
    const home = join(temp, "home");
    mkdirSync(home);
    runGit(["init", "--quiet"], repo, home);
    const offline = encodeURIComponent(`
      import net from "node:net";
      import dns from "node:dns";
      import dgram from "node:dgram";
      import { syncBuiltinESMExports } from "node:module";
      const refuse = () => {
        process.stderr.write("CANARY_NETWORK_ATTEMPT\\n");
        throw new Error("Networking disabled for the scanner test.");
      };
      net.Socket.prototype.connect = refuse;
      dgram.Socket.prototype.connect = refuse;
      dgram.Socket.prototype.send = refuse;
      dns.lookup = dns.resolve = dns.promises.lookup = dns.promises.resolve = refuse;
      globalThis.fetch = refuse;
      syncBuiltinESMExports();
    `);
    const result = spawnSync(process.execPath, ["--import", "data:text/javascript," + offline, cli, "scan", "--json"], {
      cwd: repo,
      env: isolatedEnv(home),
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.ok(JSON.parse(result.stdout).findings.some(({ check }: { check: string }) => check === "C1"));
  });
});
