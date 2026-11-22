import { Plugin } from "@opencode/plugin";
import { hookEvaluator } from "../../../src/cli/hook.ts";
import { createOpenCodeAdapter } from "../../../src/adapters/opencode.ts";

export default Plugin.define({
  id: "canary",
  async setup(ctx) {
    const adapter = createOpenCodeAdapter(hookEvaluator());
    await ctx.permission.hook("evaluate", async (event) => {
      adapter(event, { projectRoot: ctx.location.directory });
    });
  },
});
