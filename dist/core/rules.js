/** Rule classification for B1–B4 and W1–W3. Pure apart from local path checks. */

                                                       
import { EFFECT } from "./messages.js";
import { findHostSource, isLocalHost, parseHost } from "./host.js";
import { checkDeleteTarget } from "./paths.js";
import { commandName, longFlags, shortFlags, tokenize, unquote } from "./tokens.js";

                            
               
                     
                                 
 

                                        
                           
                              
                                          
 

const FIND_VALUE_OPTIONS = new Set([
  "-name",
  "-iname",
  "-path",
  "-ipath",
  "-type",
  "-mtime",
  "-atime",
  "-ctime",
  "-size",
  "-user",
  "-group",
  "-perm",
  "-newer",
  "-maxdepth",
  "-mindepth",
  "-regex",
  "-iregex",
]);

function positionalTargets(args          , valueOptions              = new Set())           {
  const targets           = [];
  for (let i = 0; i < args.length; i++) {
    const raw = unquote(args[i] ?? "");
    if (raw === "--" || raw === "") continue;
    if (raw.startsWith("-") || raw.startsWith("/")) {
      if (valueOptions.has(raw.toLowerCase()) && i + 1 < args.length) i++;
      continue;
    }
    targets.push(args[i] );
  }
  return targets;
}

function findTargets(args          )           {
  const targets           = [];
  for (let i = 0; i < args.length; i++) {
    const raw = unquote(args[i] ?? "");
    if (raw === "-delete") break;
    if (FIND_VALUE_OPTIONS.has(raw.toLowerCase()) && i + 1 < args.length) {
      i++;
      continue;
    }
    if (raw.startsWith("-")) continue;
    targets.push(args[i] );
  }
  return targets.length > 0 ? targets : ["."];
}

/** Return the delete targets when the segment is a recursive delete. */
function recursiveDeleteTargets(tokens          )                  {
  const command = commandName(tokens[0] ?? "").toLowerCase();
  const args = tokens.slice(1);

  if (command === "rm") {
    const short = shortFlags(args);
    const longs = longFlags(args);
    const recursive =
      short.has("r") ||
      short.has("R") ||
      longs.has("--recursive") ||
      args.some((token) => unquote(token).toLowerCase() === "-recurse");
    return recursive ? positionalTargets(args) : null;
  }
  if (command === "rimraf") return positionalTargets(args);

  if (command === "remove-item" || command === "ri" || command === "del") {
    const recursive = args.some((token) => unquote(token).toLowerCase() === "-recurse");
    return recursive
      ? positionalTargets(args, new Set(["-path", "-literalpath", "-include", "-exclude"]))
      : null;
  }

  if (command === "rmdir" || command === "rd") {
    const slashS = args.some((token) => /^\/s$/i.test(unquote(token)));
    return slashS ? positionalTargets(args) : null;
  }

  if (command === "find" && args.some((token) => unquote(token) === "-delete")) {
    return findTargets(args);
  }

  return null;
}

function classifyRecursiveDelete(
  tokens          ,
  context                       ,
)                   {
  const targets = recursiveDeleteTargets(tokens);
  if (targets === null || targets.length === 0) return null;
  for (const target of targets) {
    const failed = checkDeleteTarget(target, context.root, context.baseDir);
    if (failed) {
      return { rule: failed, decision: "block", values: { target } };
    }
  }
  return null;
}

function sqlEffect(sql        , hasFile         )                {
  if (/\bDROP\s+DATABASE\b/i.test(sql) || /\bDROP\s+SCHEMA\b/i.test(sql)) {
    return EFFECT.dropsDatabaseOrSchema;
  }
  if (/\bDROP\s+TABLE\b/i.test(sql)) return EFFECT.dropsTables;
  if (/\bTRUNCATE\b/i.test(sql)) return EFFECT.truncatesTables;
  if (/\bDELETE\s+FROM\b/i.test(sql) && !/\bWHERE\b/i.test(sql)) return EFFECT.deletesEveryRow;
  // A file is read by the client; its contents are not available to the hook.
  // Fail closed on the effect while never reading or echoing the file.
  return hasFile ? EFFECT.dropsTables : null;
}

function migrationEffect(tokens          )                {
  const text = tokens.map(unquote).join(" ").toLowerCase();

  if (/\bprisma\s+migrate\s+reset\b/.test(text) || /\bdb:reset\b/.test(text) || /\bmanage\.py\s+flush\b/.test(text)) {
    return EFFECT.resetsSchema;
  }
  if (/\bprisma\s+migrate\s+(?:deploy|dev)\b/.test(text) || /\bprisma\s+db\s+push\b/.test(text)) {
    return EFFECT.migrations;
  }
  if (/\b(?:rails|rake)\s+db:drop\b|\bsequelize\s+db:drop\b|\btypeorm\s+schema:drop\b|\bflyway\s+clean\b|\bliquibase\s+dropall\b/.test(text)) {
    return EFFECT.dropsTables;
  }
  if (
    /\b(?:rails|rake)\s+db:(?:migrate|rollback|schema:load)\b/.test(text) ||
    /\bmanage\.py\s+migrate\b/.test(text) ||
    /\bknex\s+migrate:(?:latest|rollback|up|down)\b/.test(text) ||
    /\bsequelize\s+db:(?:migrate|migrate:undo)\b/.test(text) ||
    /\btypeorm\s+migration:(?:run|revert)\b/.test(text) ||
    /\bdrizzle-kit\s+(?:push|migrate)\b/.test(text) ||
    /\balembic\s+(?:upgrade|downgrade)\b/.test(text) ||
    /\bflyway\s+migrate\b/.test(text) ||
    /\bliquibase\s+(?:update|rollback)\b/.test(text)
  ) {
    return EFFECT.migrations;
  }
  return null;
}

