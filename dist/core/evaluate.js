/**
 * Deterministic hook-policy evaluator (CAN-F-04, CAN-F-05, CAN-F-06, CAN-U-02).
 *
 * Evaluation order: split -> classify each segment -> combine
 * (block > warn > allow; the first blocking segment supplies the message).
 * No LLM, no network, no process execution and no environment values in output.
 */

                                                                        
import { getMessage } from "./messages.js";
import { resolveProjectRoot } from "./paths.js";
import { classifySegment } from "./rules.js";
import { firstTrigger, split } from "./split.js";

/** The core's public entry point. */
export function evaluate(input                 )                   {
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
