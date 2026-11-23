import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(resolve(root, relativePath), "utf8");
const parseJson = (relativePath) => JSON.parse(read(relativePath));

// Minimal JSONC support: strip // and /* */ comments outside strings, then
// remove trailing commas. No dependencies.
function stripJsonComments(source) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      if (i < source.length) out += "\n";
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

const parseJsonc = (relativePath) => JSON.parse(stripJsonComments(read(relativePath)));

const JSON_FILES = [
  ".claude-plugin/plugin.json",
  "hooks/claude-code.json",
  "hooks/hooks.json",
  ".codex-plugin/plugin.json",
  "hooks/codex.json",
  ".cursor/hooks.json",
  "gemini-extension.json",
];

const PACKAGING_FILES = [
  ...JSON_FILES,
  "opencode.jsonc",
  "bin/canary.js",
  ".opencode/plugins/canary/index.ts",
];

test("every JSON configuration file parses", () => {
  for (const file of JSON_FILES) {
    assert.doesNotThrow(() => JSON.parse(read(file)), `${file} must parse as JSON`);
  }
});

test("opencode.jsonc parses as JSONC", () => {
  assert.doesNotThrow(() => parseJsonc("opencode.jsonc"));
});

test("Claude Code uses its own PreToolUse config and packaged entry point", () => {
  const manifest = parseJson(".claude-plugin/plugin.json");
  assert.equal(manifest.hooks, "./hooks/claude-code.json");
  const cfg = parseJson("hooks/claude-code.json");
  const group = cfg.hooks.PreToolUse.find((g) => g.matcher === "Bash|PowerShell");
  assert.ok(group, "a Bash|PowerShell PreToolUse group must exist");
  assert.match(group.matcher, /Bash/);
  assert.match(group.matcher, /PowerShell/);
  const hook = group.hooks[0];
  assert.equal(hook.type, "command");
  assert.equal(hook.command, "node");
  assert.equal(hook.onFailure, "block");
  assert.deepEqual(hook.args, ["${CLAUDE_PLUGIN_ROOT}/dist/hook/claude-code.mjs"]);
});

test("Codex uses its own ^Bash$ config, statusMessage and no fail-open field", () => {
  const manifest = parseJson(".codex-plugin/plugin.json");
  assert.equal(manifest.hooks, "./hooks/codex.json");
  const cfg = parseJson("hooks/codex.json");
  const group = cfg.hooks.PreToolUse.find((g) => g.matcher === "^Bash$");
  assert.ok(group, "a ^Bash$ PreToolUse group must exist");
  const hook = group.hooks[0];
  assert.equal(hook.type, "command");
  assert.match(hook.command, /^node\s/);
  assert.match(hook.command, /dist[\\/]hook[\\/]codex\.mjs/);
  assert.ok(typeof hook.statusMessage === "string" && hook.statusMessage.length > 0);
  // Fields that make a Codex PreToolUse hook run the command anyway [S8].
  const failOpenFields = ["onFailure", "continue", "stopReason", "suppressOutput", "decision", "permissionDecision"];
  for (const field of failOpenFields) {
    assert.ok(!(field in hook), `Codex hook must not contain ${field}`);
  }
});

test("Cursor uses preToolUse, Shell and failClosed true", () => {
  const cfg = parseJson(".cursor/hooks.json");
  assert.equal(cfg.version, 1);
  const group = cfg.hooks.preToolUse.find((g) => g.matcher === "Shell");
  assert.ok(group, "a Shell preToolUse group must exist");
  assert.equal(group.failClosed, true);
  assert.match(group.command, /^node\s/);
  assert.match(group.command, /dist[\\/]hook[\\/]cursor\.mjs/);
});

test("Gemini CLI uses BeforeTool, run_shell_command and a millisecond timeout", () => {
  const cfg = parseJson("hooks/hooks.json");
  const group = cfg.hooks.BeforeTool.find((g) => g.matcher === "run_shell_command");
  assert.ok(group, "a run_shell_command BeforeTool group must exist");
  const hook = group.hooks[0];
  assert.equal(hook.name, "canary");
  assert.equal(hook.type, "command");
  assert.match(hook.command, /^node\s/);
  assert.match(hook.command, /dist(?:\$\{\/\}|[\\/])hook(?:\$\{\/\}|[\\/])gemini-cli\.mjs/);
  assert.equal(hook.timeout, 10000);
});

