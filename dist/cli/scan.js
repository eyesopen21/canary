import { checkDatabase } from "../core/checks/database.js";
import { checkCredentials } from "../core/checks/credentials.js";
import { checkDeletes } from "../core/checks/deletes.js";
import { agentConfigCheck } from "../core/checks/agent-config.js";
import { ciCheck } from "../core/checks/ci.js";
import { serializeFindings,                       } from "../core/findings.js";
import { readProjectFindings, writeProjectReport } from "./output.js";

const checks = [checkDatabase, checkCredentials, checkDeletes, agentConfigCheck, ciCheck];

function writeBadge(root        , score        )       {
  if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error("Invalid score.");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="182" height="24" role="img">'
    + '<rect width="182" height="24" rx="4" fill="#23435a"/>'
    + '<text x="91" y="16" text-anchor="middle" font-family="sans-serif" font-size="12" fill="white">'
    + 'Canary score ' + score + '/100</text></svg>\n';
  writeProjectReport(root, "badge.svg", svg);
}

export function badge(root        )       {
  const report = JSON.parse(readProjectFindings(root))                             ;
  if (report.schema_version !== 1 || report.tool?.name !== "canary" || typeof report.score !== "number") {
    throw new Error("Invalid findings document.");
  }
  writeBadge(root, report.score);
}

export function scan(root        , printJson         , createBadge         )       {
  const json = serializeFindings({ findings: checks.flatMap((check) => check(root)) });
  const report = JSON.parse(json)                    ;
  writeProjectReport(root, "findings.json", json);
  if (createBadge) writeBadge(root, report.score);
  if (printJson) {
    process.stdout.write(json);
    return;
  }
  const { critical, high, medium, low } = report.summary;
  const lines = [
    `Blast Radius Score ${report.score}/100`,
    `${critical} critical · ${high} high · ${medium} medium · ${low} low`,
    ...report.findings.slice(0, 3).map(({ severity, path, line, danger, consequence }) =>
      `[${severity}] ${path}${line === null ? "" : ":" + line} — ${danger} ${consequence}`),
    "Report saved to canary/findings.json",
  ];
  process.stdout.write(lines.join("\n") + "\n");
}
