---
status: accepted
date: 2026-11-22
decision-makers: Canary maintainers
---

# Commit built JavaScript for marketplace installs

## Context and Problem Statement

The package's TypeScript source is stripped to JavaScript by `npm run build`, and the generated JavaScript lives in `dist/`. GitHub plugin and extension installs must be runnable from the repository contents. `dist/` was ignored, and the executable preferred `src/cli/main.ts` whenever that file existed. An install from GitHub therefore selected TypeScript and paid type-stripping startup cost on every hook invocation.

The Claude Code plugin reference [S4], Codex hooks documentation [S8], and Gemini CLI extension reference [S12] describe manifests, hook files, and package layouts; none documents an install-time build or TypeScript compilation step. This was re-checked against the live pages on 2026-11-22 (Q25 in [open-questions.md](../open-questions.md)). In Claude Code, `${CLAUDE_PLUGIN_ROOT}` resolves to "the plugin's installed version" and is used for "scripts, binaries, and config files bundled with the plugin" [S4]. Codex loads plugin hooks from `hooks/hooks.json` in the plugin root or a `hooks` entry in `.codex-plugin/plugin.json`; the packaging page [S8] links states: "Hook scripts must exist in the execution environment; installing a plugin on the web doesn't deploy them" and "Codex downloads the package without running lifecycle scripts" [S32]. Gemini CLI states: "Gemini CLI creates a copy of the extension during installation. You must run `gemini extensions update` to pull changes from the source" [S12]. This is a documentation-level finding; no live install in the three agents was performed. Canary cannot rely on these marketplace installers to build `dist/`.

## Decision Drivers

* GitHub installs and `git archive HEAD` copies must contain the runnable hook entry.
* Hook execution must use emitted JavaScript, with TypeScript source available only for explicit development.
* Users should not have to select a special branch or ref to get a working install.

## Considered Options

* Commit `dist/` alongside its TypeScript sources.
* Keep `dist/` out of the main branch and provide release branches or tags containing generated output.

## Decision Outcome

Chosen option: commit `dist/` alongside its TypeScript sources. Remove the `dist/` ignore rule and update generated JavaScript whenever source changes are built. The executable runs `dist/cli/entry.js`. Command hooks run the self-contained per-agent bundles in `dist/hook/` described in the amendment below. `bin/canary.js` may select `src/cli/entry.ts` only when `CANARY_DEV=1` is explicitly set. `canary init` writes commands that invoke Node with an absolute path to the installed package's built bundle; Claude Code uses `command` plus `args` so it spawns Node directly in exec form [S1].

The packaging test creates an archive based on `HEAD` with only the package runtime paths overlaid from the working tree, then runs the packaged bundle under a module resolver that rejects `.ts` imports. On a clean committed checkout, the archived tree is the `HEAD` tree itself.

## Consequences

* Good, because Claude Code, Codex, and Gemini CLI GitHub installs get runnable output without a marketplace build step or special release ref.
* Good, because the same committed files are tested in the archive layout users install.
* Bad, because every source change affecting the CLI must be followed by `npm run build` and a `dist/` update.
* Bad, because generated files add review noise; the archive packaging test catches missing or stale runtime output.

## Alternatives Considered

### Release branch or tag with generated JavaScript

Rejected: each marketplace install would need to select the release branch or a release tag, and maintainers would need to keep that ref synchronized with source. The main branch and its archives would remain non-runnable, despite the documented GitHub-install paths.

## Amendment: per-agent hook bundles (2026-11-22)

The decision to commit `dist/` is unchanged. `scripts/build.mjs` now also emits `dist/hook/<agent>.mjs`, one self-contained module per agent that inlines the shared core and only that agent's adapter, imports only `node:` built-ins, reads stdin and writes stdout, and does not pass through `cli/main`. Versioned hook manifests and `canary init` point at these bundles; `bin/canary.js` and the opt-in MCP server still use `dist/cli/entry.js`. This keeps the marketplace property that no install-time build is needed and removes the CLI dispatch from the hook process. The build fails if a bundle still contains a relative import, and CAN-T-03/CAN-T-04 exercise the bundles directly. No new build dependency was introduced.

## More Information

* [ADR-0006](0006-zero-dependency-typescript-on-node.md) records the zero-dependency Node build.
* [S1] documents direct-exec hook form with `command` and `args`.
* Marketplace source references: [S4], [S8], [S12], and [S32]. The install-time build provenance check is recorded in [Q25](../open-questions.md#resolved).
