# Graph Report - wp-d2-env  (2026-11-22)

## Corpus Check
- 134 files · ~89,312 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 20 file(s) not represented in the graph (top: (none) 13, .example 2, .jsonc 2)

## Summary
- 1212 nodes · 2110 edges · 84 communities (67 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c4139b35`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- crash-test/index.ts
- rules.ts
- adapters/index.ts
- SRS.md
- findings.ts
- contract.ts
- database.ts
- Canary — Software Requirements Specification
- agent-config.ts
- ADDED Requirements
- Requirements
- init.ts
- ADDED Requirements
- Requirements
- Hook policy
- 3. What are we going to do about it?
- test
- package.json
- openspec-explore/SKILL.md
- Contributing to Canary
- 2. Work packages
- Deterministic core with no LLM in the decision path
- The hook is one layer, not the security boundary
- Findings never contain secret values
- The crash test runs only in an isolated, disposable environment
- One shared core with a thin adapter per agent
- issue-readonly.yml
- split.ts
- pr-target.yml
- push-agent.yml
- respond
- issue-no-agent.yml
- compilerOptions
- .mcp.json
- pr-target-safe.yml
- Design
- Proposal
- scripts
- Tasks
- scripts
- scripts
- services
- git
- clean/scripts/safe.sh
- clean.sh
- trap-c3/scripts/safe.sh
- trap-c8/AGENTS.md
- trap-c8/CLAUDE.md
- general.md
- GEMINI.md
- agent.sh
- 2026-11-22-baseline-canary-specs/README.md
- host.ts
- policy.test.ts
- scan.ts
- hook.ts
- cli.test.ts
- ref_node_fs
- bench-hook.mjs
- live-check-setup.mjs
- Run Claude Code and Codex hooks through a stdio MCP server
- bundles.test.ts
- bench-mcp-tool.mjs
- credentials.ts
- user_email
- Install, trust, review, prompt, and check by agent
- build.mjs
- packaging.test.ts
- 3. Specific requirements (P0)
- 1. What are we working on?
- Agent adapters
- 1. Introduction
- checks-p0a.test.ts
- build
- 3.1 External interfaces
- paths.ts
- Open questions and assumptions
- RuleId

## God Nodes (most connected - your core abstractions)
1. `unquote()` - 20 edges
2. `evaluate()` - 17 edges
3. `EvaluationResult` - 16 edges
4. `RuleId` - 13 edges
5. `checkCredentials()` - 13 edges
6. `checkDatabase()` - 13 edges
7. `getMessage()` - 13 edges
8. `createHookEvaluator()` - 13 edges
9. `Requirements` - 13 edges
10. `initAgent()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Wave 1 — Independent implementation (parallelizable)` --references--> `Evaluator`  [INFERRED]
  docs/AGENT-WBS.md → src/contract.ts
- `Open questions about the product` --references--> `evaluate()`  [INFERRED]
  docs/open-questions.md → src/core/evaluate.ts
- `3.4 Performance requirements` --references--> `evaluate()`  [INFERRED]
  docs/SRS.md → src/core/evaluate.ts
- `3.1.2 Agent hook interfaces` --references--> `user_email()`  [INFERRED]
  docs/SRS.md → tests/adapters.test.ts
- `Decision` --references--> `build()`  [INFERRED]
  docs/decisions/0006-zero-dependency-typescript-on-node.md → scripts/build.mjs

## Import Cycles
- None detected.

## Communities (84 total, 17 thin omitted)

### Community 0 - "crash-test/index.ts"
Cohesion: 0.06
Nodes (63): Evaluator, assertStrictlyInside(), buildMinimalEnv(), canonicalTmpRoot(), cleanupRoot(), createSandboxRoot(), GuardContext, GuardError (+55 more)

### Community 1 - "rules.ts"
Cohesion: 0.23
Nodes (22): parseHost(), ClassificationContext, classifyDatabase(), classifyGit(), classifyInfrastructure(), classifyRecursiveDelete(), classifySegment(), databaseEffect() (+14 more)

### Community 2 - "adapters/index.ts"
Cohesion: 0.07
Nodes (66): ClaudeCodeAdapter, ClaudeCodeEvent, createClaudeCodeAdapter(), ADR-0005, CodexAdapter, CodexEvent, createCodexAdapter(), ADR-0005 (+58 more)

### Community 3 - "SRS.md"
Cohesion: 0.06
Nodes (41): Agent instructions, Layout, Operational boundaries, Rules, Start here, Workflow, Added, Changelog (+33 more)

### Community 4 - "findings.ts"
Cohesion: 0.12
Nodes (27): assertSafeText(), buildFindings(), Evidence, EVIDENCE_KINDS, EvidenceKind, FindingDraft, FindingError, FindingsDocument (+19 more)

### Community 5 - "contract.ts"
Cohesion: 0.30
Nodes (11): CheckFinding, Severity, buildFindingsDocument(), compareFindings(), compareStrings(), computeScore(), lineKey(), SEVERITY_WEIGHTS (+3 more)

### Community 6 - "database.ts"
Cohesion: 0.16
Nodes (25): Check, checkDatabase(), composeServices(), databaseHost(), DB_SCHEMES, hasDestructiveScript(), isConfigurationFile(), isLocalHost() (+17 more)

### Community 7 - "Canary — Software Requirements Specification"
Cohesion: 0.18
Nodes (11): 2. References, 4.1 Verification methods, 4.2 MVP acceptance criteria, 4. Verification and acceptance, 5. Roadmap requirements (P1 and P2), 6. Traceability, Appendix A. Assumptions and dependencies, Appendix B. The 11 audit checks (+3 more)

### Community 8 - "agent-config.ts"
Cohesion: 0.05
Nodes (59): agentConfigCheck(), analyzeBypass(), analyzeMcpJson(), analyzeMcpLines(), analyzeMcpToml(), analyzeUnicode(), BIDI, BYPASS_RULES (+51 more)

### Community 9 - "ADDED Requirements"
Cohesion: 0.06
Nodes (34): ADDED Requirements, Purpose, Requirement: Command classification order, Requirement: Destructive database host guard, Requirement: Exact message text and placeholders, Requirement: Git rewrite rules, Requirement: Infrastructure change guard, Requirement: Local hook log (+26 more)

### Community 10 - "Requirements"
Cohesion: 0.06
Nodes (34): hook-policy Specification, Purpose, Requirement: Command classification order, Requirement: Destructive database host guard, Requirement: Exact message text and placeholders, Requirement: Git rewrite rules, Requirement: Infrastructure change guard, Requirement: Local hook log (+26 more)

### Community 11 - "init.ts"
Cohesion: 0.16
Nodes (34): arrayAt(), BUILD_ENTRY, COMMAND(), failOpenNotice(), addedLines(), applyPlannedWrites(), displayPreview(), findTopLevelArray() (+26 more)

### Community 12 - "ADDED Requirements"
Cohesion: 0.06
Nodes (31): ADDED Requirements, Purpose, Requirement: Claude Code adapter output, Requirement: Codex adapter output, Requirement: Cursor adapter output, Requirement: Fail-closed setup, Requirement: Gemini CLI adapter output, Requirement: Hook executable is available on PATH (+23 more)

### Community 13 - "Requirements"
Cohesion: 0.05
Nodes (36): agent-adapters Specification, Purpose, Requirement: Built JavaScript hook runtime and per-agent bundles, Requirement: Claude Code adapter output, Requirement: Codex adapter output, Requirement: Cursor adapter output, Requirement: Fail-closed setup, Requirement: Gemini CLI adapter output (+28 more)

### Community 14 - "Hook policy"
Cohesion: 0.10
Nodes (20): B1. Recursive delete with an unresolved target, B2. Destructive database command against a non-local host, B3. Force push, B4. Infrastructure change without review, Blocks, Evaluation, Examples, Hook policy (+12 more)

### Community 15 - "3. What are we going to do about it?"
Cohesion: 0.20
Nodes (10): 3. What are we going to do about it?, T10. Crash test damages the machine, T1. Destructive database command against a non-local host, T2. Recursive delete outside the project, T3. Untrusted input steers the agent, T4. Indirect execution, T5. Hook not loaded or failing open, T7. Prose rules lost after compaction (+2 more)

### Community 16 - "test"
Cohesion: 0.07
Nodes (26): jobs, test, node, os, name, on, pull_request, push (+18 more)

### Community 17 - "package.json"
Cohesion: 0.11
Nodes (17): bin, canary, description, engines, node, files, license, name (+9 more)

### Community 18 - "openspec-explore/SKILL.md"
Cohesion: 0.17
Nodes (11): Check for context, Ending Discovery, Guardrails, Handling Different Entry Points, OpenSpec Awareness, Planning a Change, The Stance, What You Don't Have To Do (+3 more)

### Community 19 - "Contributing to Canary"
Cohesion: 0.17
Nodes (12): Adding a check, Adding or changing an agent adapter, Before opening a pull request, Code contributions (once code exists), Contributing to Canary, Fixtures and secrets, Improve a policy rule, Pull request guidelines (+4 more)

### Community 20 - "2. Work packages"
Cohesion: 0.17
Nodes (11): 1. Where the requirements live, 2. Work packages, 3. Execution plan, 4. Agent contract, 5. Requirement coverage map, Backlog — not in the MVP, Canary — Agent-oriented Work Breakdown Structure, Wave 0 — Foundation (done) (+3 more)

### Community 21 - "Deterministic core with no LLM in the decision path"
Cohesion: 0.17
Nodes (12): Confirmation, Consequences, Considered Options, Context and Problem Statement, Decision Drivers, Decision Outcome, Deterministic core with no LLM in the decision path, LLM only (+4 more)

### Community 22 - "The hook is one layer, not the security boundary"
Cohesion: 0.17
Nodes (12): Confirmation, Consequences, Considered Options, Context and Problem Statement, Decision Drivers, Decision Outcome, Hook as the boundary, Hook plus verified barriers (+4 more)

### Community 23 - "Findings never contain secret values"
Cohesion: 0.17
Nodes (12): Confirmation, Consequences, Considered Options, Context and Problem Statement, Decision Drivers, Decision Outcome, Findings never contain secret values, Full values with a warning (+4 more)

### Community 24 - "The crash test runs only in an isolated, disposable environment"
Cohesion: 0.17
Nodes (12): Confirmation, Consequences, Considered Options, Context and Problem Statement, Decision Drivers, Decision Outcome, More Information, Pros and Cons of the Options (+4 more)

### Community 25 - "One shared core with a thin adapter per agent"
Cohesion: 0.17
Nodes (12): Confirmation, Consequences, Considered Options, Context and Problem Statement, Decision Drivers, Decision Outcome, More Information, One agent first (+4 more)

### Community 26 - "issue-readonly.yml"
Cohesion: 0.17
Nodes (11): jobs, respond, name, on, issue_comment, permissions, contents, issues (+3 more)

### Community 27 - "split.ts"
Cohesion: 0.26
Nodes (11): Context, escapeRegExp(), extractNestedShells(), isSeparator(), isWordChar(), ParenContext, Quote, readQuoted() (+3 more)

### Community 28 - "pr-target.yml"
Cohesion: 0.18
Nodes (10): jobs, review, name, on, pull_request_target, runs-on, steps, uses (+2 more)

### Community 29 - "push-agent.yml"
Cohesion: 0.18
Nodes (10): runs-on, steps, TOKEN, jobs, check, name, on, push (+2 more)

### Community 30 - "respond"
Cohesion: 0.20
Nodes (9): jobs, respond, name, on, issue_comment, permissions, runs-on, steps (+1 more)

### Community 31 - "issue-no-agent.yml"
Cohesion: 0.22
Nodes (8): runs-on, steps, jobs, greet, name, on, issues, run

### Community 32 - "compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, allowImportingTsExtensions, module, moduleResolution, noEmit, strict, target, include

### Community 33 - ".mcp.json"
Cohesion: 0.32
Nodes (7): fetch, filesystem, memory, npx, @modelcontextprotocol/server-fetch, @modelcontextprotocol/server-filesystem, @modelcontextprotocol/server-memory

### Community 34 - "pr-target-safe.yml"
Cohesion: 0.25
Nodes (7): jobs, label, runs-on, steps, name, on, uses

### Community 35 - "Design"
Cohesion: 0.25
Nodes (7): Context, Decisions, Design, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 36 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 37 - "scripts"
Cohesion: 0.33
Nodes (5): name, scripts, db:reset, lint, test

### Community 38 - "Tasks"
Cohesion: 0.33
Nodes (5): 1. Review the baseline artifacts, 2. Record the tooling in repository documentation, 3. Final verification, Tasks, Workflow follow-up

### Community 39 - "scripts"
Cohesion: 0.40
Nodes (4): name, scripts, clean, test

### Community 40 - "scripts"
Cohesion: 0.40
Nodes (4): name, scripts, clean, ok

### Community 41 - "services"
Cohesion: 0.50
Nodes (3): image, services, db

### Community 58 - "host.ts"
Cohesion: 0.18
Nodes (13): EvaluationResult, composeServices(), EnvFileReader, findEnvFileHostSource(), findHostSource(), findProcessHostSource(), HOST_VARIABLES, HostSource (+5 more)

### Community 59 - "policy.test.ts"
Cohesion: 0.15
Nodes (17): evaluate(), EFFECT, EFFECTS, getMessage(), sanitizeEffect(), sanitizeFlags(), sanitizeRemote(), sanitizeSubcommand() (+9 more)

### Community 60 - "scan.ts"
Cohesion: 0.32
Nodes (11): appendProjectLog(), outputFile(), readProjectFindings(), statIfPresent(), writeOutput(), writeProjectReport(), badge(), checks (+3 more)

### Community 61 - "hook.ts"
Cohesion: 0.17
Nodes (18): AgentName, AGENTS, main(), parseAgent(), parseInit(), USAGE, UsageError, evaluateTool() (+10 more)

### Community 62 - "cli.test.ts"
Cohesion: 0.13
Nodes (14): Agent, AGENTS, assertInitialized(), cli, dirnameOf(), fixtures, freshDirectory(), initTargets (+6 more)

### Community 64 - "bench-hook.mjs"
Cohesion: 0.13
Nodes (11): AGENTS, CORE_EVALUATOR, EVALUATORS, generatedHook(), linearPercentile(), readJson(), ROOT, sample() (+3 more)

### Community 65 - "live-check-setup.mjs"
Cohesion: 0.21
Nodes (16): AGENTS, fsMkdtemp(), git(), gitOutput(), identity, isStrictlyInside(), main(), minimalEnv() (+8 more)

### Community 66 - "Run Claude Code and Codex hooks through a stdio MCP server"
Cohesion: 0.12
Nodes (16): Background daemon or network endpoint, Confirmation, Consequences, Considered Options, Context and Problem Statement, Decision Drivers, Decision Outcome, Extra attack surface (+8 more)

### Community 67 - "bundles.test.ts"
Cohesion: 0.13
Nodes (10): Agent, AGENTS, bundlePath(), FACTORY, MESSAGE, Observed, POLICY_CASES, PolicyCase (+2 more)

### Community 68 - "bench-mcp-tool.mjs"
Cohesion: 0.12
Nodes (8): hookBundle, BIN, commands, eventFor(), measureCommandHook(), ROOT, startMcpServer(), tempRoot

### Community 69 - "credentials.ts"
Cohesion: 0.25
Nodes (13): checkCredentials(), CREDENTIAL_PATTERNS, credentialFinding(), gcloudDirectory(), HOME_FILES, homeDirectory(), isPlaceholder(), isTrackedRegularFile() (+5 more)

### Community 70 - "user_email"
Cohesion: 0.20
Nodes (10): Cursor, 3.7 Software system attributes, T6. Canary leaks a secret, Requirement: Core and adapter boundary, Scenario: Adapter delegates the decision, Scenario: Cursor identity field is ignored, Requirement: Core and adapter boundary, Scenario: Adapter delegates the decision (+2 more)

### Community 71 - "Install, trust, review, prompt, and check by agent"
Cohesion: 0.20
Nodes (10): Claude Code — Q1 (`bypassPermissions`), Codex — Q2 (full-access / approval-free mode), Cursor — Q4 (auto-run mode), Gemini CLI — Q3 (`yolo`), Install, trust, review, prompt, and check by agent, Isolation and expected result, Live agent checks (AC-4), OpenCode (+2 more)

### Community 72 - "build.mjs"
Cohesion: 0.27
Nodes (8): agents, distRoot, hooksTarget, makeBundle(), collect(), moduleId(), parseImportBindings(), sourceRoot

### Community 73 - "packaging.test.ts"
Cohesion: 0.27
Nodes (7): JSON_FILES, PACKAGING_FILES, parseJson(), parseJsonc(), read(), root, stripJsonComments()

### Community 74 - "3. Specific requirements (P0)"
Cohesion: 0.22
Nodes (9): 3.2 Functional requirements, 3.3 Usability requirements, 3.4 Performance requirements, 3.5 Logical data: `findings.json`, 3.6 Design constraints, 3. Specific requirements (P0), Crash test, Hook (+1 more)

### Community 75 - "1. What are we working on?"
Cohesion: 0.22
Nodes (9): 1. What are we working on?, 2. What can go wrong?, 4. Did we do a good enough job?, Assets, Assumptions, Canary threat model, System, Trust boundaries (+1 more)

### Community 76 - "Agent adapters"
Cohesion: 0.25
Nodes (8): Agent adapters, Built JavaScript runtime, Claude Code, Codex, Gemini CLI, OpenCode, Shared rules for all adapters, Summary

### Community 77 - "1. Introduction"
Cohesion: 0.29
Nodes (7): 1.1 Purpose, 1.2 Scope, 1.3 Product perspective, 1.4 Product functions, 1.5 User characteristics, 1.6 Limitations, 1. Introduction

### Community 78 - "checks-p0a.test.ts"
Cohesion: 0.20
Nodes (4): LEAK_TOKENS, ROOT, summary(), tuple()

### Community 79 - "build"
Cohesion: 0.40
Nodes (5): ADR-0006: Zero-dependency TypeScript on Node, Consequences, Context, Decision, build()

### Community 80 - "3.1 External interfaces"
Cohesion: 0.50
Nodes (4): 3.1.1 Command-line interface, 3.1.2 Agent hook interfaces, 3.1.3 Files Canary writes, 3.1 External interfaces

### Community 81 - "paths.ts"
Cohesion: 0.38
Nodes (9): checkDeleteTarget(), hasGlob(), hasVariableOrSubstitution(), isFilesystemRoot(), isHome(), isInside(), normalizeSeparators(), realPathOrSelf() (+1 more)

### Community 82 - "Open questions and assumptions"
Cohesion: 0.25
Nodes (8): Assumptions, Inputs confirmed by the maintainer (2026-11-22), Notes on inputs not used, Open question about the live-check setup, Open questions about the agents, Open questions about the product, Open questions and assumptions, Resolved

### Community 83 - "RuleId"
Cohesion: 0.60
Nodes (5): Decision, RuleId, RuleMatch, ScenarioResult, Case

## Knowledge Gaps
- **17 isolated node(s):** `mcp-server-git`, `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-fetch`, `@modelcontextprotocol/server-memory`, `ADR-0005` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 578 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `evaluate()` connect `policy.test.ts` to `crash-test/index.ts`, `rules.ts`, `adapters/index.ts`, `3. Specific requirements (P0)`, `Open questions and assumptions`, `host.ts`, `split.ts`?**
  _High betweenness centrality (0.163) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `unquote()` (e.g. with `classifyInfrastructure()` and `migrationEffect()`) actually correct?**
  _`unquote()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `mcp-server-git`, `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-fetch` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `crash-test/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06430745814307458 - nodes in this community are weakly interconnected._
- **Why does `Open questions and assumptions` connect `Open questions and assumptions` to `SRS.md`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `evaluate()` (e.g. with `Open questions about the product` and `3.4 Performance requirements`) actually correct?**
  _`evaluate()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `adapters/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07052600646488393 - nodes in this community are weakly interconnected._