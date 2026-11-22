export const AGENTS = ["claude-code", "codex", "cursor", "gemini-cli", "opencode"]         ;
                                              

const USAGE = [
  "Usage: canary scan [--json] [--badge]",
  "       canary hook --agent <name>",
  "       canary init --agent <name> [--mcp-tool]",
  "       canary mcp-server",
  "       canary crash-test",
  "       canary badge",
].join("\n");

class UsageError extends Error {}

function parseAgent(args          )            {
  const [flag, value] = args;
  if (args.length !== 2 || flag !== "--agent" || !AGENTS.some((agent) => agent === value)) {
    throw new UsageError("Expected --agent with one of " + AGENTS.join(", ") + ".");
  }
  return value             ;
}

function parseInit(args          )                                         {
  if (args[0] !== "--agent" || !AGENTS.some((agent) => agent === args[1])
    || (args.length !== 2 && !(args.length === 3 && args[2] === "--mcp-tool"))) {
    throw new UsageError("Usage: canary init --agent <name> [--mcp-tool]");
  }
  const agent = args[1]             ;
  const mcpTool = args.length === 3;
  if (mcpTool && agent !== "claude-code" && agent !== "codex") {
    throw new UsageError("--mcp-tool is available only for claude-code and codex.");
  }
  return { agent, mcpTool };
}

export async function main(args          )                  {
  const [command, ...options] = args;
  const root = process.cwd();
  try {
    switch (command) {
      case "hook": {
        const agent = parseAgent(options);
        const { runHook } = await import("./hook.js");
        try {
          runHook(agent);
        } catch (error) {
          const message = "Canary could not evaluate the hook event. Check the hook configuration.";
          if (agent === "claude-code") {
            process.stdout.write(JSON.stringify({
              systemMessage: message,
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: message,
              },
            }));
          } else if (agent === "cursor") {
            process.stdout.write(JSON.stringify({
              permission: "deny",
              user_message: message,
              agent_message: message,
            }));
          } else {
            throw error;
          }
        }
        break;
      }
      case "init": {
        const { agent, mcpTool } = parseInit(options);
        const { initAgent } = await import("./init.js");
        initAgent(agent, root, { mcpTool });
        break;
      }
      case "mcp-server": {
        if (options.length) throw new UsageError("Usage: canary mcp-server");
        const { runMcpServer } = await import("../mcp-hook/server.js");
        runMcpServer();
        break;
      }
      case "scan": {
        const flags = new Set(options);
        if (flags.size !== options.length || options.some((option) => !["--json", "--badge"].includes(option))) {
          throw new UsageError("Usage: canary scan [--json] [--badge]");
        }
        const { scan } = await import("./scan.js");
        scan(root, flags.has("--json"), flags.has("--badge"));
        break;
      }
      case "badge": {
        if (options.length) throw new UsageError("Usage: canary badge");
        const { badge } = await import("./scan.js");
        badge(root);
        break;
      }
      case "crash-test": {
        if (options.length) throw new UsageError("Usage: canary crash-test");
        const { runCrashTest } = await import("../crash-test/index.js");
        const report = await runCrashTest();
        for (const { title, withoutCanary, withCanary } of report.scenarios) {
          process.stdout.write(title + "\n");
          process.stdout.write("  Without Canary (" + withoutCanary.label + ") " + withoutCanary.detail + "\n");
          process.stdout.write("  With Canary (" + withCanary.label + ") " + withCanary.detail + "\n");
          if (withCanary.message) process.stdout.write("  " + withCanary.message + "\n");
        }
        if (report.cleanup === "refused") {
          process.stderr.write("Canary could not confirm cleanup of the temporary crash-test directory.\n");
          return 1;
        }
        break;
      }
      case "--help":
      case "-h":
        process.stdout.write(USAGE + "\n");
        break;
      default:
        throw new UsageError(USAGE);
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(error.message + "\n");
      return 2;
    }
    // Paths, input events, exception details and environment values may contain secrets.
    process.stderr.write({
      hook: "Canary could not evaluate the hook event.\n",
      scan: "Canary could not complete the scan.\n",
      badge: "Canary could not create the badge. Check canary/findings.json and output permissions.\n",
      init: "Canary could not update the agent configuration. Check that it is valid and writable.\n",
      "mcp-server": "Canary MCP server could not process the request.\n",
      "crash-test": "Canary could not complete the crash test.\n",
    }[command ?? ""] ?? "Canary could not complete the command.\n");
    return 1;
  }
}
