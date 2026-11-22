/**
 * Codex PreToolUse adapter (CAN-F-19, CAN-I-05, CAN-C-03).
 *
 * Same decision JSON as Claude Code [S8], but the event has fewer fields.
 * Emit ONLY the documented fields: `permissionDecision: "ask"`, legacy
 * `decision: "approve"`, `continue`, `stopReason` and `suppressOutput` mark the
 * hook run as failed and let the command run [S8]. No policy logic here
 * (ADR-0005); an allow prints nothing and never sets an explicit allow.
 * The fail-open behaviour on hook errors is a documented residual risk (Q6).
 */

                                                
import {
  CLAUDE_FIELD_LIMIT,
                      
                        
  truncateAtLimit,
} from "./shared.js";

/** Fields documented for a Codex PreToolUse event [S8]. */
                             
                     
                                    
               
 

                            
                    
                           
                             

export function createCodexAdapter(evaluator           )               {
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
