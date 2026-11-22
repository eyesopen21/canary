// .opencode/plugins/canary/index.ts (design sketch from docs/specs/agent-adapters.md)
import { Plugin } from "@opencode/plugin"
import { evaluate } from "@eyesopen21/canary/core"

export default Plugin.define({
  id: "canary",
  async setup(ctx) {
    await ctx.permission.hook("evaluate", async (event) => {
      if (event.action !== "shell") return
      const result = evaluate({
        commands: event.resources,
        projectRoot: ctx.location.directory,
      })
      if (result.decision === "block") {
        event.effect = "deny"
        event.message = result.message
      } else if (result.decision === "warn") {
        event.effect = "ask"
        event.message = result.message
      }
    })
  },
})
