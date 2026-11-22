/**
 * Finding construction, no-leak guard and deterministic findings.json output.
 *
 * CAN-F-02, CAN-D-01, CAN-D-02, CAN-D-03, CAN-N-04, CAN-T-07.
 *
 * The core reads values in memory to decide, but never copies a value into a
 * finding (ADR-0003). A finding may hold only IDs, severity, a repository
 * relative path, a line, a fixed danger/consequence/fix/manual text and an
 * evidence object with a kind and a name. Any other content is rejected
 * before it can reach a file. There is no clock, no environment read and no
 * locale dependent operation anywhere in this module.
 */
import { createHash } from "node:crypto";
import type { CheckFinding, Severity } from "../contract.ts";
import { computeScore, sortFindings, summarizeSeverities } from "./score.ts";
import type { SeveritySummary } from "./score.ts";

export const SCHEMA_VERSION = 1;
export const TOOL_NAME = "canary";
/** Matches the illustrative value in SRS 3.5; not a release claim. */
export const TOOL_VERSION = "0.1.0";

export type EvidenceKind = "secret-name" | "key-type" | "rule-name";

/** CAN-D-02: evidence holds only a kind and a name. */
export interface Evidence {
  kind: EvidenceKind;
  name: string;
}

/** The serialized shape of one finding (SRS 3.5). */
export interface ScanFinding extends CheckFinding {
  evidence: Evidence;
}

/** What a check supplies. An existing CheckFinding is also a valid draft. */
export type FindingDraft = Omit<CheckFinding, "id"> & {
  evidence?: Evidence;
};

export class FindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FindingError";
  }
}

interface LeakRule {
  label: string;
  pattern: RegExp;
}

/**
 * Conservative denylist for text that must contain names and locations only.
 * Each rule names a category forbidden by CAN-F-02 / CAN-D-01 / ADR-0003 so
 * the error can explain the refusal without echoing the offending value.
 */
