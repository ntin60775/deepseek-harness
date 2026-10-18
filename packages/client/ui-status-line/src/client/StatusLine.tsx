/**
 * Status band under the composer: context occupancy and the input/output token
 * split, the two readings the shipped statistics pills never show.
 *
 * The pills stay mounted beside these segments — the dock lays both out as one
 * band — so their figures, their click-to-open detail panels and their values
 * remain exactly what the base UI offered. Every figure here rides a
 * Host-computed projection, so paging, compaction and a reloaded page cannot
 * change it. A segment whose projection is absent renders nothing.
 *
 * The context segment follows the reference terminal's thresholds: neutral
 * below 50 % of the window, warning to 90 %, error above it.
 */
import { memo, useEffect, type ReactElement } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the useProjection / sessionId standard-prop merge.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: the modelSelection projection key merge.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: the sessionStats projection key merge.
import type {} from '@deepseek-ai/dsh-session-stats/client'
// Type-only: the tokenUsage and contextPressure projection key merges.
import type {} from '@deepseek-ai/dsh-token-meter/client'
import { reasoningLevel } from './reasoning-level.ts'
import type { StatusLineKey } from './locales.ts'

/** Full component props: the slot runtime share plus this feature's copy. */
export type StatusLineProps =
  PropsRuntime<'conversation.composer.dock'> & PropsLocale<'status.line'>

/** Context-occupancy thresholds, as percentages of the reporting window. */
const CONTEXT_WARN = 50
const CONTEXT_CRITICAL = 90

/**
 * Format a token count for the band.
 * @param value - token count.
 * @returns Compact count using K and M suffixes.
 */
function compact(value: number): string {
  if (value < 1_000) return String(Math.round(value))
  if (value < 1_000_000) return `${Math.round(value / 1_000)}K`
  return `${(value / 1_000_000).toFixed(1)}M`
}

/**
 * Publish the live reasoning level on the document so the skin can paint the
 * reasoning rows, the reading the reference terminal takes from its own
 * thinking level. The attribute is retracted with the effect.
 * @param useProjection - the slot's projection hook.
 */
function useReasoningLevel(useProjection: StatusLineProps['useProjection']): void {
  const selection = useProjection('modelSelection')
  const level = reasoningLevel(selection?.next?.reasoningEffort ?? selection?.lastUsed?.reasoningEffort)
  useEffect(() => {
    if (level === undefined) return
    document.body.dataset.reasoningLevel = level
    return () => { delete document.body.dataset.reasoningLevel }
  }, [level])
}

/**
 * Render the status band.
 * @param props - composed slot props carrying the projection hook and copy.
 * @returns the band element, or null while no figure exists.
 */
export const StatusLine = memo(function StatusLine({ useProjection, t }: StatusLineProps) {
  useReasoningLevel(useProjection)
  const usage = useProjection('tokenUsage')
  const pressure = useProjection('contextPressure')

  const capacity = pressure?.contextWindow
  const used = pressure?.projectedTokens ?? pressure?.pressureTokens
  // Occupancy and its capacity travel together: a percentage without the
  // window it measures reads as a number with no meaning.
  const context = capacity !== undefined && used !== undefined && capacity > 0
    ? { pct: (used / capacity) * 100, capacity: compact(capacity) }
    : undefined

  // Prompt-side input is every bucket the request paid for: uncached input plus
  // both cache directions. The shipped pills already carry the total and the
  // rate, so this band adds only the split they never show.
  const input = usage === undefined
    ? undefined
    : usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const output = usage?.outputTokens

  if (context === undefined && input === undefined && output === undefined) return null

  const contextClass = context === undefined || context.pct < CONTEXT_WARN
    ? 'dsh-status-line__context'
    : context.pct >= CONTEXT_CRITICAL
      ? 'dsh-status-line__critical'
      : 'dsh-status-line__warn'

  const segment = (key: StatusLineKey, className: string, body: ReactElement): ReactElement => (
    <span className={`dsh-status-line__seg ${className}`} title={t(key)}>{body}</span>
  )
  const separator = (key: string): ReactElement => (
    <span key={key} className="dsh-status-line__sep" aria-hidden>·</span>
  )

  const parts: ReactElement[] = []
  if (context !== undefined) {
    parts.push(segment('context', contextClass, <>
      <span className="dsh-status-line__glyph" aria-hidden>◫</span>
      {context.pct.toFixed(1)}%<span className="dsh-status-line__dim">/{context.capacity}</span>
    </>))
  }
  if (input !== undefined) {
    parts.push(segment('input', 'dsh-status-line__input', <>
      <span className="dsh-status-line__glyph" aria-hidden>↑</span>
      {compact(input)}
    </>))
  }
  if (output !== undefined) {
    parts.push(segment('output', 'dsh-status-line__output', <>
      <span className="dsh-status-line__glyph" aria-hidden>↓</span>
      {compact(output)}
    </>))
  }

  return (
    <div className="dsh-status-line" data-status-line role="status" aria-label={t('line')}>
      {parts.map((part, index) => (
        <span key={index} className="dsh-status-line__item">
          {index > 0 && separator(`sep-${index}`)}
          {part}
        </span>
      ))}
    </div>
  )
})
