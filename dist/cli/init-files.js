import {
  closeSync, constants, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

                               
                       
                  
                  
 

/** Get or create a nested object, rejecting non-object values. */
export function objectAt(parent                         , key        )                          {
  const value = parent[key];
  if (value === undefined) return (parent[key] = {})                           ;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid hook configuration.");
  return value                           ;
}

function statIfPresent(path        )                                           {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error                         ).code !== "ENOENT") throw error;
  }
}

function safeTarget(root        , relativePath        , createDirectories         )         {
  const absoluteRoot = resolve(root);
  const rootStat = lstatSync(absoluteRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Unsafe project root.");

  const target = resolve(absoluteRoot, relativePath);
  const withinRoot = relative(absoluteRoot, target);
  if (!withinRoot || withinRoot === ".." || withinRoot.startsWith(".." + sep) || isAbsolute(withinRoot)) {
    throw new Error("Invalid configuration path.");
  }
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  let cursor = absoluteRoot;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = join(cursor, segments[index] );
    const stat = statIfPresent(cursor);
    if (!stat) {
      if (createDirectories && index < segments.length - 1) mkdirSync(cursor);
      continue;
    }
    if (stat.isSymbolicLink()) throw new Error("Configuration paths cannot contain links.");
    if (index < segments.length - 1 && !stat.isDirectory()) throw new Error("Configuration parent is not a directory.");
    if (index === segments.length - 1 && (!stat.isFile() || stat.nlink !== 1)) {
      throw new Error("Configuration target must be a regular file.");
    }
  }
  return target;
}

export function readConfiguration(root        , relativePath        )                     {
  const target = safeTarget(root, relativePath, false);
  if (!statIfPresent(target)) return undefined;
  return readFileSync(target, "utf8");
}

export function applyPlannedWrites(root        , writes                )       {
  // Recheck all paths before the first write. Directory creation is deferred until this point.
  for (const write of writes) safeTarget(root, write.relativePath, false);
  for (const write of writes) {
    const target = safeTarget(root, write.relativePath, true);
    const previous = statIfPresent(target);
    const flags = constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0)
      | (previous ? 0 : constants.O_CREAT | constants.O_EXCL);
    const fd = openSync(target, flags, 0o600);
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.nlink !== 1
        || (previous && (opened.ino !== previous.ino || opened.dev !== previous.dev))) {
        throw new Error("Configuration target changed while opening it.");
      }
      ftruncateSync(fd, 0);
      writeFileSync(fd, write.content, "utf8");
    } finally {
      closeSync(fd);
    }
  }
}

function addedLines(text        )         {
  return text.trimEnd().split("\n").map((line) => "+" + line).join("\n") + "\n";
}

export function displayPreview(writes                )       {
  process.stdout.write("Canary init preview (existing non-Canary settings are preserved):\n");
  for (const write of writes) {
    process.stdout.write("\n--- " + write.relativePath + " ---\n");
    process.stdout.write(write.preview);
    if (!write.preview.endsWith("\n")) process.stdout.write("\n");
  }
}

export function writeJsonConfiguration(
  root        ,
  relativePath        ,
  merge                                             ,
  previewAddition         ,
)               {
  const current = readConfiguration(root, relativePath);
  let value                          = {};
  if (current !== undefined) {
    const parsed          = JSON.parse(current);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid JSON configuration.");
    value = parsed                           ;
  }
  const before = JSON.stringify(value);
  const replaced = merge(value);
  return {
    relativePath,
    content: current !== undefined && JSON.stringify(value) === before ? current : JSON.stringify(value, null, 2) + "\n",
    preview: (replaced ? "- Previous Canary hook settings [redacted]\n" : "")
      + addedLines(JSON.stringify(previewAddition, null, 2)),
  };
}

export function writeTextConfiguration(
  root        ,
  relativePath        ,
  merge                                                                        ,
  previewAddition        ,
)               {
  const current = readConfiguration(root, relativePath);
  const result = merge(current);
  return {
    relativePath,
    content: result.changed ? result.content : current ?? result.content,
    preview: addedLines(previewAddition),
  };
}

