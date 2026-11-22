# Graph Report - canary  (2026-11-22)

## Corpus Check
- 116 files · ~73,846 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 19 file(s) not represented in the graph (top: (none) 12, .example 2, .jsonc 2)

## Summary
- 1025 nodes · 1709 edges · 58 communities (42 shown, 16 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a68f6434`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- crash-test/index.ts
- rules.ts
- adapters/index.ts
- SRS.md
- findings.ts
- cli.test.ts
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

## God Nodes (most connected - your core abstractions)
1. `unquote()` - 20 edges
2. `checkCredentials()` - 13 edges
3. `checkDatabase()` - 13 edges
4. `getMessage()` - 13 edges
5. `agentConfigCheck()` - 12 edges
6. `checkDeletes()` - 12 edges
7. `checkDeleteTarget()` - 12 edges
8. `GuardError` - 12 edges
9. `ADDED Requirements` - 12 edges
10. `Requirements` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Wave 1 — Independent implementation (parallelizable)` --references--> `Evaluator`  [INFERRED]
  docs/AGENT-WBS.md → src/contract.ts
- `Cursor` --references--> `user_email()`  [INFERRED]
  docs/specs/agent-adapters.md → tests/adapters.test.ts
- `3.1.2 Agent hook interfaces` --references--> `user_email()`  [INFERRED]
  docs/SRS.md → tests/adapters.test.ts
- `3.7 Software system attributes` --references--> `user_email()`  [INFERRED]
  docs/SRS.md → tests/adapters.test.ts
- `T6. Canary leaks a secret` --references--> `user_email()`  [INFERRED]
  docs/THREAT-MODEL.md → tests/adapters.test.ts

## Import Cycles
- None detected.

## Communities (58 total, 16 thin omitted)

### Community 0 - "crash-test/index.ts"
Cohesion: 0.06
Nodes (62): assertStrictlyInside(), buildMinimalEnv(), canonicalTmpRoot(), cleanupRoot(), createSandboxRoot(), GuardContext, GuardError, guardPath() (+54 more)

### Community 1 - "rules.ts"
Cohesion: 0.07
Nodes (61): Decision, RuleId, evaluate(), composeServices(), envFileValues(), findHostSource(), HOST_VARIABLES, HostSource (+53 more)

### Community 2 - "adapters/index.ts"
Cohesion: 0.08
Nodes (50): setup(), ClaudeCodeAdapter, ClaudeCodeEvent, createClaudeCodeAdapter(), ADR-0005, CodexAdapter, CodexEvent, createCodexAdapter() (+42 more)

### Community 3 - "SRS.md"
Cohesion: 0.05
Nodes (42): Agent instructions, Layout, Operational boundaries, Rules, Start here, Workflow, Added, Changelog (+34 more)

### Community 4 - "findings.ts"
Cohesion: 0.08
Nodes (49): appendProjectLog(), outputFile(), readProjectFindings(), statIfPresent(), writeOutput(), writeProjectReport(), badge(), checks (+41 more)

### Community 5 - "cli.test.ts"
Cohesion: 0.05
Nodes (43): ciCheck, CiCheckOptions, createCiCheck(), DEFAULT_AGENT_ACTIONS, finding(), headCheckoutLine(), indentOf(), Line (+35 more)

### Community 6 - "database.ts"
Cohesion: 0.08
Nodes (42): Check, checkCredentials(), CREDENTIAL_PATTERNS, credentialFinding(), gcloudDirectory(), HOME_FILES, homeDirectory(), isPlaceholder() (+34 more)

### Community 7 - "Canary — Software Requirements Specification"
Cohesion: 0.04
Nodes (48): Agent adapters, Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Shared rules for all adapters, Summary (+40 more)

### Community 8 - "agent-config.ts"
Cohesion: 0.10
Nodes (37): agentConfigCheck(), analyzeBypass(), analyzeMcpJson(), analyzeMcpLines(), analyzeMcpToml(), analyzeUnicode(), BIDI, BYPASS_RULES (+29 more)

### Community 9 - "ADDED Requirements"
Cohesion: 0.06
Nodes (34): ADDED Requirements, Purpose, Requirement: Command classification order, Requirement: Destructive database host guard, Requirement: Exact message text and placeholders, Requirement: Git rewrite rules, Requirement: Infrastructure change guard, Requirement: Local hook log (+26 more)

### Community 10 - "Requirements"
Cohesion: 0.06
Nodes (34): hook-policy Specification, Purpose, Requirement: Command classification order, Requirement: Destructive database host guard, Requirement: Exact message text and placeholders, Requirement: Git rewrite rules, Requirement: Infrastructure change guard, Requirement: Local hook log (+26 more)

### Community 11 - "init.ts"
Cohesion: 0.16
Nodes (31): arrayAt(), COMMAND(), failOpenNotice(), addedLines(), applyPlannedWrites(), displayPreview(), findTopLevelArray(), findTopLevelObjectClose() (+23 more)

### Community 12 - "ADDED Requirements"
Cohesion: 0.06
Nodes (31): ADDED Requirements, Purpose, Requirement: Claude Code adapter output, Requirement: Codex adapter output, Requirement: Cursor adapter output, Requirement: Fail-closed setup, Requirement: Gemini CLI adapter output, Requirement: Hook executable is available on PATH (+23 more)

### Community 13 - "Requirements"
Cohesion: 0.06
Nodes (31): agent-adapters Specification, Purpose, Requirement: Claude Code adapter output, Requirement: Codex adapter output, Requirement: Cursor adapter output, Requirement: Fail-closed setup, Requirement: Gemini CLI adapter output, Requirement: Hook executable is available on PATH (+23 more)

### Community 14 - "Hook policy"
Cohesion: 0.10
Nodes (20): B1. Recursive delete with an unresolved target, B2. Destructive database command against a non-local host, B3. Force push, B4. Infrastructure change without review, Blocks, Evaluation, Examples, Hook policy (+12 more)

### Community 15 - "3. What are we going to do about it?"
Cohesion: 0.11
Nodes (19): 1. What are we working on?, 2. What can go wrong?, 3. What are we going to do about it?, 4. Did we do a good enough job?, Assets, Assumptions, Canary threat model, System (+11 more)

### Community 16 - "test"
Cohesion: 0.11
Nodes (18): jobs, test, node, os, name, on, pull_request, push (+10 more)

### Community 17 - "package.json"
Cohesion: 0.12
Nodes (15): bin, canary, description, engines, node, files, license, name (+7 more)

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

## Knowledge Gaps
- **17 isolated node(s):** `mcp-server-git`, `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-fetch`, `@modelcontextprotocol/server-memory`, `ADR-0005` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 483 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `user_email()` connect `Canary — Software Requirements Specification` to `adapters/index.ts`?**
  _High betweenness centrality (0.283) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `unquote()` (e.g. with `classifyInfrastructure()` and `migrationEffect()`) actually correct?**
  _`unquote()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `mcp-server-git`, `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-fetch` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `crash-test/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0639269406392694 - nodes in this community are weakly interconnected._
- **Why does `Agent adapters` connect `Canary — Software Requirements Specification` to `SRS.md`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `checkCredentials()` (e.g. with `scan.ts` and `checks-p0a.test.ts`) actually correct?**
  _`checkCredentials()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `rules.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06659056316590563 - nodes in this community are weakly interconnected._