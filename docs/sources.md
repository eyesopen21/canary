# Sources

Every factual claim about an agent, protocol, or standard in this repository cites one of the sources below by its ID, for example `[S1]`. All web sources were accessed on **2026-11-22**. If a source changes, the claim that cites it must be re-checked; see [open-questions.md](open-questions.md).

Claims that have no source here are design decisions of this project, and the documents label them as such.

## Agent hook and plugin systems

| ID | Source | Used for |
| --- | --- | --- |
| S1 | Claude Code, *Hooks reference*. <https://code.claude.com/docs/en/hooks> | Event names, `PreToolUse` input and output fields, exit codes, command hooks' `command` + `args` exec form, `mcp_tool` fields and result handling, `onFailure` (for `mcp_tool`, v2.1.328+), MCP connection timing and launch-time `SessionStart` skips, plugin `hooks/hooks.json`, `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT` |
| S2 | Claude Code, *Configure permissions*. <https://code.claude.com/docs/en/permissions> | Deny rules take precedence over hook decisions; a hook-blocked call stays blocked |
| S3 | Claude Code, *Permission modes*. <https://code.claude.com/docs/en/permission-modes> | `bypassPermissions` behavior and the actions no mode auto-approves |
| S4 | Claude Code, *Plugin manifest reference*. <https://code.claude.com/docs/en/plugins-reference> | `.claude-plugin/plugin.json` and the standard plugin layout; manifest hooks and bundled files loaded from `${CLAUDE_PLUGIN_ROOT}`; no install-time build or TypeScript compilation step is documented (Q25) |
| S8 | OpenAI Codex, *Hooks*. <https://developers.openai.com/codex/hooks> | Codex hook locations, `PreToolUse` deny shape and tool coverage, `mcp_tool` hooks against an already-connected server, unavailable-server fail-open behavior, plugin-bundled hooks loaded from the plugin root or a `.codex-plugin/plugin.json` `hooks` entry with `PLUGIN_ROOT`/`PLUGIN_DATA` and review-before-run; no install-time build step documented (Q25) |
| S9 | Cursor, *Hooks*. <https://cursor.com/docs/agent/hooks> | `hooks.json` schema, `preToolUse` and `beforeShellExecution`, `permission`, `user_message`, `agent_message`, `failClosed` |
| S10 | Gemini CLI, *Gemini CLI hooks*. <https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md> | Event list, exit codes, configuration schema, environment variables, hook fingerprinting |
| S11 | Gemini CLI, *Hooks reference*. <https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md> | `BeforeTool` input and output fields, `SessionStart` |
| S12 | Gemini CLI, *Extensions reference*. <https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md> | Hooks in an extension live in `hooks/hooks.json`; Gemini CLI creates a copy of the extension during install and `gemini extensions update` pulls source changes; `${extensionPath}` substitution; no install-time build step documented (Q25) |
| S25 | Gemini CLI, *Shell tool*. <https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/shell.md> | `run_shell_command` parameters `command`, `description`, `dir_path` |
| S26 | Gemini CLI, *Policy engine*. <https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md> | TOML rules with `decision = "deny"`, `commandPrefix`, approval modes including `yolo`, policy locations |
| S27 | Node.js, *Modules: TypeScript type stripping*. <https://nodejs.org/docs/latest-v22.x/api/typescript.html> | Built-in `node:module.stripTypeScriptTypes` API used by the package build |
| S28 | Google Cloud SDK, *gcloud CLI configurations*. <https://docs.cloud.google.com/sdk/docs/configurations> | Default configuration and credentials directory on supported platforms |
| S29 | OpenSpec, official documentation. <https://openspec.dev/> | OpenSpec artifact workflow and strict validation |
| S31 | Cloudflare, *Code Mode: the better way to use MCP*. <https://blog.cloudflare.com/code-mode/> | Code Mode turns MCP tools into a TypeScript API so an LLM writes one script instead of many tool calls; disposable V8 isolates run it through the Worker Loader API with network blocked and access only through bindings |
| S32 | OpenAI, *Package your plugin*. <https://developers.openai.com/plugins/build/plugins> | Page linked by [S8] for Codex plugin packaging rules: hook scripts must already exist in the execution environment and a web install does not deploy them; npm-sourced packages download without running lifecycle scripts; installing or enabling a plugin does not trust its hooks; no install-time build step (Q25) |
| S33 | Gemini CLI, *Get started*, *Authentication setup*, and *Extensions reference*. <https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/index.md>, <https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.mdx>, <https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md> | CLI installation, Google sign-in, extension installation from a repository or local path, and extension listing |
| S13 | OpenCode, *Plugins*. <https://opencode.ai/docs/plugins> | Plugin configuration and discovery under `.opencode/plugins/` |
| S14 | OpenCode, *Server* (plugin API). <https://opencode.ai/docs/build/plugins/server> | `ctx.permission.hook("evaluate", ...)`, `ctx.tool.hook("execute.before", ...)` |
| S15 | OpenCode, *V1 plugin migration*. <https://opencode.ai/docs/build/plugins/migrate-v1> | Mapping from V1 `tool.execute.before` to V2 hooks |
| S16 | OpenCode, *Permissions*. <https://opencode.ai/docs/permissions> | Permission rules (`action`, `resource`, `effect`) and policies |