function databaseEffect(tokens          )                {
  const command = commandName(tokens[0] ?? "").toLowerCase();
  const args = tokens.slice(1);

  if (command === "psql" || command === "mysql" || command === "mariadb") {
    const statements           = [];
    let hasFile = false;
    for (let i = 0; i < args.length; i++) {
      const raw = unquote(args[i] ?? "");
      if (/^--(?:command|execute|file)=/.test(raw)) {
        const value = raw.slice(raw.indexOf("=") + 1);
        if (/^--file=/.test(raw)) hasFile = true;
        statements.push(value);
        continue;
      }
      const flag = raw.toLowerCase();
      if (["-c", "-e", "--command", "--execute", "-f", "--file"].includes(flag)) {
        if (flag === "-f" || flag === "--file") hasFile = true;
        const value = unquote(args[i + 1] ?? "");
        if (value) statements.push(value);
        i++;
      }
    }
    return sqlEffect(statements.join(" "), hasFile);
  }

  if (command === "mongosh") {
    const evalText = args
      .map(unquote)
      .filter((value) => /^--eval(?:=|$)/.test(value))
      .map((value) => (value.startsWith("--eval=") ? value.slice(7) : ""))
      .join(" ");
    const full = args.map(unquote).join(" ");
    const candidate = evalText || full;
    if (/dropdatabase\s*\(|\.drop\s*\(/i.test(candidate)) return EFFECT.dropsMongo;
    return null;
  }

  return migrationEffect(tokens);
}

function classifyDatabase(
  tokens          ,
  context                       ,
)                   {
  const effect = databaseEffect(tokens);
  // D2: a destructive database effect is a prerequisite for B2. Returning
  // here keeps env-file resolution (the only filesystem read in this path)
  // off every allow, warn, B1, B3, and B4 segment.
  if (effect === null) return null;

  const source = findHostSource(tokens, context.env, context.root);
  if (source === null) return null; // No host configured: clients default to local.

  const host = parseHost(source.value);
  if (host !== null && isLocalHost(host, context.root)) return null;

  return {
    rule: "B2",
    decision: "block",
    values: { var: source.variable, effect },
  };
}

                   
                     
                 
 

function gitInfo(tokens          )                 {
  if (commandName(tokens[0] ?? "").toLowerCase() !== "git") return null;
  let i = 1;
  while (i < tokens.length) {
    const value = unquote(tokens[i] ?? "");
    if (["-C", "-c", "--git-dir", "--work-tree"].includes(value)) {
      i += 2;
      continue;
    }
    if (value.startsWith("-")) {
      i++;
      continue;
    }
    return { subcommand: value.toLowerCase(), args: tokens.slice(i + 1) };
  }
  return null;
}

function pushRemote(args          )         {
  for (const arg of args) {
    const value = unquote(arg);
    if (value.startsWith("-") || value.startsWith("+") || value.includes(":")) continue;
    return value;
  }
  return "the remote";
}

function classifyGit(tokens          )              {
  const info = gitInfo(tokens);
  if (info === null) return [];

  const args = info.args;
  const longs = longFlags(args);
  const short = shortFlags(args);

  if (info.subcommand === "push") {
    const forcePush =
      longs.has("--force") ||
      longs.has("--mirror") ||
      short.has("f") ||
      args.some((arg) => {
        const value = unquote(arg);
        return value.startsWith("+") && !value.startsWith("-");
      });
    const remote = pushRemote(args);
    if (forcePush) {
      return [{ rule: "B3", decision: "block", values: { remote } }];
    }
    if (longs.has("--force-with-lease")) {
      return [{ rule: "W1", decision: "warn", values: { remote } }];
    }
  }

  if (info.subcommand === "reset" && longs.has("--hard")) {
    return [{ rule: "W2", decision: "warn", values: {} }];
  }

  if (info.subcommand === "clean") {
    const hasForce = short.has("f") || longs.has("--force");
    const hasDeletionFlag =
      short.has("d") ||
      short.has("x") ||
      short.has("X") ||
      longs.has("--directory") ||
      longs.has("--exclude-standard") ||
      longs.has("--ignored");
    if (hasForce && hasDeletionFlag) {
      const flags = args
        .map(unquote)
        .filter((value) => /^-[A-Za-z]+$/.test(value))
        .join(" ");
      return [{ rule: "W3", decision: "warn", values: { flags } }];
    }
  }

  return [];
}

function classifyInfrastructure(tokens          )                   {
  const command = commandName(tokens[0] ?? "").toLowerCase();
  if (command !== "terraform" && command !== "tofu") return null;
  const args = tokens.slice(1).map(unquote);
  const subcommand = args.find((value) => value === "apply" || value === "destroy");
  if (subcommand === undefined) return null;
  const autoApprove = args.some(
    (value) =>
      value === "-auto-approve" ||
      value === "--auto-approve" ||
      value.startsWith("-auto-approve=") ||
      value.startsWith("--auto-approve="),
  );
  if (!autoApprove) return null;
  return {
    rule: "B4",
    decision: "block",
    values: { tool: command, subcommand },
  };
}

/** Classify one segment. Blocks are returned before warnings. */
export function classifySegment(segment        , context                       )              {
  const tokens = tokenize(segment);
  if (tokens.length === 0) return [];

  const matches              = [];
  const b1 = classifyRecursiveDelete(tokens, context);
  if (b1) matches.push(b1);
  const b2 = classifyDatabase(tokens, context);
  if (b2) matches.push(b2);
  const b4 = classifyInfrastructure(tokens);
  if (b4) matches.push(b4);
  matches.push(...classifyGit(tokens));
  return matches;
}
