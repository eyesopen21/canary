import { readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
                                                             
import { readText, repoPath, stableId, walkFiles, walkLinks } from "./database.js";

// ---------------------------------------------------------------------------
// C3: unguarded recursive deletes and links that leave the repository
// ---------------------------------------------------------------------------

const RECURSIVE_DELETE_RES           = [
  /\brm\s+-[A-Za-z]*r[A-Za-z]*\s+(.+)$/i,
  /\bRemove-Item\b[^\r\n]*\s-Recurse\b/i,
  /\b(?:ri|del)\b[^\r\n]*\s-Recurse\b/i,
  /\brd\b\s+\/[sS][^\r\n]*\s+(.+)$/i,
];

const GUARDED_VAR_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*:\?[^}]*\}/g;

const TARGET_RISK_RE =
  /\$\{[^}]+\}|\$[A-Za-z_(]|%[A-Za-z_][A-Za-z0-9_]*%|`|[*?]/;

const SET_U_RE = /^\s*set\s+[-+]?[A-Za-z]*u[A-Za-z]*\b/im;

const DELETE_DANGER =
  "A recursive delete in a repository script targets a variable, a substitution, or a glob.";
const DELETE_CONSEQUENCE =
  "An unresolved target can delete files outside the project.";
const DELETE_FIX =
  "Use a literal path inside the repository, or the ${VAR:?} form together with set -u.";

const SET_U_DANGER =
  "A shell script performs a recursive delete without set -u.";
const SET_U_CONSEQUENCE =
  "An unset variable can turn the delete target into the current directory or the filesystem root.";
const SET_U_FIX = "Add set -u near the top of the script.";

const LINK_DANGER = "A symlink or junction points outside the repository.";
const LINK_CONSEQUENCE =
  "A recursive delete that follows the link can affect files outside the project.";
const LINK_FIX = "Replace the link with a path that stays inside the repository.";

function isScriptFile(relativePath        )          {
  const lower = relativePath.toLowerCase();
  const base = lower.slice(lower.lastIndexOf("/") + 1);
  return (
    /\.(sh|bash|ps1|bat|cmd)$/.test(base) ||
    base === "makefile" ||
    base === "package.json" ||
    /^makefile\./.test(base) ||
    base.endsWith(".mk")
  );
}

function isRecursiveDelete(line        )          {
  return RECURSIVE_DELETE_RES.some((regex) => regex.test(line));
}

/** The ${VAR:?} form is the documented guard; everything else is unguarded. */
function hasUnguardedTarget(line        )          {
  const withoutGuards = line.replace(GUARDED_VAR_RE, "");
  return TARGET_RISK_RE.test(withoutGuards);
}

function finding(
  rule        ,
  path        ,
  line               ,
  danger        ,
  consequence        ,
  fix               ,
)               {
  return {
    id: stableId("C3", rule, path, line),
    check: "C3",
    rule,
    severity: "high",
    path,
    line,
    danger,
    consequence,
    fix,
    manual: null,
  };
}

function linkEscapes(root        , link        )          {
  let target        ;
  try {
    target = realpathSync(link);
  } catch {
    try {
      target = resolveLinkTarget(link);
    } catch {
      return false;
    }
  }
  const outside = relative(root, target);
  return (
    outside === ".." ||
    outside.startsWith(`..${sep}`) ||
    isAbsolute(outside)
  );
}

function resolveLinkTarget(link        )         {
  return resolve(dirname(link), readlinkSync(link));
}

export const checkDeletes        = (root) => {
  const findings                 = [];
  const files = walkFiles(root);

  for (const file of files) {
    const path = repoPath(root, file);
    if (!isScriptFile(path)) continue;
    const text = readText(file);
    if (text === "") continue;
    const lines = text.split(/\r?\n/);
    const riskyLines           = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!isRecursiveDelete(line)) continue;
      if (!hasUnguardedTarget(line)) continue;
      const lineNumber = index + 1;
      riskyLines.push(lineNumber);
      findings.push(
        finding(
          "recursive-delete-unguarded-target",
          path,
          lineNumber,
          DELETE_DANGER,
          DELETE_CONSEQUENCE,
          DELETE_FIX,
        ),
      );
    }

    const isShellScript = /\.(sh|bash)$/i.test(path.slice(path.lastIndexOf("/") + 1));
    if (isShellScript && riskyLines.length > 0 && !SET_U_RE.test(text)) {
      findings.push(
        finding("missing-set-u", path, null, SET_U_DANGER, SET_U_CONSEQUENCE, SET_U_FIX),
      );
    }
  }

  for (const link of walkLinks(root)) {
    if (!linkEscapes(root, link)) continue;
    const path = repoPath(root, link);
    findings.push(
      finding("link-escapes-repo", path, null, LINK_DANGER, LINK_CONSEQUENCE, LINK_FIX),
    );
  }

  findings.sort(
    (a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule),
  );
  return findings;
};

export default checkDeletes;
