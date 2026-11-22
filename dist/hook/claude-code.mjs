import * as __native0 from "node:fs";
import * as __native1 from "node:os";
import * as __native2 from "node:path";
import * as __native3 from "node:url";

const __externals = {
  "node:fs": { ...__native0, default: __native0.default ?? __native0 },
  "node:os": { ...__native1, default: __native1.default ?? __native1 },
  "node:path": { ...__native2, default: __native2.default ?? __native2 },
  "node:url": { ...__native3, default: __native3.default ?? __native3 },
};
const __factories = {
  "hook/claude-code.js": (__exports, __require) => {
    const __imported0 = __require("adapters/claude-code.js");
    const createClaudeCodeAdapter = __imported0["createClaudeCodeAdapter"];
                                                                      
                                                           
    const __imported1 = __require("hook/runtime.js");
    const createHookEvaluator = __imported1["createHookEvaluator"];
    const hookExecution = __imported1["hookExecution"];
    const startHookIfDirect = __imported1["startHookIfDirect"];
    
    function handleHookEvent(payload         , runtime              = {}) {
      let evaluation                              ;
      const evaluator = createHookEvaluator(runtime.env ?? process.env, (result) => { evaluation = result; });
      const output = createClaudeCodeAdapter(evaluator)(payload                   );
      return hookExecution(evaluation, output);
    }
    
    function startHook()       {
      startHookIfDirect(import.meta.url, handleHookEvent, () => ({
        systemMessage: "Canary could not evaluate the hook event. Check the hook configuration.",
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Canary could not evaluate the hook event. Check the hook configuration.",
        },
      }));
    }
    
    Object.assign(__exports, { handleHookEvent, startHook });
  },
  "adapters/claude-code.js": (__exports, __require) => {
    /**
     * Claude Code PreToolUse adapter (CAN-F-19, CAN-I-05, CAN-I-06, CAN-C-03).
     *
     * Pure translation: read only the documented event fields [S1], forward the
     * command to the injected core, and map the decision to Claude Code's JSON.
     * No policy logic lives here (ADR-0005). The caller writes `stdout` and exits
     * with HOOK_EXIT_CODE (0); exit code 1 would be a non-blocking error [S1].
     *
     * An allow returns `null`: print nothing. Never emit
     * `hookSpecificOutput.permissionDecision: "allow"`, which skips the prompt [S1].
     */
    
                                                    
    const __imported0 = __require("adapters/shared.js");
    const CLAUDE_FIELD_LIMIT = __imported0["CLAUDE_FIELD_LIMIT"];
    const truncateAtLimit = __imported0["truncateAtLimit"];
    
    /** Fields documented for a Claude Code PreToolUse event [S1].
     * `permission_mode` is part of the shape but is not used to make decisions. */
                                      
                         
                                        
                   
                               
     
    
                                     
                             
                               
                                 
    
    function createClaudeCodeAdapter(evaluator           )                    {
      return (event, context = {}) => {
        const command = event.tool_input?.command;
        if (typeof command !== "string" || command.length === 0) return null;
    
        const result = evaluator({
          command,
          ...(typeof event.cwd === "string" ? { cwd: event.cwd } : {}),
          ...(context.projectRoot ? { projectRoot: context.projectRoot } : {}),
        });
        const message = truncateAtLimit(result.message ?? "", CLAUDE_FIELD_LIMIT);
    
        if (result.decision === "block") {
          return {
            systemMessage: message,
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "deny",
              permissionDecisionReason: message,
            },
          };
        }
    
        if (result.decision === "warn") {
          return {
            systemMessage: message,
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              additionalContext: message,
            },
          };
        }
    
        return null;
      };
    }
    
    Object.assign(__exports, { createClaudeCodeAdapter });
  },
  "adapters/shared.js": (__exports, __require) => {
    /**
     * Helpers shared by the five thin agent adapters.
     *
     * This module contains no policy logic. It only holds the small bits of
     * formatting that are common to more than one agent's wire format.
     * See ADR-0005 and docs/specs/agent-adapters.md.
     */
    
    /** Canary hooks always exit 0. A non-zero exit is a non-blocking error in
     * Claude Code [S1] and a warning that lets the action run in Gemini CLI [S10]. */
    const HOOK_EXIT_CODE = 0         ;
    
    /** Claude Code caps hook strings at 10,000 characters [S1]. */
    const CLAUDE_FIELD_LIMIT = 10_000         ;
    
    /** Context supplied by the CLI layer, not by the agent event. The CLI resolves
     * the project root from the documented environment variable of each agent
     * (CLAUDE_PROJECT_DIR, CURSOR_PROJECT_DIR, GEMINI_PROJECT_DIR, ...). Adapters
     * never read environment values themselves. */
                                     
                           
     
    
    /** Decision shape shared by Claude Code and Codex PreToolUse hooks [S1][S8].
     * `permissionDecision` is deliberately restricted to `"deny"`: no adapter may
     * emit an explicit allow, which would skip the agent's permission prompt. */
                                       
                            
                           
                                    
                                    
                                          
                                   
        
     
    
    /**
     * Truncate a policy message at an agent field limit, appending `…`.
     * The ellipsis is part of the limit, so the result is at most `limit` chars.
     * Required by the message-fidelity scenario of the agent-adapters spec.
     */
    function truncateAtLimit(text        , limit        )         {
      if (limit < 1) return "";
      if (text.length <= limit) return text;
      return `${text.slice(0, limit - 1)}…`;
    }
    
    /** Serialize an adapter result for stdout. `null` means "print nothing",
     * which is the documented allow behaviour for Claude Code [S1]. */
    function toStdout(output               )         {
      return output === null ? "" : JSON.stringify(output);
    }
    
    Object.assign(__exports, { HOOK_EXIT_CODE, CLAUDE_FIELD_LIMIT, truncateAtLimit, toStdout });
  },
  "hook/runtime.js": (__exports, __require) => {
    const __imported0 = __require("node:fs");
    const readFileSync = __imported0["readFileSync"];
    const realpathSync = __imported0["realpathSync"];
    const __imported1 = __require("node:path");
    const path = __imported1["default"];
    const __imported2 = __require("node:url");
    const fileURLToPath = __imported2["fileURLToPath"];
                                                                    
    const __imported3 = __require("adapters/shared.js");
    const toStdout = __imported3["toStdout"];
    const __imported4 = __require("core/evaluate.js");
    const evaluate = __imported4["evaluate"];
                                                                                    
    
    const ENV_NAMES = [
      "CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "GEMINI_PROJECT_DIR",
      "DATABASE_URL", "POSTGRES_URL", "PGHOST", "MYSQL_HOST", "MONGODB_URI", "MONGO_URL",
    ]         ;
    
                                  
                                               
                   
                                                             
     
    
                                    
                                             
                    
                       
                            
     
    
                                                                                        
    
    function hookEnvironment(environment                                    )                                     {
      return Object.fromEntries(ENV_NAMES.map((name) => [name, environment[name]]));
    }
    
    function createHookEvaluator(
      environment                                    ,
      capture                                    ,
    )                                               {
      const env = hookEnvironment(environment);
      return (input) => {
        const result = evaluate({ ...input, env });
        capture(result);
        return result;
      };
    }
    
    function hookExecution(result                              , output               )                {
      return {
        decision: result?.decision ?? "allow",
        ...(result?.rule ? { rule: result.rule } : {}),
        ...(result?.message ? { message: result.message } : {}),
        output,
      };
    }
    
    function startHookIfDirect(
      moduleUrl        ,
      handler             ,
      onFailure                      ,
    )       {
      const entry = process.argv[1];
      if (!entry) return;
      const modulePath = fileURLToPath(moduleUrl);
      // Node resolves the main ES module to its realpath for `import.meta.url`
      // while `process.argv[1]` keeps the path used to launch it. A hook launched
      // through a symlinked directory (for example a macOS temp dir, where /var
      // points at /private/var) must still be recognized as the direct entry, or
      // it exits successfully without evaluating anything.
      const isDirectEntry = (() => {
        try {
          return realpathSync(entry) === realpathSync(modulePath);
        } catch {
          return path.resolve(entry) === path.resolve(modulePath);
        }
      })();
      if (!isDirectEntry) return;
    
      try {
        const payload          = JSON.parse(readFileSync(0, "utf8"));
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error("Invalid hook event.");
        }
        process.stdout.write(toStdout(handler(payload, { env: process.env, cwd: process.cwd() }).output));
      } catch {
        if (onFailure) {
          process.stdout.write(toStdout(onFailure()));
        } else {
          process.stderr.write("Canary could not evaluate the hook event. Check the hook configuration.\n");
          process.exitCode = 1;
        }
      }
    }
    
    Object.assign(__exports, { hookEnvironment, createHookEvaluator, hookExecution, startHookIfDirect });
  },
  "core/evaluate.js": (__exports, __require) => {
    /**
     * Deterministic hook-policy evaluator (CAN-F-04, CAN-F-05, CAN-F-06, CAN-U-02).
     *
     * Evaluation order: split -> classify each segment -> combine
     * (block > warn > allow; the first blocking segment supplies the message).
     * No LLM, no network, no process execution and no environment values in output.
     */
    
                                                                            
    const __imported0 = __require("core/messages.js");
    const getMessage = __imported0["getMessage"];
    const __imported1 = __require("core/paths.js");
    const resolveProjectRoot = __imported1["resolveProjectRoot"];
    const __imported2 = __require("core/rules.js");
    const classifySegment = __imported2["classifySegment"];
    const __imported3 = __require("core/split.js");
    const firstTrigger = __imported3["firstTrigger"];
    const split = __imported3["split"];
    
    /** The core's public entry point. */
    function evaluate(input                 )                   {
      const root = resolveProjectRoot(input);
      const { segments, unparseable } = split(input.command);
    
      if (unparseable) {
        const token = firstTrigger(input.command);
        if (token !== null) {
          return {
            decision: "block",
            rule: "B0",
            message: getMessage("B0", { token }),
          };
        }
        return { decision: "allow" };
      }
    
      const context = {
        root,
        // Relative delete targets expand from the shell command's working
        // directory; the project root remains the boundary they must stay inside.
        baseDir: input.cwd ?? root,
        env: input.env ?? {},
      };
    
      const matches = segments.flatMap((segment) => classifySegment(segment, context));
    
      const blocked = matches.find((match) => match.decision === "block");
      if (blocked) {
        return {
          decision: "block",
          rule: blocked.rule,
          message: getMessage(blocked.rule, blocked.values),
        };
      }
    
      const warned = matches.find((match) => match.decision === "warn");
      if (warned) {
        return {
          decision: "warn",
          rule: warned.rule,
          message: getMessage(warned.rule, warned.values),
        };
      }
    
      return { decision: "allow" };
    }
    
    Object.assign(__exports, { evaluate });
  },
  "core/messages.js": (__exports, __require) => {
    /**
     * Exact message templates from docs/specs/policy.md#message-text.
     *
     * This module is pure: it performs no I/O, reads no environment and never
     * produces a secret, a host or a command value as text.
     */
    
                                                 
    
    /** Trigger words listed in policy.md#evaluation (B0). */
    const TRIGGER_WORDS = [
      "rm",
      "rimraf",
      "Remove-Item",
      "rmdir",
      "rd",
      "DROP",
      "TRUNCATE",
      "migrate",
      "push",
      "-auto-approve",
    ]         ;
    
    const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
    const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const REMOTE_NAME = /^[A-Za-z0-9._-]+$/;
    const CLEAN_FLAGS = /^-[A-Za-z]+( -[A-Za-z]+)*$/;
    
    const EFFECTS = [
      "DROPS tables",
      "DROPS the database or schema",
      "TRUNCATES tables (deletes every row)",
      "DELETES every row of a table",
      "DROPS a MongoDB database or collection",
      "applies or reverts schema migrations, which can drop tables or columns",
      "RESETS the database schema",
    ]         ;
    
    // Fixed effects exported so the classifier never invents prose.
    const EFFECT = {
      dropsTables: EFFECTS[0],
      dropsDatabaseOrSchema: EFFECTS[1],
      truncatesTables: EFFECTS[2],
      deletesEveryRow: EFFECTS[3],
      dropsMongo: EFFECTS[4],
      migrations: EFFECTS[5],
      resetsSchema: EFFECTS[6],
    }         ;
    
    /** The one non-identifier value that policy.md defines for {var}. */
    const HOST_ARGUMENT = "the --host argument";
    
    function sanitizeTarget(value                    )         {
      const cleaned = (value ?? "").replace(CONTROL_CHARS, "");
      const truncated = cleaned.length > 80 ? cleaned.slice(0, 80) : cleaned;
      return `\`${truncated}\``;
    }
    
    function sanitizeToken(value                    )         {
      const raw = value ?? "";
      const match = TRIGGER_WORDS.find((word) => word.toLowerCase() === raw.toLowerCase());
      // A B0 message must always name one of the fixed trigger words.
      return match ?? "rm";
    }
    
    function sanitizeVar(value                    )         {
      const raw = value ?? "";
      if (raw === HOST_ARGUMENT) return raw; // Fixed policy text, not user input.
      return IDENTIFIER.test(raw) ? `\`${raw}\`` : "the database connection setting";
    }
    
    function sanitizeEffect(value                    )         {
      const raw = value ?? "";
      const match = EFFECTS.find((effect) => effect === raw);
      return match ?? EFFECT.migrations;
    }
    
    function sanitizeRemote(value                    )         {
      const raw = value ?? "";
      return REMOTE_NAME.test(raw) ? `\`${raw}\`` : "the remote";
    }
    
    function sanitizeTool(value                    )         {
      return value === "tofu" ? "tofu" : "terraform";
    }
    
    function sanitizeSubcommand(value                    )         {
      return value === "destroy" ? "destroy" : "apply";
    }
    
    function sanitizeFlags(value                    )         {
      const raw = value ?? "";
      return CLEAN_FLAGS.test(raw) ? raw : "-f";
    }
    
    /**
     * Render the exact template for a rule with policy.md placeholder sanitization.
     */
    function getMessage(rule        , values                        )         {
      switch (rule) {
        case "B0":
          return `Canary blocked this command. Danger: it contains "${sanitizeToken(values.token)}", which Canary treats as destructive, but Canary could not parse the command. Consequence: Canary cannot tell what it would delete or change. Instead: split it into simple commands without nested substitutions.`;
    
        case "B1a":
          return `Canary blocked a recursive delete. Danger: the target ${sanitizeTarget(values.target)} contains a variable or command substitution that Canary cannot resolve before it runs. Consequence: if it expands to an empty or wrong path, the command deletes files outside the intended folder, and they cannot be restored from this machine. Instead: use a literal path inside the project.`;
    
        case "B1b":
          return `Canary blocked a recursive delete. Danger: the pattern ${sanitizeTarget(values.target)} matches nothing or matches paths outside the project root. Consequence: the command could delete files that are not part of this project, and they cannot be restored from this machine. Instead: use a literal path inside the project.`;
    
        case "B1c":
          return `Canary blocked a recursive delete. Danger: ${sanitizeTarget(values.target)} resolves to a path outside the project root, directly or through a link. Consequence: the command deletes files that are not part of this project, and they cannot be restored from this machine. Instead: delete only paths inside the project.`;
    
        case "B1d":
          return `Canary blocked a recursive delete. Danger: ${sanitizeTarget(values.target)} is the project root, your home directory, or a filesystem root. Consequence: the command deletes everything under it, and it cannot be restored from this machine. Instead: delete the specific subfolder you mean.`;
    
        case "B1e":
          return `Canary blocked a recursive delete. Danger: Canary could not determine the project root, so it cannot check where ${sanitizeTarget(values.target)} points. Consequence: the command could delete files outside the project, and they cannot be restored from this machine. Instead: run the agent from the project folder, or ask a human to run this command.`;
    
        case "B2": {
          const variable = sanitizeVar(values.var);
          return `Canary blocked a destructive database command. Danger: ${variable} points to a non-local host, which may be production. Consequence: this command ${sanitizeEffect(values.effect)}, and the data cannot be recovered from this machine. Instead: point ${variable} to a local database, or ask a human to run this command.`;
        }
    
        case "B3": {
          const remote = sanitizeRemote(values.remote);
          return `Canary blocked a force push. Danger: this push rewrites history on ${remote}. Consequence: commits that exist only on ${remote} are lost for everyone who uses it. Instead: push without forcing, or ask a human to approve a force push.`;
        }
    
        case "B4": {
          const tool = sanitizeTool(values.tool);
          return `Canary blocked an infrastructure change without review. Danger: ${tool} ${sanitizeSubcommand(values.subcommand)} with -auto-approve applies changes without showing the plan for approval. Consequence: it can destroy or replace live infrastructure, and deleted resources may not be recoverable. Instead: run ${tool} plan and let a human review and apply it.`;
        }
    
        case "W1": {
          const remote = sanitizeRemote(values.remote);
          return `Canary warning. Danger: --force-with-lease still overwrites commits on ${remote} that your local copy has fetched but not merged. Consequence: those commits are lost for everyone who uses ${remote}. Use it only on a branch nobody else pushes to.`;
        }
    
        case "W2":
          return `Canary warning. Danger: git reset --hard discards every uncommitted change in this working tree. Consequence: those changes cannot be recovered with Git.`;
    
        case "W3":
          return `Canary warning. Danger: git clean ${sanitizeFlags(values.flags)} deletes untracked files in this working tree. Consequence: they are not in Git and cannot be recovered with Git.`;
      }
    }
    
    Object.assign(__exports, { TRIGGER_WORDS, EFFECT, HOST_ARGUMENT, getMessage });
  },
  "core/paths.js": (__exports, __require) => {
    /** Project-root resolution and B1 target safety. Only local filesystem reads. */
    
    const __imported0 = __require("node:fs");
    const fs = __imported0["default"];
    const __imported1 = __require("node:os");
    const os = __imported1["default"];
    const __imported2 = __require("node:path");
    const path = __imported2["default"];
                                                          
    const __imported3 = __require("core/tokens.js");
    const unquote = __imported3["unquote"];
                                                 
    
    /**
     * First available project root, in the order defined by policy.md.
     * OpenCode's `ctx.location.directory` is carried by `input.projectRoot`.
     */
    function resolveProjectRoot(input                 )                     {
      const env = input.env ?? {};
      const candidates = [
        env.CLAUDE_PROJECT_DIR,
        env.CURSOR_PROJECT_DIR,
        env.GEMINI_PROJECT_DIR,
        input.projectRoot,
        input.cwd,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim() !== "") {
          try {
            return path.resolve(candidate);
          } catch {
            // Fall through to the next source.
          }
        }
      }
      return undefined;
    }
    
    function normalizeSeparators(value        )         {
      return value.replace(/\\/g, "/");
    }
    
    function isInside(root        , candidate        )          {
      const relative = path.relative(root, candidate);
      return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
    }
    
    function isFilesystemRoot(candidate        )          {
      const resolved = path.resolve(candidate);
      return resolved === path.parse(resolved).root;
    }
    
    function isHome(candidate        )          {
      const resolved = path.resolve(candidate);
      const home = path.resolve(os.homedir());
      return path.relative(home, resolved) === "";
    }
    
    function hasVariableOrSubstitution(raw        )          {
      return (
        /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\$env:[A-Za-z_][A-Za-z0-9_]*|%[^%]+%|\$\(|`/.test(
          raw,
        )
      );
    }
    
    function hasGlob(raw        )          {
      return /[*?[]/.test(raw);
    }
    
    function wildcardMatch(pattern        , name        )          {
      let source = "";
      for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i] ;
        if (ch === "*") source += ".*";
        else if (ch === "?") source += ".";
        else if (ch === "[") {
          const close = pattern.indexOf("]", i + 1);
          if (close > i + 1) {
            source += pattern.slice(i, close + 1);
            i = close;
          } else {
            source += "\\[";
          }
        } else {
          source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
      }
      return new RegExp(`^${source}$`, process.platform === "win32" ? "i" : "").test(name);
    }
    
    function realPathOrSelf(candidate        )         {
      try {
        return fs.realpathSync.native(candidate);
      } catch {
        return candidate;
      }
    }
    
    /**
     * Classify one delete target. Returns the failing B1 rule, or null when the
     * target is a literal path that is safe inside the project.
     */
    function checkDeleteTarget(
      rawTarget        ,
      root                    ,
      baseDir                    ,
    )                                                                {
      if (hasVariableOrSubstitution(rawTarget)) return "B1a";
      if (root === undefined) return "B1e";
    
      const literal = normalizeSeparators(unquote(rawTarget));
      const base = baseDir ? path.resolve(baseDir) : root;
      const canonicalRoot = realPathOrSelf(root);
    
      if (hasGlob(literal)) {
        const dirname = path.dirname(literal);
        const basename = path.basename(literal);
        // A glob in a directory component cannot be expanded safely here.
        if (hasGlob(dirname)) return "B1b";
    
        const directory = path.resolve(base, dirname);
        let entries          ;
        try {
          entries = fs.readdirSync(directory);
        } catch {
          return "B1b"; // Empty or unreadable expansion fails closed.
        }
        const matches = entries
          .filter((entry) => wildcardMatch(basename, entry))
          .map((entry) => path.resolve(directory, entry));
        if (matches.length === 0) return "B1b";
    
        const directoryIsWholeRoot = path.relative(root, directory) === "";
        if (directoryIsWholeRoot || isHome(directory) || isFilesystemRoot(directory)) {
          const visible = entries.filter((entry) => !entry.startsWith("."));
          if (visible.length > 0 && matches.length === visible.length) return "B1d";
        }
        if (matches.some((match) => !isInside(root, match) || !isInside(canonicalRoot, realPathOrSelf(match)))) return "B1b";
        return null;
      }
    
      const resolved = path.resolve(base, literal);
      if (isFilesystemRoot(resolved) || isHome(resolved)) return "B1d";
      if (path.relative(root, resolved) === "") {
        return "B1d";
      }
      if (!isInside(root, resolved)) return "B1c";
    
      const real = realPathOrSelf(resolved);
      if (path.relative(canonicalRoot, real) === "") {
        return "B1d";
      }
      if (!isInside(canonicalRoot, real)) return "B1c";
      return null;
    }
    
    Object.assign(__exports, { resolveProjectRoot, checkDeleteTarget });
  },
  "core/tokens.js": (__exports, __require) => {
    /** Shell-like tokenizer used by the rule classifiers. No execution, no I/O. */
    
    /**
     * Split a segment into words on unquoted whitespace. Quote characters are
     * kept in the token so that B1 can report the target exactly as written.
     */
    function tokenize(segment        )           {
      const tokens           = [];
      let current = "";
      let quote                   = null;
      let parenDepth = 0;
      let escaped = false;
    
      const push = ()       => {
        if (current) tokens.push(current);
        current = "";
      };
    
      for (let i = 0; i < segment.length; i++) {
        const ch = segment[i] ;
        const next = segment[i + 1];
    
        if (escaped) {
          current += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\" && quote !== "'") {
          current += ch;
          escaped = true;
          continue;
        }
        if (quote !== null) {
          current += ch;
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === "'" || ch === '"') {
          quote = ch;
          current += ch;
          continue;
        }
        if (ch === "$" && next === "(") {
          parenDepth++;
          current += "$(";
          i++; // the for-loop increment consumes the '('
          continue;
        }
        if (parenDepth > 0) {
          if (ch === "(") parenDepth++;
          else if (ch === ")") parenDepth--;
          current += ch;
          continue;
        }
        if (/\s/.test(ch)) {
          push();
          continue;
        }
        current += ch;
      }
      push();
      return tokens;
    }
    
    /** Remove one pair of surrounding quotes from a token. */
    function unquote(token        )         {
      if (
        token.length >= 2 &&
        ((token.startsWith('"') && token.endsWith('"')) ||
          (token.startsWith("'") && token.endsWith("'")))
      ) {
        return token.slice(1, -1);
      }
      return token;
    }
    
    /** Command basename, tolerant of a leading path and Windows separators. */
    function commandName(token        )         {
      const value = unquote(token);
      const parts = value.split(/[\\/]/);
      return parts[parts.length - 1] ?? value;
    }
    
    /** Expand combined short flags (`-rf`) into a set of letters. */
    function shortFlags(tokens          )              {
      const flags = new Set        ();
      for (const token of tokens) {
        const value = unquote(token);
        if (!value.startsWith("-") || value.startsWith("--")) continue;
        for (const letter of value.slice(1)) flags.add(letter);
      }
      return flags;
    }
    
    /** Collect long flags without their `=value` part. */
    function longFlags(tokens          )              {
      const flags = new Set        ();
      for (const token of tokens) {
        const value = unquote(token);
        if (value.startsWith("--")) flags.add(value.split("=")[0] ?? value);
      }
      return flags;
    }
    
    Object.assign(__exports, { tokenize, unquote, commandName, shortFlags, longFlags });
  },
  "core/rules.js": (__exports, __require) => {
    /** Rule classification for B1–B4 and W1–W3. Pure apart from local path checks. */
    
                                                           
    const __imported0 = __require("core/messages.js");
    const EFFECT = __imported0["EFFECT"];
    const __imported1 = __require("core/host.js");
    const findHostSource = __imported1["findHostSource"];
    const isLocalHost = __imported1["isLocalHost"];
    const parseHost = __imported1["parseHost"];
    const __imported2 = __require("core/paths.js");
    const checkDeleteTarget = __imported2["checkDeleteTarget"];
    const __imported3 = __require("core/tokens.js");
    const commandName = __imported3["commandName"];
    const longFlags = __imported3["longFlags"];
    const shortFlags = __imported3["shortFlags"];
    const tokenize = __imported3["tokenize"];
    const unquote = __imported3["unquote"];
    
                                
                   
                         
                                     
     
    
                                            
                               
                                  
                                              
     
    
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
    function classifySegment(segment        , context                       )              {
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
    
    Object.assign(__exports, { classifySegment });
  },
  "core/host.js": (__exports, __require) => {
    /** B2 host resolution. Values are parsed in memory and never returned. */
    
    const __imported0 = __require("node:fs");
    const fs = __imported0["default"];
    const __imported1 = __require("node:path");
    const path = __imported1["default"];
    const __imported2 = __require("core/messages.js");
    const HOST_ARGUMENT = __imported2["HOST_ARGUMENT"];
    const __imported3 = __require("core/tokens.js");
    const unquote = __imported3["unquote"];
    
    const HOST_VARIABLES = [
      "DATABASE_URL",
      "POSTGRES_URL",
      "PGHOST",
      "MYSQL_HOST",
      "MONGODB_URI",
      "MONGO_URL",
    ]         ;
    
                                 
                                                                                    
                       
                    
     
    
    /** Extract the host from a connection string. Returns null if unparseable. */
    function parseHost(value        )                {
      const raw = value.trim().replace(/^['"]|['"]$/g, "");
      if (raw === "") return null;
    
      if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) {
        try {
          const hostname = new URL(raw).hostname;
          return hostname === "" ? null : hostname;
        } catch {
          return null;
        }
      }
    
      // Unix socket paths and relative socket paths count as local.
      if (
        raw.startsWith("/") ||
        raw.startsWith("./") ||
        raw.startsWith("../") ||
        raw.startsWith("~/") ||
        raw.includes("/") ||
        /\.sock$/i.test(raw)
      ) {
        return raw;
      }
    
      if (raw.startsWith("[")) {
        const end = raw.indexOf("]");
        return end > 1 ? raw.slice(1, end) : null;
      }
      if (/^[0-9A-Fa-f:]+$/.test(raw) && raw.includes(":")) {
        return raw; // Bare IPv6, e.g. ::1
      }
    
      let candidate = raw;
      const at = candidate.lastIndexOf("@");
      if (at >= 0) candidate = candidate.slice(at + 1);
      candidate = candidate.split(/[:/]/)[0] ?? "";
      return candidate === "" ? null : candidate;
    }
    
    function parseAssignment(token        )                                         {
      const value = unquote(token);
      const equals = value.indexOf("=");
      if (equals <= 0) return null;
      const name = value.slice(0, equals);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;
      return { name, value: value.slice(equals + 1).replace(/^['"]|['"]$/g, "") };
    }
    
    function envFileValues(root        , file        )                         {
      const values                         = {};
      let text        ;
      try {
        text = fs.readFileSync(path.join(root, file), "utf8");
      } catch {
        return values;
      }
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("export ")) continue;
        const equals = trimmed.indexOf("=");
        if (equals <= 0) continue;
        const name = trimmed.slice(0, equals).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
        values[name] = trimmed.slice(equals + 1).trim().replace(/^['"]|['"]$/g, "");
      }
      return values;
    }
    
    /** Resolve the host source in the priority order defined by policy.md. */
    function findHostSource(
      tokens          ,
      env                                    ,
      root                    ,
    )                    {
      // 1. Explicit -h / --host argument.
      for (let i = 0; i < tokens.length; i++) {
        const token = unquote(tokens[i] ?? "");
        if (token.startsWith("--host=")) {
          return { variable: HOST_ARGUMENT, value: token.slice("--host=".length) };
        }
        if (token === "--host" || token === "-h") {
          const value = unquote(tokens[i + 1] ?? "");
          if (value !== "") return { variable: HOST_ARGUMENT, value };
        }
      }
    
      // 2. Variable assigned inline in the segment.
      for (const token of tokens) {
        const assignment = parseAssignment(token);
        if (assignment && (HOST_VARIABLES                     ).includes(assignment.name)) {
          return { variable: assignment.name, value: assignment.value };
        }
      }
    
      // 3. Hook process environment.
      for (const name of HOST_VARIABLES) {
        const value = env[name];
        if (value !== undefined) return { variable: name, value };
      }
    
      // 4. .env then .env.local in the project root.
      if (root !== undefined) {
        for (const file of [".env", ".env.local"]) {
          const values = envFileValues(root, file);
          for (const name of HOST_VARIABLES) {
            if (values[name] !== undefined) return { variable: name, value: values[name]  };
          }
        }
      }
    
      return null;
    }
    
    /** Service names declared in a Compose file in the project root. */
    function composeServices(root        )              {
      const services = new Set        ();
      for (const file of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
        let text        ;
        try {
          text = fs.readFileSync(path.join(root, file), "utf8");
        } catch {
          continue;
        }
        let inServices = false;
        let serviceIndent                = null;
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed === "") continue;
          const indent = line.length - line.trimStart().length;
          if (!inServices) {
            if (/^services\s*:/.test(trimmed)) inServices = true;
            continue;
          }
          if (indent === 0) break;
          const match = /^([A-Za-z0-9._-]+)\s*:/.exec(trimmed);
          if (!match) continue;
          if (serviceIndent === null) serviceIndent = indent;
          if (indent === serviceIndent) services.add(match[1] .toLowerCase());
        }
      }
      return services;
    }
    
    /** Local-host determination from policy.md#local-host. */
    function isLocalHost(host        , root                    )          {
      const value = host.toLowerCase();
      if (value === "localhost" || value.endsWith(".localhost")) return true;
      if (value === "::1") return true;
      if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return true;
      if (
        value.startsWith("/") ||
        value.startsWith("./") ||
        value.startsWith("../") ||
        value.startsWith("~/") ||
        value.includes("/") ||
        value.endsWith(".sock")
      ) {
        return true;
      }
      return root !== undefined && composeServices(root).has(value);
    }
    
    Object.assign(__exports, { parseHost, findHostSource, composeServices, isLocalHost });
  },
  "core/split.js": (__exports, __require) => {
    /**
     * Deterministic, dependency-free command splitter for the Canary hook.
     *
     * It never executes anything and never opens a network connection. It only
     * lexes the supplied string.
     */
    
                                  
                                                                                         
                         
                                                                                 
                           
     
    
                                 
    
                            
                    
                   
                    
                          
     
    
                  
                          
                          
                                          
                     
    
    function isSeparator(ch        )          {
      return ch === ";" || ch === "&" || ch === "|" || ch === "\n" || ch === "\r";
    }
    
    function isWordChar(ch        )          {
      return /[A-Za-z0-9_-]/.test(ch);
    }
    
    function escapeRegExp(value        )         {
      return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    
    /**
     * Read a shell-quoted word starting at `start`. Returns the unquoted body.
     */
    function readQuoted(text        , start        )                {
      const quote = text[start];
      if (quote !== "'" && quote !== '"') return null;
      let body = "";
      let i = start + 1;
      while (i < text.length) {
        const ch = text[i] ;
        if (ch === "\\" && quote === '"' && i + 1 < text.length) {
          body += text[i + 1];
          i += 2;
          continue;
        }
        if (ch === quote) return body;
        body += ch;
        i++;
      }
      return null; // unbalanced
    }
    
    /**
     * Read a bare word starting at `start` (used for `pwsh -Command exit`).
     */
    function readWord(text        , start        )                {
      let i = start;
      while (i < text.length && /\s/.test(text[i] )) i++;
      let word = "";
      while (i < text.length && !/\s/.test(text[i] )) {
        word += text[i];
        i++;
      }
      return word === "" ? null : word;
    }
    
    /**
     * Extract bodies of `bash -c '...'`, `sh -c "..."`, `pwsh -Command ...` and
     * `powershell -Command ...` from an already-split segment.
     */
    function extractNestedShells(segment        )           {
      const bodies           = [];
    
      const cShells = /\b(?:bash|sh)\s+-c\s+/gi;
      for (const match of segment.matchAll(cShells)) {
        const start = match.index + match[0].length;
        const quoted = readQuoted(segment, start);
        const body = quoted ?? readWord(segment, start);
        if (body) bodies.push(body);
      }
    
      const commandShells = /\b(?:pwsh|powershell)\s+-Command\s+/gi;
      for (const match of segment.matchAll(commandShells)) {
        const start = match.index + match[0].length;
        const quoted = readQuoted(segment, start);
        const body = quoted ?? readWord(segment, start);
        if (body) bodies.push(body);
      }
    
      return bodies;
    }
    
    /**
     * Split a command into segments and collect nested bodies for classification.
     */
    function split(command        )              {
      const segments           = [];
      const nested           = [];
      const stack            = [];
      let current = "";
      let unparseable = false;
      let i = 0;
    
      const flush = ()       => {
        const value = current.trim();
        if (value) segments.push(value);
        current = "";
      };
    
      while (i < command.length) {
        const ch = command[i] ;
        const next = command[i + 1];
    
        if (stack.length === 0) {
          if (ch === "'" || ch === '"') {
            stack.push(ch === "'" ? { kind: "single" } : { kind: "double" });
            current += ch;
            i++;
            continue;
          }
          if (ch === "`") {
            stack.push({ kind: "backtick", body: "" });
            current += ch;
            i++;
            continue;
          }
          if (ch === "$" && next === "(") {
            stack.push({ kind: "paren", body: "", depth: 1, quote: null });
            current += "$(";
            i += 2;
            continue;
          }
          if (ch === "\\" && next !== undefined) {
            current += ch + next;
            i += 2;
            continue;
          }
          if (ch === "#") {
            while (i < command.length && command[i] !== "\n" && command[i] !== "\r") i++;
            continue;
          }
          if (ch === "<" && next === "<" && command[i + 2] !== "<") {
            // Here-document. Read the delimiter from the same line; if the closing
            // delimiter is not present in the supplied text, fail closed.
            let j = i + 2;
            if (command[j] === "-") j++;
            while (command[j] === " " || command[j] === "\t") j++;
            let delimiter = "";
            while (j < command.length && isWordChar(command[j] )) {
              delimiter += command[j];
              j++;
            }
            if (delimiter === "") {
              unparseable = true;
              current += ch;
              i++;
              continue;
            }
            const rest = command.slice(j);
            const pattern = new RegExp(
              `(?:^|\\r?\\n)[ \\t]*${escapeRegExp(delimiter)}[ \\t]*(?=\\r?\\n|$)`,
              "m",
            );
            const closing = pattern.exec(rest);
            if (!closing) {
              unparseable = true;
              flush();
              i = command.length;
              break;
            }
            const prefixLength = closing[0].startsWith("\r\n")
              ? 2
              : closing[0].startsWith("\n") || closing[0].startsWith("\r")
                ? 1
                : 0;
            const openingNewline = rest.indexOf("\n");
            const bodyStart = j + (openingNewline >= 0 ? openingNewline + 1 : rest.length);
            const bodyEnd = j + closing.index + prefixLength;
            const body = command.slice(bodyStart, Math.max(bodyStart, bodyEnd));
            if (body.trim()) nested.push(body.trim());
            i = j + closing.index + closing[0].length;
            continue;
          }
          if (isSeparator(ch)) {
            flush();
            i++;
            continue;
          }
          current += ch;
          i++;
          continue;
        }
    
        const top = stack[stack.length - 1] ;
    
        if (top.kind === "single") {
          current += ch;
          if (ch === "'") stack.pop();
          i++;
          continue;
        }
    
        if (top.kind === "double") {
          if (ch === "\\" && next !== undefined) {
            current += ch + next;
            i += 2;
            continue;
          }
          if (ch === "$" && next === "(") {
            stack.push({ kind: "paren", body: "", depth: 1, quote: null });
            current += "$(";
            i += 2;
            continue;
          }
          if (ch === "`") {
            stack.push({ kind: "backtick", body: "" });
            current += ch;
            i++;
            continue;
          }
          current += ch;
          if (ch === '"') stack.pop();
          i++;
          continue;
        }
    
        if (top.kind === "backtick") {
          if (ch === "\\" && next !== undefined) {
            top.body += ch + next;
            current += ch + next;
            i += 2;
            continue;
          }
          if (ch === "$" && next === "(") {
            stack.push({ kind: "paren", body: "", depth: 1, quote: null });
            top.body += "$(";
            current += "$(";
            i += 2;
            continue;
          }
          if (ch === "`") {
            stack.pop();
            current += ch;
            if (top.body.trim()) nested.push(top.body.trim());
            i++;
            continue;
          }
          top.body += ch;
          current += ch;
          i++;
          continue;
        }
    
        // Parenthesized command substitution: track nested parentheses and quotes.
        if (top.quote !== null) {
          const quote = top.quote;
          top.body += ch;
          current += ch;
          if (ch === "\\" && quote !== "'" && next !== undefined) {
            top.body += next;
            current += next;
            i += 2;
            continue;
          }
          if (ch === quote) top.quote = null;
          i++;
          continue;
        }
        if (ch === "'" || ch === '"' || ch === "`") {
          top.quote = ch;
          top.body += ch;
          current += ch;
          i++;
          continue;
        }
        if (ch === "\\" && next !== undefined) {
          top.body += ch + next;
          current += ch + next;
          i += 2;
          continue;
        }
        if (ch === "(") {
          top.depth++;
          top.body += ch;
          current += ch;
          i++;
          continue;
        }
        if (ch === ")") {
          top.depth--;
          top.body += ch;
          current += ch;
          i++;
          if (top.depth === 0) {
            stack.pop();
            if (top.body.trim()) nested.push(top.body.trim());
          }
          continue;
        }
        top.body += ch;
        current += ch;
        i++;
      }
    
      if (stack.length > 0) unparseable = true;
      flush();
    
      for (const segment of segments) {
        nested.push(...extractNestedShells(segment));
      }
    
      return { segments: [...segments, ...nested], unparseable };
    }
    
    /**
     * Find the first trigger word of B1–B4 in raw text, in text order.
     * Returns the canonical spelling from policy.md, or null.
     */
    function firstTrigger(raw        )                {
      const triggers = [
        "rm",
        "rimraf",
        "Remove-Item",
        "rmdir",
        "rd",
        "DROP",
        "TRUNCATE",
        "migrate",
        "push",
        "-auto-approve",
      ];
      let best                                          = null;
      for (const trigger of triggers) {
        const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const word = trigger.startsWith("-") ? escaped : `\\b${escaped}\\b`;
        const match = new RegExp(word, "i").exec(raw);
        if (match && (best === null || match.index < best.index)) {
          best = { index: match.index, value: trigger };
        }
      }
      return best?.value ?? null;
    }
    
    Object.assign(__exports, { split, firstTrigger });
  },
};
const __cache = Object.create(null);
function __require(id) {
  if (Object.hasOwn(__externals, id)) return __externals[id];
  if (Object.hasOwn(__cache, id)) return __cache[id];
  const factory = __factories[id];
  if (!factory) throw new Error("Unknown bundled module.");
  const exports = Object.create(null);
  __cache[id] = exports;
  factory(exports, __require);
  return exports;
}

const __entry = __require("hook/claude-code.js");
__entry.startHook();
