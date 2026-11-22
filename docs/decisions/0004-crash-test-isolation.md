---
status: accepted
date: 2026-11-22
decision-makers: Canary maintainers
---

# The crash test runs only in an isolated, disposable environment

## Context and Problem Statement

`canary crash-test` shows what three destructive commands do with and without Canary (CAN-F-07). To be convincing, the "without Canary" side has to really run a destructive command. A tool that runs `rm -rf` with an empty variable on the user's machine is exactly the kind of risk Canary audits.

How can the crash test demonstrate real damage without being able to cause any?

## Decision Drivers

* The demo must not touch anything outside a directory created for it (CAN-T-06).
* The demo must not use the network or real credentials (CAN-N-01).
* The result must look like what would happen in a real repository.
* It must work on macOS, Linux, and Windows (CAN-N-03).

## Considered Options

* Real commands in a sandbox directory with strict guards.
* Simulation only: compute and print what each command would delete, without running it.
* Real commands inside a container.

## Decision Outcome

Chosen option: "Real commands in a sandbox directory with strict guards", with simulation as the fallback for any scenario where a guard cannot be satisfied. A container is optional and not required, because many users will not have one installed.

Every scenario MUST meet all of these before it runs:

1. **Fresh directory.** Create a new directory with the operating system's temporary-directory API. Copy into it only the files the scenario needs, never the user's repository with its `.env` files or `.git` credentials.
2. **Substituted environment.** Run the scenario with a minimal environment: `HOME` (and `USERPROFILE` on Windows) set to a subdirectory of the temporary directory, `PATH` reduced to what the scenario needs, and no inherited variables that hold credentials. The fake `DATABASE_URL` points to an address that cannot be reached.
3. **Path guard.** Resolve every target with `realpath`, including symlinks and junctions, and refuse to run unless it is strictly inside the temporary directory. The guard is checked twice: when the scenario is built and immediately before the command runs.
4. **No network.** The database scenario never connects; it shows the hook decision and, without Canary, a simulated result. The force-push scenario pushes to a bare Git repository inside the temporary directory.
5. **Cleanup.** Delete the temporary directory at the end, using the same path guard.
6. **Fail safe.** If any guard fails, skip the "without Canary" run for that scenario and show a simulation, labeled as such.

### Consequences

* Good, because the deletion scenario shows real files disappearing, which is the point of the demo.
* Good, because nothing outside the temporary directory can be reached by construction.
* Bad, because the database scenario is a simulation on the "without Canary" side, since running destructive SQL against a reachable server is not acceptable.
* Bad, because guards add code that must be tested on three operating systems.

### Confirmation

* CAN-T-06: the crash test runs under a file-write watcher; any write outside the temporary directory fails the test.
* A test sets a scenario target to a path outside the temporary directory and checks that the guard refuses it and the scenario falls back to simulation.

## Pros and Cons of the Options

### Real commands in a guarded sandbox directory

* Good, because it is a real demonstration.
* Good, because it needs no extra software.
* Bad, because the guards are safety-critical code.

### Simulation only

* Good, because nothing destructive ever runs.
* Bad, because it is less convincing and does not show that the hook works end to end.

### Real commands inside a container

* Good, because the isolation is stronger.
* Bad, because it requires Docker or similar, which conflicts with a one-command install (CAN-N-02).
* Neutral, because it can be offered as an optional mode later.

## More Information

The notes [S24] list the crash test as the first item to cut if time runs out, and the no-leak test as the item that is never cut. This ADR applies whenever the crash test ships.
