/**
 * Reasoning level of the live model selection, normalized for presentation.
 *
 * Providers spell the same ladder differently (`x-high`, `veryhigh`, `med`),
 * while the skin paints a fixed set of levels. This module owns that mapping so
 * the reading is decided once, in the browser half, from the durable
 * `modelSelection` projection.
 */

/** Canonical levels, ordered as the reference terminal colors its thinking ladder. */
export const REASONING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** One canonical reasoning level. */
export type ReasoningLevel = typeof REASONING_LEVELS[number]

/** Provider spellings that mean one canonical level. */
const ALIASES: Record<string, ReasoningLevel> = {
  none: 'off',
  off: 'off',
  disabled: 'off',
  minimal: 'minimal',
  min: 'minimal',
  low: 'low',
  light: 'low',
  medium: 'medium',
  med: 'medium',
  moderate: 'medium',
  default: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  'x-high': 'xhigh',
  veryhigh: 'xhigh',
  'very-high': 'xhigh',
  max: 'max',
  maximum: 'max',
}

/**
 * Normalize one provider effort string.
 * @param effort - the effort the request header carried, if any.
 * @returns the canonical level, or undefined when the provider names none.
 */
export function reasoningLevel(effort: string | undefined): ReasoningLevel | undefined {
  if (effort === undefined) return undefined
  return ALIASES[effort.trim().toLowerCase()]
}
