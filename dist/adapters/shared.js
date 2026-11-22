/**
 * Helpers shared by the five thin agent adapters.
 *
 * This module contains no policy logic. It only holds the small bits of
 * formatting that are common to more than one agent's wire format.
 * See ADR-0005 and docs/specs/agent-adapters.md.
 */

/** Canary hooks always exit 0. A non-zero exit is a non-blocking error in
 * Claude Code [S1] and a warning that lets the action run in Gemini CLI [S10]. */
export const HOOK_EXIT_CODE = 0         ;

/** Claude Code caps hook strings at 10,000 characters [S1]. */
export const CLAUDE_FIELD_LIMIT = 10_000         ;

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
export function truncateAtLimit(text        , limit        )         {
  if (limit < 1) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

/** Serialize an adapter result for stdout. `null` means "print nothing",
 * which is the documented allow behaviour for Claude Code [S1]. */
export function toStdout(output               )         {
  return output === null ? "" : JSON.stringify(output);
}
