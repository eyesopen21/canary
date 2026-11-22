---
status: accepted
date: 2026-11-22
decision-makers: Canary maintainers
---

# Split the hook performance target from the OS runtime startup cost

## Context and Problem Statement

CAN-N-05 originally set one absolute target: a hook answer in under 100 ms per command. Repeated local Windows measurements showed that spawning the runtime dominates that number. The `node -e ""` floor was 1177.66 ms in an earlier session and 113.02 ms, 138.45 ms, 240.88 ms and 199.68 ms in later runs on the same host. The in-process decision path measured 0.03–0.07 ms p50 throughout. Startup snapshots of a trivial CommonJS script still measured 172.92 ms, and `NODE_COMPILE_CACHE` gave no reliable gain. Cloudflare Code Mode [S31] reduces LLM token use and tool-call round-trips but does not remove the local process spawn, and would put an LLM and a remote Worker in the decision path, which [ADR-0001](0001-deterministic-core-without-llm.md) and CAN-N-01 prohibit.

The team does not want to maintain a cross-platform process manager on Windows for this MVP, and the MCP persistent-server path remains an opt-in proposal in [ADR-0008](0008-mcp-tool-hooks.md). A single absolute wall-clock target therefore measures the operating system and antivirus more than it measures Canary.

## Decision Drivers

* Keep a meaningful, controllable target for the code the project owns.
* Do not hide the real wall-clock cost users experience.
* Avoid changing the default hook architecture during the MVP.
* Keep the benchmark comparable across runs by publishing the environment and the Node floor with every result.

## Considered Options

1. Keep one absolute wall-clock target below 100 ms. Rejected: unreachable on this Windows host without a persistent process.
2. Split the target: in-process `evaluate()` p50 below 10 ms, with wall-clock latency and the Node floor reported separately. Chosen.
3. Make the persistent MCP server the default hook. Rejected for the MVP: ADR-0008 is still proposed and has open live-agent questions.

## Decision Outcome

Chosen option: **2**. CAN-N-05 now applies to the in-process decision path only. The working target is an `evaluate()` p50 below 10 ms; measured p50 is 0.03–0.07 ms. Every benchmark report MUST still print the full wall-clock median and p90 for each configured hook, the `node -e ""` startup floor, the OS, CPU, Node version and sample count. Those wall-clock numbers are external runtime cost, not a CAN-N-05 result, and MUST NOT be omitted or relabelled as in-process latency.

### Consequences

* Good, because the target measures code the project controls and is already met with margin.
* Good, because users still see the real end-to-end cost and can judge it for their platform.
* Bad, because the 100 ms user experience is not delivered on this Windows host; the distinction must be stated plainly in public text.
* Neutral, because a future accepted ADR-0008 could revisit the wall-clock target if the persistent path becomes the default.

## Confirmation

* `npm run bench` prints the in-process table, the configured-hook wall-clock table and the Node floor, plus an explicit statement of which row CAN-N-05 measures.
* `docs/SRS.md` CAN-N-05 records the split and links to this decision.
* Q20 in `docs/open-questions.md` is resolved with the maintainer decision and the measurements that motivated it.

## More Information

* Source for the local measurements: `docs/SRS.md` benchmark section and `npm run bench`.
* Code Mode evaluation: [S31](../sources.md).
* Deterministic core constraint: [ADR-0001](0001-deterministic-core-without-llm.md).