export function writeOpenCodeJsonc(root        , relativePath        , rule                        )               {
  const current = readConfiguration(root, relativePath);
  let source = current ?? "{}\n";
  const parsed = JSON.parse(withoutTrailingCommas(stripJsonComments(source)))                           ;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid JSONC configuration.");

  const permissions = parsed.permissions;
  if (permissions !== undefined && !Array.isArray(permissions)) throw new Error("Invalid OpenCode permissions configuration.");
  const list = (permissions                                         ) ?? [];
  const marker = JSON.stringify(rule);
  const alreadyPresent = list.some((item) => item && item.action === rule.action
    && item.resource === rule.resource && item.effect === rule.effect);
  if (!alreadyPresent) list.push(rule);
  parsed.permissions = list;

  if (!current) source = "{\n  \"permissions\": [\n    " + marker + "\n  ]\n}\n";
  else if (Array.isArray(permissions) && !alreadyPresent) {
    // Insert the new entry into the existing top-level permissions array without reformatting or
    // echoing/replacing unrelated JSONC values and comments.
    const range = findTopLevelArray(source, "permissions");
    if (!range) throw new Error("Could not safely update OpenCode permissions.");
    const body = stripJsonComments(source.slice(range.start + 1, range.end)).trimEnd();
    const insertion = (body && !body.endsWith(",") ? ",\n    " : "\n    ") + marker + "\n  ";
    source = source.slice(0, range.end) + insertion + source.slice(range.end);
  } else if (!Array.isArray(permissions)) {
    const close = findTopLevelObjectClose(source);
    if (close < 0) throw new Error("Could not safely update OpenCode configuration.");
    const body = stripJsonComments(source.slice(0, close)).trimEnd();
    const addition = (!body.endsWith("{") && !body.endsWith(",") ? ",\n" : "\n") + "  \"permissions\": [\n    " + marker + "\n  ]\n";
    source = source.slice(0, close) + addition + source.slice(close);
  }

  return {
    relativePath,
    content: source,
    preview: addedLines(JSON.stringify(rule, null, 2)),
  };
}

function stripJsonComments(text        )         {
  let out = "";
  let string = false;
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ;
    const next = text[i + 1];
    if (string) {
      out += char;
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') string = false;
    } else if (char === '"') {
      string = true;
      out += char;
    } else if (char === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i += 1;
      }
      out += "\n";
    } else if (char === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < text.length) {
        out += "  ";
        i += 1;
      }
    } else out += char;
  }
  return out;
}

function withoutTrailingCommas(json        )         {
  return json.replace(/"(?:[^"\\]|\\[\s\S])*"|,(?=\s*[}\]])/g, (token) => token === "," ? " " : token);
}

function findTopLevelArray(source        , key        )                                             {
  const json = stripJsonComments(source);
  let objectDepth = 0;
  for (let i = 0; i < json.length; i += 1) {
    const char = json[i] ;
    if (char === '"') {
      const begin = i;
      let escaped = false;
      i += 1;
      for (; i < json.length; i += 1) {
        if (escaped) escaped = false;
        else if (json[i] === "\\") escaped = true;
        else if (json[i] === '"') break;
      }
      if (objectDepth !== 1 || i >= json.length) continue;
      let name         ;
      try { name = JSON.parse(json.slice(begin, i + 1)); } catch { continue; }
      if (name !== key) continue;
      let next = i + 1;
      while (/\s/.test(json[next] ?? "")) next += 1;
      if (json[next] !== ":") continue;
      next += 1;
      while (/\s/.test(json[next] ?? "")) next += 1;
      if (json[next] !== "[") continue;
      const start = next;
      let arrayDepth = 0;
      let inString = false;
      let escape = false;
      for (let cursor = start; cursor < json.length; cursor += 1) {
        const part = json[cursor] ;
        if (inString) {
          if (escape) escape = false;
          else if (part === "\\") escape = true;
          else if (part === '"') inString = false;
        } else if (part === '"') inString = true;
        else if (part === "[") arrayDepth += 1;
        else if (part === "]") {
          arrayDepth -= 1;
          if (arrayDepth === 0) return { start, end: cursor };
        }
      }
      return undefined;
    }
    if (char === "{") objectDepth += 1;
    else if (char === "}") objectDepth -= 1;
  }
  return undefined;
}

function findTopLevelObjectClose(source        )         {
  const json = stripJsonComments(source);
  let depth = 0;
  let string = false;
  let escape = false;
  for (let i = 0; i < json.length; i += 1) {
    const char = json[i] ;
    if (string) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') string = false;
    } else if (char === '"') string = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return i;
  }
  return -1;
}
