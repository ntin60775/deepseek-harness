/**
 * Default worker budget shared by repository gates, builds, linters, and Vitest configurations.
 *
 * In CI (`CI=true`) the budget is the CPU count Node reports for the runner. Elsewhere it is capped at
 * {@link LOCAL_PARALLELISM_CAP}, while Vitest forks follow {@link defaultTestParallelism}: half the
 * reported CPUs, at least one fork and at most {@link LOCAL_TEST_PARALLELISM_CAP}, because
 * `os.availableParallelism()` reports host CPUs rather than a container's CPU quota and local runs
 * share the workstation. Each tool's explicit override (`DSH_GATE_CONCURRENCY`, `DSH_OXLINT_THREADS`,
 * `DSH_COVERAGE_MAX_WORKERS`, `--maxWorkers`) still wins.
 */

import { availableParallelism } from 'node:os'

/** Largest default worker count outside CI. */
export const LOCAL_PARALLELISM_CAP = 12

/** Largest default Vitest fork count outside CI, the memory guard over the halved local budget. */
export const LOCAL_TEST_PARALLELISM_CAP = 48

/**
 * Resolve the default worker budget for one process.
 * @param env - Environment whose `CI` value selects the CI budget.
 * @param available - CPU count Node reports for this process.
 * @returns `available` in CI, otherwise `available` capped at {@link LOCAL_PARALLELISM_CAP}.
 */
export function defaultParallelism(
  env: NodeJS.ProcessEnv = process.env,
  available: number = availableParallelism(),
): number {
  return env.CI === 'true' ? available : Math.min(available, LOCAL_PARALLELISM_CAP)
}

/**
 * Resolve the default Vitest fork budget for one process.
 *
 * Outside CI the budget is half the reported CPUs, at least one fork, never above
 * {@link LOCAL_TEST_PARALLELISM_CAP}: interactive runs leave the other half of the
 * workstation to the operator, and the cap keeps the
 * [measured fork-memory guard](../.agents/notes/implemented/process/2026-10-12-local-gate-speedups.md)
 * on large hosts. The CI branch serves `run-gates`, which allocates coverage workers from it;
 * `vitest.config.ts` instead passes no `maxWorkers` in CI and keeps Vitest's own default.
 * Explicit overrides win where their consumer applies them: `run-gates` translates
 * `DSH_COVERAGE_MAX_WORKERS` into the coverage environment, and the Vitest CLI applies `--maxWorkers`.
 * @param env - Environment whose `CI` value selects the CI budget.
 * @param available - CPU count Node reports for this process.
 * @returns `available` in CI, otherwise `max(1, min(floor(available / 2), LOCAL_TEST_PARALLELISM_CAP))`.
 */
export function defaultTestParallelism(
  env: NodeJS.ProcessEnv = process.env,
  available: number = availableParallelism(),
): number {
  return env.CI === 'true'
    ? available
    : Math.max(1, Math.min(Math.floor(available / 2), LOCAL_TEST_PARALLELISM_CAP))
}

/**
 * Describe a default worker budget for scheduler and tool start lines.
 * @param env - Environment whose `CI` value selects the CI budget.
 * @param available - CPU count Node reports for this process.
 * @returns The budget and where it came from, for example `12 local default worker(s) of 256 CPU(s)`.
 */
export function describeDefaultParallelism(env: NodeJS.ProcessEnv = process.env, available: number = availableParallelism()): string {
  return env.CI === 'true'
    ? `${String(available)} available CPU(s)`
    : `${String(defaultParallelism(env, available))} local default worker(s) of ${String(available)} CPU(s)`
}
