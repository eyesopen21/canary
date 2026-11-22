/** Shell-like tokenizer used by the rule classifiers. No execution, no I/O. */

/**
 * Split a segment into words on unquoted whitespace. Quote characters are
 * kept in the token so that B1 can report the target exactly as written.
 */
export function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let parenDepth = 0;
  let escaped = false;

  const push = (): void => {
    if (current) tokens.push(current);
    current = "";
  };

  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]!;
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
export function unquote(token: string): string {
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
export function commandName(token: string): string {
  const value = unquote(token);
  const parts = value.split(/[\\/]/);
  return parts[parts.length - 1] ?? value;
}

/** Expand combined short flags (`-rf`) into a set of letters. */
export function shortFlags(tokens: string[]): Set<string> {
  const flags = new Set<string>();
  for (const token of tokens) {
    const value = unquote(token);
    if (!value.startsWith("-") || value.startsWith("--")) continue;
    for (const letter of value.slice(1)) flags.add(letter);
  }
  return flags;
}

/** Collect long flags without their `=value` part. */
export function longFlags(tokens: string[]): Set<string> {
  const flags = new Set<string>();
  for (const token of tokens) {
    const value = unquote(token);
    if (value.startsWith("--")) flags.add(value.split("=")[0] ?? value);
  }
  return flags;
}
