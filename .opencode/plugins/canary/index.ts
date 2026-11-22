import { execFileSync } from "node:child_process";
import { Plugin } from "@opencode/plugin";
import { fileURLToPath } from "node:url";

const hookBundle = fileURLToPath(new URL("../../../dist/hook/opencode.mjs", import.meta.url));

export default Plugin.define({
  id: "canary",
  async setup(ctx) {
    await ctx.permission.hook("evaluate", async (event) => {
      if (event.action !== "shell") return;
      try {
        const output = execFileSync(process.execPath, [hookBundle], {
          input: JSON.stringify({ action: event.action, resources: event.resources }),
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
          cwd: ctx.location.directory,
          timeout: 10000,
          windowsHide: true,
        });
        if (!output.trim()) return;
        const result = JSON.parse(output) as { effect?: "ask" | "deny"; message?: string };
        if (result.effect === "deny" || result.effect === "ask") {
          event.effect = result.effect;
          event.message = result.message;
        }
      } catch {
        // The hook is a guardrail; command failures leave OpenCode's decision unchanged.
      }
    });
  },
});
