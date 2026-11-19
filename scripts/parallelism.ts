/**
 * Default worker budget and run priority shared by repository gates, builds, linters, and Vitest
 * configurations.
 *
 * In CI (`CI=true`) the budget is the CPU count Node reports for the runner and the priority is
 * untouched. Elsewhere both budgets are halved: gates, builds, and linters take at most
 * {@link LOCAL_PARALLELISM_CAP}, Vitest forks follow {@link defaultTestParallelism} with at most
 * {@link LOCAL_TEST_PARALLELISM_CAP}, because `os.availableParallelism()` reports host CPUs rather
 * than a container's CPU quota and local runs share the workstation. Heavy local entrypoints also
 * call {@link lowerLocalPriority}, so any number of parallel sessions yields CPU to interactive
 * work through the OS scheduler. Each tool's explicit override (`DSH_GATE_CONCURRENCY`,
 * `DSH_OXLINT_THREADS`, `DSH_COVERAGE_MAX_WORKERS`, `--maxWorkers`, `DSH_LOCAL_PRIORITY`) still wins.
 */

import { availableParallelism, setPriority } from 'node:os'

/** Largest default gate worker count outside CI, over the halved local budget. */
export const LOCAL_PARALLELISM_CAP = 12

/** Largest default Vitest fork count outside CI, the memory guard over the halved local budget. */
export const LOCAL_TEST_PARALLELISM_CAP = 48

/** Default nice value for local heavy runs; maps to PRIORITY_LOW on every platform Node supports. */
export const LOCAL_RUN_PRIORITY = 19

/**
 * Resolve the default worker budget for one process.
 * @param env - Environment whose `CI` value selects the CI budget.
 * @param available - CPU count Node reports for this process.
 * @returns `available` in CI, otherwise `max(1, min(floor(available / 2), LOCAL_PARALLELISM_CAP))`.
 */
export function defaultParallelism(
  env: NodeJS.ProcessEnv = process.env,
  available: number = availableParallelism(),
): number {
  return env.CI === 'true'
    ? available
    : Math.max(1, Math.min(Math.floor(available / 2), LOCAL_PARALLELISM_CAP))
}

/**
 * Lower the current process priority for a local heavy run; children inherit it.
 *
 * Called by the heavy entrypoints (`run-gates`, `build`, the root Vitest config), never at module
 * load of this helper. `DSH_LOCAL_PRIORITY` selects an integer nice value 0-19 (0 keeps normal
 * priority); an invalid value throws before any priority change. CI is a no-op. On Windows only
 * the named priority constants are valid nice values, so intermediate custom values fail loud
 * there; the default 19 maps to PRIORITY_LOW everywhere.
 * @param env - Environment whose `CI` and `DSH_LOCAL_PRIORITY` values select the priority.
 * @returns Nothing; the effect is the process priority.
 */
export function lowerLocalPriority(env: NodeJS.ProcessEnv = process.env): void {
  if (env.CI === 'true') return
  const raw = env.DSH_LOCAL_PRIORITY
  let priority = LOCAL_RUN_PRIORITY
  if (raw !== undefined && raw !== '') {
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 19) {
      throw new Error(`parallelism: DSH_LOCAL_PRIORITY must be an integer 0-19, got ${JSON.stringify(raw)}`)
    }
    priority = parsed
  }
  setPriority(0, priority)
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