test("OpenCode plugin runs the self-contained bundle for shell permissions", () => {
  const source = read(".opencode/plugins/canary/index.ts");
  assert.match(source, /dist[\\/]hook[\\/]opencode\.mjs/);
  assert.match(source, /execFileSync\("node",\s*\[hookBundle\]/);
  assert.doesNotMatch(source, /process\.execPath/);
  assert.match(source, /ctx\.permission\.hook\("evaluate"/);
  assert.match(source, /ctx\.location\.directory/);
  assert.doesNotMatch(source, /src[\\/]cli[\\/]hook\.ts/);
  assert.doesNotMatch(source, /src[\\/]adapters[\\/]opencode\.ts/);
  assert.doesNotMatch(source, /@eyesopen21\/canary\/core/);
});

test("opencode.jsonc denies the documented git push --force example", () => {
  const cfg = parseJsonc("opencode.jsonc");
  const rule = cfg.permissions.find((r) => r.resource === "git push --force *");
  assert.ok(rule, "a rule for git push --force * must exist");
  assert.equal(rule.action, "shell");
  assert.equal(rule.effect, "deny");
});

test("plugin and extension manifests identify canary", () => {
  for (const file of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", "gemini-extension.json"]) {
    const cfg = parseJson(file);
    assert.equal(cfg.name, "canary", `${file} name`);
    assert.equal(cfg.version, "0.1.0", `${file} version`);
    assert.ok(cfg.description, `${file} description`);
  }
});

test("hook commands use only documented placeholders", () => {
  // Placeholders copied from docs/specs/agent-adapters.md; ${/} is the Gemini
  // path separator documented in the same file.
  const documented = new Set(["CLAUDE_PLUGIN_ROOT", "PLUGIN_ROOT", "extensionPath", "/"]);
  for (const file of PACKAGING_FILES) {
    for (const match of read(file).matchAll(/\$\{([^}]+)\}/g)) {
      assert.ok(documented.has(match[1]), `${file}: undocumented placeholder ${match[1]}`);
    }
  }
});

test("all checked-in command hooks invoke built JavaScript and reject a synthetic force push", () => {
  const hookConfigs = [
    { file: "hooks/claude-code.json", select: (cfg) => cfg.hooks.PreToolUse[0].hooks[0], agent: "claude-code" },
    { file: "hooks/codex.json", select: (cfg) => cfg.hooks.PreToolUse[0].hooks[0], agent: "codex" },
    { file: ".cursor/hooks.json", select: (cfg) => cfg.hooks.preToolUse[0], agent: "cursor" },
    { file: "hooks/hooks.json", select: (cfg) => cfg.hooks.BeforeTool[0].hooks[0], agent: "gemini-cli" },
  ];
  for (const { file, select, agent } of hookConfigs) {
    const hook = select(parseJson(file));
    const command = hook.command + " " + (hook.args ?? []).join(" ");
    assert.match(command, agent === "gemini-cli"
      ? /dist(?:\$\{\/\}|[\\/])hook(?:\$\{\/\}|[\\/])gemini-cli\.mjs/
      : new RegExp(`dist[\\\\/]hook[\\\\/]${agent}\\.mjs`));
    assert.doesNotMatch(command, /entry\.js/);
    assert.doesNotMatch(command, /\bcanary(?:\.cmd)?\s+hook/);
    assert.doesNotMatch(command, /--agent/);

    const event = JSON.stringify({
      tool_name: "Shell",
      tool_input: { command: "git push --force origin main", working_directory: root },
      cwd: root,
      workspace_roots: [root],
    });
    const result = spawnSync(process.execPath, [resolve(root, "dist", "hook", `${agent}.mjs`)], {
      cwd: root,
      input: event,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${file} must launch successfully: ${result.stderr}`);
    if (agent === "cursor") {
      assert.equal(JSON.parse(result.stdout).permission, "deny", file);
    } else if (agent === "gemini-cli") {
      assert.equal(JSON.parse(result.stdout).decision, "deny", file);
    } else {
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny", file);
    }
  }
});

test("a hook from a git archive runs built JavaScript without loading TypeScript", () => {
  const temporary = mkdtempSync(join(tmpdir(), "canary-git-archive-"));
  const archivedPackage = join(temporary, "package");
  mkdirSync(archivedPackage);
  try {
    const archive = execFileSync("git", ["archive", "--format=tar", "HEAD"], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
    execFileSync("tar", ["-xf", "-", "-C", archivedPackage], { input: archive, maxBuffer: 32 * 1024 * 1024 });
    // Overlay only package runtime paths so this test also exercises current
    // package files before they are committed; no project Git index is changed.
    for (const relativePath of [".claude-plugin", ".codex-plugin", "hooks", ".cursor/hooks.json", "gemini-extension.json", "bin/canary.js", "dist"]) {
      const source = resolve(root, relativePath);
      if (!existsSync(source)) continue;
      const target = resolve(archivedPackage, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target, { recursive: true, force: true });
    }

    const hookConfig = JSON.parse(readFileSync(resolve(archivedPackage, "hooks/claude-code.json"), "utf8"));
    const hook = hookConfig.hooks.PreToolUse[0].hooks[0];
    assert.equal(hook.command, "node");
    assert.equal(hook.args.length, 1);
    const entry = hook.args[0].replace("${CLAUDE_PLUGIN_ROOT}", archivedPackage);
    assert.equal(resolve(entry), resolve(archivedPackage, "dist/hook/claude-code.mjs"));

    const typeGuard = join(temporary, "reject-typescript.mjs");
    writeFileSync(typeGuard, [
      'import { registerHooks } from "node:module";',
      "registerHooks({ resolve(specifier, context, nextResolve) {",
      "  const result = nextResolve(specifier, context);",
      '  if (result.url.endsWith(".ts")) throw new Error("TypeScript source was loaded");',
      "  return result;",
      "} });",
      "",
    ].join("\n"));

    const env = { ...process.env, CLAUDE_PLUGIN_ROOT: archivedPackage };
    delete env.CANARY_DEV;
    const event = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "git push --force origin main" },
      cwd: archivedPackage,
    });
    const result = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", pathToFileURL(typeGuard).href, entry], {
      cwd: archivedPackage,
      env,
      input: event,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `archived hook must start: ${result.stderr}`);
    let output;
    try {
      output = JSON.parse(result.stdout);
    } catch {
      assert.fail(
        `archived hook must emit valid JSON on stdout; status=${result.status}; ` +
        `stdout=${JSON.stringify(result.stdout)}; stderr=${JSON.stringify(result.stderr)}`,
      );
    }
    assert.equal(
      output.hookSpecificOutput?.permissionDecision,
      "deny",
      `archived hook must deny the force push; stderr=${JSON.stringify(result.stderr)}`,
    );
    assert.equal(result.stderr, "");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("a hook launched through a symlinked directory still evaluates", () => {
  const temporary = mkdtempSync(join(tmpdir(), "canary-symlink-"));
  const realDirectory = join(temporary, "real");
  const linkedDirectory = join(temporary, "linked");
  try {
    // A single self-contained bundle is enough: it imports only node: builtins.
    mkdirSync(realDirectory);
    cpSync(resolve(root, "dist", "hook", "claude-code.mjs"), join(realDirectory, "claude-code.mjs"));
    // Windows runners allow directory junctions without elevated privileges;
    // POSIX runners use a normal symlink. Both make the launch path (argv[1])
    // differ from the realpath Node reports through import.meta.url.
    symlinkSync(realDirectory, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
    const entry = join(linkedDirectory, "claude-code.mjs");
    const event = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "git push --force origin main" },
      cwd: root,
    });
    const result = spawnSync(process.execPath, [entry], { cwd: root, input: event, encoding: "utf8" });
    assert.equal(result.status, 0, `symlinked hook must start: ${result.stderr}`);
    let output;
    try {
      output = JSON.parse(result.stdout);
    } catch {
      assert.fail(
        `symlinked hook must emit valid JSON on stdout; status=${result.status}; ` +
        `stdout=${JSON.stringify(result.stdout)}; stderr=${JSON.stringify(result.stderr)}`,
      );
    }
    assert.equal(
      output.hookSpecificOutput?.permissionDecision,
      "deny",
      `symlinked hook must deny the force push; stderr=${JSON.stringify(result.stderr)}`,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("OpenCode CLI uses the shared adapter for a synthetic permission event", () => {
  const result = spawnSync(process.execPath, [resolve(root, "bin/canary.js"), "hook", "--agent", "opencode"], {
    cwd: root,
    input: JSON.stringify({ action: "shell", resources: "git push --force origin main" }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).effect, "deny");
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("no packaging file contains a secret or an absolute home path", () => {
  const secrets = [
    { name: "AWS access key id", re: /AKIA[0-9A-Z]{16}/ },
    { name: "private key header", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: "credentialed database URL", re: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s/:]+:[^\s@]+@/i },
    { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
    { name: "OpenAI-style key", re: /sk-[A-Za-z0-9_-]{20,}/ },
    { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/ },
    { name: "assigned credential value", re: /(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i },
  ];
  const homePaths = [
    { name: "current user home directory", re: new RegExp(escapeRegExp(homedir()), "i") },
    { name: "Windows user profile path", re: /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+/i },
    { name: "Unix home path", re: /(?:^|[\s"'=:])\/(?:Users|home)\/[A-Za-z0-9._-]+/ },
    { name: "HOME variable reference", re: /\$HOME[\\/]/ },
  ];
  for (const file of PACKAGING_FILES) {
    const content = read(file);
    for (const { name, re } of secrets) {
      assert.doesNotMatch(content, re, `${file} must not contain a ${name}`);
    }
    for (const { name, re } of homePaths) {
      assert.doesNotMatch(content, re, `${file} must not contain ${name}`);
    }
  }
});
