import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import type { CheckFinding } from "../src/contract.ts";
import { checkCredentials } from "../src/core/checks/credentials.ts";
import {
  FindingError,
  SCHEMA_VERSION,
  TOOL_NAME,
  TOOL_VERSION,
  buildFindings,
  findLeak,
  makeFinding,
  sanitizeRelativePath,
  serializeFindings,
} from "../src/core/findings.ts";
import type { FindingDraft } from "../src/core/findings.ts";
import { computeScore } from "../src/core/score.ts";

const MARKER = "CANARY_SYNTHETIC_MARKER_7f3a";

/** The illustrative finding of SRS 3.5, with placeholder values only. */
const exampleDraft: FindingDraft = {
  check: "C2",
  rule: "aws-access-key-id",
  severity: "critical",
  path: "config/deploy.env",
  line: 4,
  evidence: { kind: "secret-name", name: "AWS_ACCESS_KEY_ID" },
  danger: "An AWS access key is committed to the repository.",
  consequence: "Anyone with read access to the repository can use the key.",
  fix: "Remove the line and add config/deploy.env to .gitignore.",
  manual: "Rotate the key in AWS. Removing it from the repository does not revoke it.",
};

function draft(overrides: Partial<FindingDraft> = {}): FindingDraft {
  return { ...exampleDraft, ...overrides };
}

test("IDs are stable for the same check, rule, path and line (CAN-D-03)", () => {
  const first = makeFinding(draft());
  const second = makeFinding(draft());

  assert.equal(first.id, second.id);
  assert.match(first.id, /^C2-aws-access-key-id-[0-9a-f]{6}$/);
  assert.notEqual(first.id, makeFinding(draft({ line: 5 })).id);
  assert.notEqual(first.id, makeFinding(draft({ line: null })).id);
  assert.notEqual(first.id, makeFinding(draft({ path: "config/other.env" })).id);
  assert.notEqual(first.id, makeFinding(draft({ rule: "other-rule" })).id);
  assert.notEqual(first.id, makeFinding(draft({ check: "C3" })).id);
});

test("paths are normalized to a repository-relative POSIX form", () => {
  assert.equal(sanitizeRelativePath("./config\\deploy.env"), "config/deploy.env");
  assert.equal(sanitizeRelativePath("a/./b/c.ts"), "a/b/c.ts");
  assert.equal(makeFinding(draft({ path: ".\\config\\deploy.env" })).path, "config/deploy.env");
  assert.equal(makeFinding(draft({ path: "a/../config/deploy.env" })).path, "config/deploy.env");
});

test("absolute and escaping paths are refused", () => {
  const badPaths = [
    "/etc/passwd",
    "C:\\Users\\someone\\deploy.env",
    "\\\\server\\share\\deploy.env",
    "../deploy.env",
    "a/../../deploy.env",
  ];
  for (const badPath of badPaths) {
    assert.throws(() => makeFinding(draft({ path: badPath })), FindingError);
  }
});

test("timestamps, hosts, absolute paths and secret-like values are refused", () => {
  const badDangers = [
    "Created 2026-11-22 at 10:15.",
    "The URL postgres://db.internal.example/prod was seen.",
    "The host db.production.example was seen.",
    "The owner alice@example.com was seen.",
    "The key AKIAABCDEFGHIJKLMNOP is committed.",
    `The key ${MARKER} is committed.`,
    "A -----BEGIN RSA PRIVATE KEY----- block is committed.",
  ];
  for (const danger of badDangers) {
    assert.throws(() => makeFinding(draft({ danger })), FindingError);
  }

  const withMarker = `A value ${MARKER} was present.`;
  assert.throws(() => makeFinding(draft({ consequence: withMarker })), FindingError);
  assert.throws(() => makeFinding(draft({ fix: withMarker })), FindingError);
  assert.throws(() => makeFinding(draft({ manual: withMarker })), FindingError);
  assert.throws(
    () => makeFinding(draft({ evidence: { kind: "secret-name", name: MARKER } })),
    FindingError,
  );

  assert.throws(() => makeFinding(draft({ line: 0 })), FindingError);
  assert.throws(() => makeFinding(draft({ line: 1.5 })), FindingError);
  assert.throws(() => makeFinding(draft({ severity: "severe" as "low" })), FindingError);
  assert.throws(
    () => makeFinding(draft({ evidence: { kind: "value", name: "AWS_ACCESS_KEY_ID" } as never })),
    FindingError,
  );
});

