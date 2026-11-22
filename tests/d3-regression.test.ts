/**
 * D3 regression guard. A prototype once stripped backslashes in a cheap
 * pre-gate before B1 classification, so path-prefixed recursive deletes of an
 * outside target were evaluated as "allow" instead of "block". This file locks
 * in the restored decisions and the canonical messages.
 *
 * Fixtures are synthetic and live in an OS temp directory. No destructive
 * command is executed: evaluate() only inspects the command string.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { evaluate } from "../src/core/evaluate.ts";

const MARKER = "SYNTHETIC-D3-MARKER";

/** Canonical B1c text from docs/specs/policy.md with target `../outside`. */
const B1C_OUTSIDE_MESSAGE =
  "Canary blocked a recursive delete. Danger: `../outside` resolves to a path outside the project root, directly or through a link. Consequence: the command deletes files that are not part of this project, and they cannot be restored from this machine. Instead: delete only paths inside the project.";

/** Path-prefixed spellings that the stripped-backslash gate misclassified. */
const OUTSIDE_COMMANDS = [
  String.raw`bin\rm -rf ../outside`,
  String.raw`C:\tools\rm -rf ../outside`,
  String.raw`dir\remove-item -Recurse ../outside`,
  String.raw`dir\find ../outside -delete`,
];

let baseDir: string;
let project: string;
let projectMarker: string;
let outsideMarker: string;

before(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "canary-d3-regression-"));
  project = path.join(baseDir, "project");
  const outside = path.join(baseDir, "outside");
  fs.mkdirSync(path.join(project, "dist"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  projectMarker = path.join(project, "dist", `${MARKER}.txt`);
  outsideMarker = path.join(outside, `${MARKER}.txt`);
  fs.writeFileSync(projectMarker, MARKER);
  fs.writeFileSync(outsideMarker, MARKER);
});

after(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

function check(command: string) {
  return evaluate({ command, projectRoot: project, cwd: project, env: {} });
}

test("D3: backslash-prefixed recursive deletes of an outside target block as B1c with the canonical message", () => {
  for (const command of OUTSIDE_COMMANDS) {
    const result = check(command);
    assert.equal(result.decision, "block", `${command}: decision`);
    assert.equal(result.rule, "B1c", `${command}: rule`);
    assert.equal(result.message, B1C_OUTSIDE_MESSAGE, `${command}: canonical message`);
    assert.ok(!result.message?.includes(MARKER), `${command}: synthetic marker leaked`);
  }
});

test("D3: a within-project literal recursive delete is allowed with no output", () => {
  const result = check("rm -rf dist");
  assert.equal(result.decision, "allow");
  assert.equal(result.rule, undefined);
  assert.equal(result.message, undefined);
});

test("D3: evaluation executes no delete (both synthetic markers remain)", () => {
  assert.ok(fs.existsSync(projectMarker), "project marker still present");
  assert.ok(fs.existsSync(outsideMarker), "outside marker still present");
});