const LEAK_RULES: readonly LeakRule[] = [
  { label: "timestamp", pattern: /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/ },
  { label: "absolute POSIX path", pattern: /(?:^|[\s("'=:])\/[A-Za-z0-9._-]/ },
  { label: "absolute Windows path", pattern: /[A-Za-z]:[\\/]/ },
  { label: "UNC path", pattern: /\\\\[A-Za-z0-9._-]/ },
  { label: "home directory", pattern: /(?:\/Users\/|\/home\/|\\Users\\)[A-Za-z0-9._-]+/ },
  { label: "URL scheme", pattern: /[A-Za-z][A-Za-z0-9+.-]*:\/\// },
  { label: "web host", pattern: /www\./i },
  { label: "IP address", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { label: "user at host", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  {
    label: "domain name",
    pattern: /\b(?:[A-Za-z0-9-]+\.)+(?:com|net|org|io|dev|cloud|internal|local|example|corp)\b/i,
  },
  { label: "host name", pattern: /\blocalhost\b/i },
  { label: "credential-like token", pattern: /\b[A-Z][A-Z0-9_]{8,}[a-z][A-Za-z0-9_]{2,}\b/ },
  { label: "access key id", pattern: /\b(?:AKIA|ASIA|AIDA|AROA)[A-Z0-9]{16}\b/ },
  { label: "private key header", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "JSON web token", pattern: /\beyJ[A-Za-z0-9_-]{8,}\./ },
  { label: "long hex value", pattern: /\b[0-9a-fA-F]{32,}\b/ },
];

/** Returns the category of the first forbidden pattern, or null. */
export function findLeak(value: string): string | null {
  for (const rule of LEAK_RULES) {
    if (rule.pattern.test(value)) return rule.label;
  }
  return null;
}

function assertSafeText(value: string, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new FindingError(`${field} must be a non-empty string`);
  }
  const leak = findLeak(value);
  if (leak !== null) {
    throw new FindingError(`${field} contains a ${leak}; findings may hold names and locations only`);
  }
  return value;
}

function requireIdentifier(value: string, field: "check" | "rule"): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new FindingError(`${field} must be a simple identifier`);
  }
  return value;
}

/** Normalizes separators and refuses any path that can leave the repository. */
export function sanitizeRelativePath(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new FindingError("path must be a non-empty string");
  }
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new FindingError("path must be repository-relative, not absolute");
  }

  const segments: string[] = [];
  for (const segment of normalized.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) {
        throw new FindingError("path must stay inside the repository");
      }
      segments.pop();
      continue;
    }
    if (/[\u0000-\u001f]/.test(segment)) {
      throw new FindingError("path contains a control character");
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    throw new FindingError("path must name a file or a directory");
  }

  const clean = segments.join("/");
  const leak = findLeak(clean);
  if (leak !== null) {
    throw new FindingError(`path contains a ${leak}`);
  }
  return clean;
}

function normalizeLine(line: number | null): number | null {
  if (line === null) return null;
  if (!Number.isInteger(line) || line < 1) {
    throw new FindingError("line must be a positive integer or null");
  }
  return line;
}

const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low"];

function normalizeSeverity(severity: Severity): Severity {
  if (!SEVERITIES.includes(severity)) {
    throw new FindingError("severity is not one of the four known values");
  }
  return severity;
}

const EVIDENCE_KINDS: readonly EvidenceKind[] = ["secret-name", "key-type", "rule-name"];

function normalizeEvidence(evidence: Evidence | undefined, rule: string): Evidence {
  if (evidence === undefined) {
    return { kind: "rule-name", name: rule };
  }
  if (!EVIDENCE_KINDS.includes(evidence.kind)) {
    throw new FindingError("evidence.kind is not one of the three known values");
  }
  return { kind: evidence.kind, name: assertSafeText(evidence.name, "evidence.name") };
}

/** CAN-D-03: stable for the same check, rule, path and line. */
function makeId(check: string, rule: string, path: string, line: number | null): string {
  const key = `${check}\u0000${rule}\u0000${path}\u0000${line === null ? "" : String(line)}`;
  const digest = createHash("sha256").update(key, "utf8").digest("hex");
  return `${check}-${rule}-${digest.slice(0, 6)}`;
}

/** Validates a draft and returns a finding whose fields are safe to serialize. */
export function makeFinding(draft: FindingDraft): ScanFinding {
  const check = requireIdentifier(draft.check, "check");
  const rule = requireIdentifier(draft.rule, "rule");
  const path = sanitizeRelativePath(draft.path);
  const line = normalizeLine(draft.line);
  const severity = normalizeSeverity(draft.severity);
  const evidence = normalizeEvidence(draft.evidence, rule);
  const danger = assertSafeText(draft.danger, "danger");
  const consequence = assertSafeText(draft.consequence, "consequence");
  const fix = draft.fix === null ? null : assertSafeText(draft.fix, "fix");
  const manual = draft.manual === null ? null : assertSafeText(draft.manual, "manual");
  const id = makeId(check, rule, path, line);

  // Property order is fixed here and is preserved by JSON.stringify (CAN-D-01).
  return {
    id,
    check,
    rule,
    severity,
    path,
    line,
    evidence,
    danger,
    consequence,
    fix,
    manual,
  };
}

export function buildFindings(findings: readonly FindingDraft[]): ScanFinding[] {
  return findings.map(makeFinding);
}

export interface FindingsDocument {
  schema_version: number;
  tool: { name: string; version: string };
  score: number;
  summary: SeveritySummary;
  findings: ScanFinding[];
}

export interface FindingsDocumentInput {
  findings: readonly FindingDraft[];
  /** When omitted, computed from the findings using the A8 weights. */
  score?: number;
}

export function buildFindingsDocument(input: FindingsDocumentInput): FindingsDocument {
  const findings = sortFindings(buildFindings(input.findings));
  const score = input.score ?? computeScore(findings);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new FindingError("score must be an integer from 0 to 100");
  }
  return {
    schema_version: SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    score,
    summary: summarizeSeverities(findings),
    findings,
  };
}

/**
 * Serializes the document of SRS 3.5 with two spaces and a trailing newline.
 * A final whole-document guard catches anything a future field could add.
 */
export function serializeFindings(input: FindingsDocumentInput): string {
  const json = JSON.stringify(buildFindingsDocument(input), null, 2) + "\n";
  const leak = findLeak(json);
  if (leak !== null) {
    throw new FindingError(`findings.json would contain a ${leak}`);
  }
  return json;
}