test("the SRS example is accepted unchanged and defaults evidence to the rule", () => {
  const finding = makeFinding(draft());
  assert.equal(finding.severity, "critical");
  assert.equal(finding.path, "config/deploy.env");
  assert.equal(finding.line, 4);
  assert.deepEqual(finding.evidence, { kind: "secret-name", name: "AWS_ACCESS_KEY_ID" });
  assert.equal(finding.fix, "Remove the line and add config/deploy.env to .gitignore.");
  assert.equal(makeFinding(draft({ line: null })).line, null);
  assert.deepEqual(makeFinding(draft({ evidence: undefined })).evidence, {
    kind: "rule-name",
    name: "aws-access-key-id",
  });
});

test("findings.json follows the SRS 3.5 shape", () => {
  const document = JSON.parse(serializeFindings({ findings: [draft()] }));

  assert.deepEqual(Object.keys(document), ["schema_version", "tool", "score", "summary", "findings"]);
  assert.equal(document.schema_version, SCHEMA_VERSION);
  assert.deepEqual(document.tool, { name: TOOL_NAME, version: TOOL_VERSION });
  assert.equal(document.score, computeScore(buildFindings([draft()])));
  assert.deepEqual(document.summary, { critical: 1, high: 0, medium: 0, low: 0 });
  assert.equal(document.findings.length, 1);

  const finding: CheckFinding = document.findings[0];
  assert.deepEqual(Object.keys(finding), [
    "id",
    "check",
    "rule",
    "severity",
    "path",
    "line",
    "evidence",
    "danger",
    "consequence",
    "fix",
    "manual",
  ]);
  assert.deepEqual(Object.keys(document.findings[0].evidence), ["kind", "name"]);
});

test("C2 fixture findings serialize without rejecting the .env.example filename", () => {
  const root = join(process.cwd(), "fixtures", "trap-c2", "repo");
  const fixtureHome = join(process.cwd(), "fixtures", "trap-c2", "home");
  const previousHome = process.env.CANARY_HOME;

  process.env.CANARY_HOME = fixtureHome;
  try {
    const findings = checkCredentials(root);
    const json = serializeFindings({
      findings: [...findings, draft({ path: ".env.example", line: 1 })],
    });

    assert.equal(json.includes(MARKER), false);
    assert.equal(findLeak(json), null);
    assert.ok(json.includes('"path": ".env.example"'));
    assert.throws(
      () => makeFinding(draft({ path: "config/db.production.example" })),
      FindingError,
    );
  } finally {
    if (previousHome === undefined) delete process.env.CANARY_HOME;
    else process.env.CANARY_HOME = previousHome;
  }
});

test("two identical runs are byte-identical and sorted worst first (CAN-T-07)", () => {
  const findings = [
    draft({ rule: "low-rule", path: "a/low.ts", line: 1, severity: "low" }),
    draft({ rule: "crit-z", path: "z/crit.ts", line: 9, severity: "critical" }),
    draft({ rule: "high-rule", path: "b/high.ts", line: 2, severity: "high" }),
    draft({ rule: "crit-a", path: "a/crit.ts", line: 1, severity: "critical" }),
  ];

  const first = serializeFindings({ findings });
  const second = serializeFindings({ findings: [...findings].reverse() });
  assert.equal(first, second);
  assert.ok(Buffer.from(first, "utf8").equals(Buffer.from(second, "utf8")));

  const document = JSON.parse(first);
  assert.deepEqual(
    document.findings.map((finding: CheckFinding) => finding.rule),
    ["crit-a", "crit-z", "high-rule", "low-rule"],
  );
  assert.equal(document.score, 100 - 25 - 25 - 15 - 1);
  assert.equal(first.endsWith("\n"), true);
});

test("the synthetic marker and other leak patterns never reach the output (CAN-T-02)", () => {
  const json = serializeFindings({ findings: [draft()] });
  assert.equal(json.includes(MARKER), false);
  assert.equal(findLeak(json), null);
  assert.equal(/\d{4}-\d{2}-\d{2}/.test(json), false);
  assert.equal(/[A-Za-z]:[\\/]/.test(json), false);
  assert.equal(json.includes("://"), false);
});

test("out-of-range explicit scores are refused", () => {
  assert.throws(() => serializeFindings({ findings: [draft()], score: 101 }), FindingError);
  assert.throws(() => serializeFindings({ findings: [draft()], score: -1 }), FindingError);
  assert.throws(() => serializeFindings({ findings: [draft()], score: 1.5 }), FindingError);
});
