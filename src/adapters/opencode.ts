/**
 * OpenCode permission-hook adapter (CAN-F-19, CAN-I-05, CAN-C-03).
 *
 * OpenCode plugins run in process, so there is no stdin/stdout: the adapter
 * mutates the permission event passed to `ctx.permission.hook("evaluate", ...)`
 * for the `shell` action [S14]. It sets `event.effect = "deny"` on a block and
 * `"ask"` on a warn, with `event.message`. It NEVER sets `effect = "allow"`:
 * an allow leaves the event untouched so the agent's own flow applies [S14].
 * No policy logic here (ADR-0005).
 *
 * `event.resources` is the documented command field [S14]; whether it carries
 * the full command text for `shell` is still open (Q5). Both a single string
 * and a list of strings are accepted and joined as command lines.
 * Fail-closed behaviour is unverified (Q5), so config.ts prints no claim.
 */

import type { Evaluator } from "../contract.ts";
import type { AdapterContext } from "./shared.ts";

export interface OpenCodePermissionEvent {
  action: string;
  resources?: string | readonly string[];
  metadata?: Record<string, unknown>;
  effect?: "allow" | "ask" | "deny";
  message?: string;
}

export type OpenCodeAdapter = (
  event: OpenCodePermissionEvent,
  context?: AdapterContext,
) => OpenCodePermissionEvent;

function commandText(resources: string | readonly string[] | undefined): string {
  if (typeof resources === "string") return resources;
  if (Array.isArray(resources)) return resources.join("\n");
  return "";
}

export function createOpenCodeAdapter(evaluator: Evaluator): OpenCodeAdapter {
  return (event, context = {}) => {
    if (event.action !== "shell") return event;

    const result = evaluator({
      command: commandText(event.resources),
      ...(context.projectRoot ? { projectRoot: context.projectRoot } : {}),
    });

    if (result.decision === "block") {
      event.effect = "deny";
      event.message = result.message ?? "";
    } else if (result.decision === "warn") {
      event.effect = "ask";
      event.message = result.message ?? "";
    }
    // Allow: do nothing. Never assign `event.effect = "allow"`.

    return event;
  };
}
