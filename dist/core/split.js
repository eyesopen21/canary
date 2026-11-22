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
export function split(command        )              {
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
export function firstTrigger(raw        )                {
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
