/** Client-only recorded-route resolution for the subagent spawn-card chip. */
import type { SessionProjectionMap } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One model route as the chip displays it: verbatim provider/model plus an optional effort id. */
export interface SubagentRoute {
  provider: string
  model: string
  reasoningEffort?: string
}

type CatalogEntry = SessionProjectionMap['subagentCatalog'][number]

/** Explicit route arguments as read from a call, before any completeness check. */
export interface ExplicitRouteArgs {
  provider?: string | undefined
  model?: string | undefined
  reasoning_effort?: string | undefined
}

/**
 * The catalog row a spawn card names, matched by the child's agent name.
 * Only named rows (continuable or external) can match; unnamed historical
 * rows never resolve, so they cannot chip even with route arguments.
 * @param catalog - The parent's recorded subagent catalog, if projected.
 * @param name - The child name from result metadata or call arguments.
 * @returns The matching entry, or undefined when unnamed or absent.
 */
export function matchCatalogEntry(
  catalog: SessionProjectionMap['subagentCatalog'] | undefined,
  name: string | undefined,
): CatalogEntry | undefined {
  if (name === undefined || name === '') return undefined
  return catalog?.find(entry => 'name' in entry && entry.name === name)
}

/**
 * The local child a matched row addresses, or undefined for external rows.
 * Kept separate from {@link spawnCardRoute} so the view can skip subscribing
 * to an external child's summary entirely.
 * @param entry - The matched catalog row, if any.
 * @returns The child Session id for a local row, else undefined.
 */
export function catalogChildId(entry: CatalogEntry | undefined): SessionId | undefined {
  return entry !== undefined && entry.mode !== 'external' ? entry.id : undefined
}

/**
 * The explicit route a call argues for, admitted only once both provider and
 * model are read; a streaming call with partial arguments yields no chip.
 * @param args - The provider/model/reasoning_effort argument text as read.
 * @returns The argued route, or undefined while either route field is absent.
 */
export function explicitRoute(args: ExplicitRouteArgs): SubagentRoute | undefined {
  const { provider, model, reasoning_effort: effort } = args
  if (provider === undefined || provider === '' || model === undefined || model === '') return undefined
  return { provider, model, ...(effort === undefined || effort === '' ? {} : { reasoningEffort: effort }) }
}

/**
 * Combine the child's recorded selection with the call's explicit arguments.
 * A chip requires a matched local catalog row: unnamed historical rows and
 * external executions never chip, even with route arguments. A local child
 * prefers its recorded selection and falls back to the argued route before its
 * first request.
 * @param entry - The matched catalog row, if any.
 * @param selection - The child's recorded `modelSelection.next`, if projected.
 * @param args - The call's explicit route arguments.
 * @returns The route to chip, or undefined to hide the chip.
 */
export function spawnCardRoute(
  entry: CatalogEntry | undefined,
  selection: SubagentRoute | undefined,
  args: ExplicitRouteArgs,
): SubagentRoute | undefined {
  if (entry === undefined || entry.mode === 'external') return undefined
  return selection ?? explicitRoute(args)
}
