/**
 * Public surface of the five thin agent adapters (WP-02).
 *
 * Each factory receives an injected `Evaluator` from `../contract.ts`; the
 * core implementation is wired in later (WP-08). None of these modules make
 * policy decisions, open a network connection, or read environment values.
 */

export {
                         
                       
  createClaudeCodeAdapter,
} from "./claude-code.js";
export {
                    
                  
  createCodexAdapter,
} from "./codex.js";
export {
                     
                            
                   
                    
                          
                        
  createCursorAdapter,
} from "./cursor.js";
export {
                       
                        
                               
                      
                       
  createGeminiCliAdapter,
} from "./gemini-cli.js";
export {
                       
                               
  createOpenCodeAdapter,
} from "./opencode.js";

export {
  CLAUDE_CODE_FAIL_CLOSED,
  CURSOR_FAIL_CLOSED,
  FAIL_OPEN_NOTICE,
                     
} from "./config.js";

export {
  CLAUDE_FIELD_LIMIT,
  HOOK_EXIT_CODE,
                      
                        
  toStdout,
  truncateAtLimit,
} from "./shared.js";
