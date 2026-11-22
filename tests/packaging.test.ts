import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

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
  "hooks/hooks.json",
  ".codex-plugin/plugin.json",
  ".cursor/hooks.json",
  "gemini-extension.json",
];

const PACKAGING_FILES = [
  ...JSON_FILES,
  "opencode.jsonc",
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

test("Claude Code uses PreToolUse, Bash|PowerShell and onFailure block", () => {
  const cfg = parseJson("hooks/hooks.json");
  const group = cfg.hooks.PreToolUse.find((g) => g.matcher === "Bash|PowerShell");
  assert.ok(group, "a Bash|PowerShell PreToolUse group must exist");
  assert.match(group.matcher, /Bash/);
  assert.match(group.matcher, /PowerShell/);
  const hook = group.hooks[0];
  assert.equal(hook.type, "command");
  assert.equal(hook.command, "node");
  assert.equal(hook.onFailure, "block");
  assert.ok(hook.args.includes("--agent"));
  assert.ok(hook.args.includes("claude-code"));
});

test("Codex uses ^Bash$, statusMessage and no fail-open field", () => {
  const cfg = parseJson("hooks/hooks.json");
  const group = cfg.hooks.PreToolUse.find((g) => g.matcher === "^Bash$");
  assert.ok(group, "a ^Bash$ PreToolUse group must exist");
  const hook = group.hooks[0];
  assert.equal(hook.type, "command");
  assert.match(hook.command, /^node\s/);
  assert.match(hook.command, /--agent codex/);
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
  assert.match(group.command, /--agent cursor/);
});

test("Gemini CLI uses BeforeTool, run_shell_command and a millisecond timeout", () => {
  const cfg = parseJson("hooks/hooks.json");
  const group = cfg.hooks.BeforeTool.find((g) => g.matcher === "run_shell_command");
  assert.ok(group, "a run_shell_command BeforeTool group must exist");
  const hook = group.hooks[0];
  assert.equal(hook.name, "canary");
  assert.equal(hook.type, "command");
  assert.match(hook.command, /^node\s/);
  assert.match(hook.command, /--agent gemini-cli/);
  assert.equal(hook.timeout, 10000);
});

test("OpenCode plugin registers an evaluate permission hook for shell", () => {
  const source = read(".opencode/plugins/canary/index.ts");
  assert.match(source, /ctx\.permission\.hook\("evaluate"/);
  assert.match(source, /event\.action\s*!==\s*"shell"/);
  assert.match(source, /event\.effect\s*=\s*"deny"/);
  assert.match(source, /event\.effect\s*=\s*"ask"/);
  assert.doesNotMatch(source, /event\.effect\s*=\s*"allow"/);
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
  const documented = new Set(["CLAUDE_PLUGIN_ROOT", "extensionPath", "/"]);
  for (const file of PACKAGING_FILES) {
    for (const match of read(file).matchAll(/\$\{([^}]+)\}/g)) {
      assert.ok(documented.has(match[1]), `${file}: undocumented placeholder ${match[1]}`);
    }
  }
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
