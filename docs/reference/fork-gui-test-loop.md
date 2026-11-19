---
node_type: reference
title: GUI development test loop
service: _platform
status: active
updated: 2026-11-19
tags: [testing, gui, developer-loop, fork]
links:
  part_of: [README.md]
  relates_to:
    - ../testing.md
    - ../development.md
---

# GUI development test loop

This fork keeps the plugin and UI edit-verify cycle off the full `test:gui` lane and shares the workstation between interactive work and any number of parallel agent sessions. The owning contracts live in [scripts/parallelism.ts](../../scripts/parallelism.ts), [scripts/run-gui-changed.ts](../../scripts/run-gui-changed.ts), and the [client check ladder](../../packages/client/AGENTS.md); repo-wide tier policy stays in [testing.md](../testing.md).

## Inner loop while editing

A human terminal runs the scoped watch `pnpm exec vitest watch packages/client/<pkg>`: Vitest 4 does not enable watch in a non-TTY, so the flag is explicit, the initial run covers only that package, and saves re-run the affected specs. An agent or other non-TTY context runs one-shot focused specs (`pnpm exec vitest run <file> -t <name>`) or `pnpm run test:gui:changed`. Visual verification goes through the live dev:web HMR page per the [dsh-client-ui-ux](../../.agents/skills/dsh-client-ui-ux/SKILL.md) minimum checks; tests alone do not establish the rendered result.

## Checkpoint before commit

`pnpm run test:gui:changed` selects tracked changes against HEAD plus untracked src sources and spec files in `packages/client` and `packages/host`, and runs `vitest related`; a package that lost a file runs its whole spec scope. An empty selection prints `0 tests selected`; a selection with no related tests prints the selector's blind spots (config, dynamic loading, subprocesses, built artifacts). Both are dev-loop signals, not push evidence. The full `test:gui` lane runs only by explicit request (including ship ticket or spec criteria), for CI diagnosis, or for an irreducibly repository-wide diff.

## Resource sharing across parallel sessions

Local Vitest forks take `max(1, min(floor(available/2), 48))` (`defaultTestParallelism`); local gate, build, typecheck, and lint workers take `max(1, min(floor(available/2), 12))` (`defaultParallelism`). The heavy entrypoints (`run-gates`, `build`, the root Vitest config) lower the process priority to nice 19 (`lowerLocalPriority`), which children inherit, so any number of parallel sessions yields CPU to interactive work through the OS scheduler. `DSH_LOCAL_PRIORITY` selects an integer 0-19 (0 keeps normal priority for a process that starts normal; raising from an inherited low nice needs privilege and fails with a named error), and invalid values fail loud. Direct runs of individual verify-* scripts do not lower priority; use an aggregate or a nice wrapper. CI budgets and priority are untouched, and explicit overrides (`--maxWorkers`, `DSH_GATE_CONCURRENCY`, `DSH_OXLINT_THREADS`, `DSH_COVERAGE_MAX_WORKERS`) win.

## Pre-push and CI

[dsh-pre-push-checks](../../.agents/skills/dsh-pre-push-checks/SKILL.md) selects the narrowest evidence for the outgoing diff. Local assembled-output lanes (focused `DSH_SNAPSHOT=replay pnpm run test:web`, keyless recorded snapshots) remain required for visible-output changes per [testing.md](../testing.md). CI owns exhaustive coverage and the platform matrix.

## Checks that prove this

[scripts/parallelism.spec.ts](../../scripts/parallelism.spec.ts) pins both budgets, the priority contract, and the entrypoint wiring; [scripts/run-gates.spec.ts](../../scripts/run-gates.spec.ts) pins gate allocation; [scripts/lane-test-budget.spec.ts](../../scripts/lane-test-budget.spec.ts) probes the applied root-config budget; [scripts/run-gui-changed.spec.ts](../../scripts/run-gui-changed.spec.ts) pins the selector.