## Protocols and standards

| ID | Source | Used for |
| --- | --- | --- |
| S5 | Model Context Protocol, *Specification* (version 2026-07-28). <https://modelcontextprotocol.io/specification/2026-07-28> | Hosts, clients, servers; tool safety principles |
| S6 | Model Context Protocol, *Tools* (2026-07-28). <https://modelcontextprotocol.io/specification/2026-07-28/server/tools> | Tool definition fields, `resource_link`, `structuredContent`, untrusted annotations, server security obligations |
| S7 | Model Context Protocol, *Security Best Practices* (2026-07-28). <https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices> | Local MCP server compromise and its mitigations |
| S17 | IETF, RFC 8174, *Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words*. <https://www.rfc-editor.org/rfc/rfc8174> | Meaning of MUST, SHOULD, MAY in capitals |
| S18 | IETF, RFC 2119, *Key words for use in RFCs to Indicate Requirement Levels*. <https://www.rfc-editor.org/rfc/rfc2119> | Base definitions that RFC 8174 updates |
| S19 | ISO/IEC/IEEE 29148:2018, *Systems and software engineering — Life cycle processes — Requirements engineering*. <https://www.iso.org/standard/72089.html> | SRS outline. The standard is paywalled and was not read in full for this work; see [open-questions.md](open-questions.md) |
| S20 | MADR, *Markdown Architectural Decision Records*, template. <https://github.com/adr/madr/blob/develop/template/adr-template.md> | ADR format |
| S21 | *Threat Modeling Manifesto*. <https://www.threatmodelingmanifesto.org/> | The four questions and the values used to structure the threat model |

## Structure references

| ID | Source | Used for |
| --- | --- | --- |
| S22 | DojoCodingLabs/remotion-superpowers. <https://github.com/DojoCodingLabs/remotion-superpowers> | Multi-agent install layout (`.claude-plugin/`, `.codex-plugin/`, `gemini-extension.json`, `hooks/hooks.json`), README sections, CHANGELOG style |
| S23 | DojoCodingLabs/hacienda-cr. <https://github.com/DojoCodingLabs/hacienda-cr> | `AGENTS.md` as canonical instructions with a short `CLAUDE.md` pointer, `docs/specs/`, CONTRIBUTING structure |

Only the structure of S22 and S23 was reused. No text was copied.

## Project inputs

| ID | Source | Used for |
| --- | --- | --- |
| S24 | Canary design notes, 2026-11-22 (author: @abe). Not published in this repository. | Product scope, the 11 audit checks of the original audit prompt, MVP scope, roadmap, threat model draft |

S24 restates the original 11-check audit prompt. The prompt text itself is not in this repository. Where a requirement comes from a check, the [SRS](SRS.md#appendix-b-the-11-audit-checks) cites it as `S24 check N`.
