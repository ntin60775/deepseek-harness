/**
 * Model-facing agent rule rendering within an explicit byte budget.
 *
 * One durable message carries the always-apply rule bodies (broadest scope
 * first, most specific last) followed by the on-demand rulebook catalog. When
 * the budget cannot hold every always-apply body, broader rules are omitted
 * first and the most specific surviving body is truncated, each with a notice.
 *
 * @module @deepseek-ai/dsh-agent-rules/render
 */

import { createHash } from 'node:crypto'
import type { Rule } from './rule.ts'

const SYSTEM_REMINDER_OPEN = '<system-reminder>'
const SYSTEM_REMINDER_CLOSE = '</system-reminder>'
const RULES_CONTEXT_INTRO = 'The following rules are active in this session. They come from .omp rule files on disk. Follow them as guidance for all tasks; more specific rules take precedence over broader ones. They do not override system, developer, or direct user instructions.'
const REPLACEMENT_RULES_CONTEXT_INTRO = 'The active rule set changed. This complete rule context replaces all earlier rule contexts in this session.'
const RULEBOOK_INTRO = 'The following additional rules are available on demand:'
const RULEBOOK_OUTRO = "Call the `rule` tool with the exact rule name to load a rule's full body before relying on it. This catalog contains summaries only; do not infer or follow a rule's content until it has been loaded."

/** One rulebook catalog entry exactly as published (unescaped). */
export interface AgentRulesCatalogEntry {
  readonly name: string
  readonly description: string
  readonly globs?: readonly string[]
}

/** Durable identity plus content digest of one published always-apply rule. */
export interface AgentRulesAlwaysApplyRecord {
  readonly name: string
  readonly path: string
  /** SHA-256 hex digest of the published rule body. */
  readonly digest: string
}

/** Byte-accounting record for one truncated always-apply rule body. */
export interface TruncatedRule {
  readonly path: string
  readonly originalBytes: number
  readonly includedBytes: number
}

/** Model-facing text plus omitted and truncated source records. */
export interface RenderedAgentRules {
  readonly text: string
  readonly omitted: string[]
  readonly truncated: TruncatedRule[]
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length <= maxBytes) return value
  let end = Math.max(0, Math.trunc(maxBytes))
  // If the first excluded byte is a UTF-8 continuation byte, the budget cut
  // through a code point. Back up to its lead byte and exclude it too.
  while (end > 0 && (bytes.readUInt8(end) & 0xc0) === 0x80) {
    end -= 1
  }
  return bytes.subarray(0, end).toString('utf8')
}

function escapeRuleFrameBody(body: string): string {
  return body.replaceAll(SYSTEM_REMINDER_CLOSE, '<\\/system-reminder>')
}

/** Normalized, length-bounded catalog description exactly as published (unescaped). */
function catalogDescription(value: string, maxLength: number): string {
  const normalized = value.replaceAll(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`
}

/**
 * Project the rulebook rules into durable catalog entries, applying the
 * description normalization and length cap the model will see.
 * @param rules - discovered rules carrying a description.
 * @param descriptionMaxLength - normalized description length cap.
 * @returns catalog entries in the given order.
 */
export function rulebookCatalogEntries(
  rules: readonly Rule[],
  descriptionMaxLength: number,
): AgentRulesCatalogEntry[] {
  return rules.map(rule => ({
    name: rule.name,
    description: catalogDescription(rule.description ?? '', descriptionMaxLength),
    ...rule.globs === undefined ? {} : { globs: [...rule.globs] },
  }))
}

/**
 * Project always-apply rules into durable digest records.
 * @param rules - published always-apply rules.
 * @returns identity and content-digest records in the given order.
 */
export function alwaysApplyRecords(rules: readonly Rule[]): AgentRulesAlwaysApplyRecord[] {
  return rules.map(rule => ({
    name: rule.name,
    path: rule.displayPath,
    digest: createHash('sha256').update(rule.content).digest('hex'),
  }))
}

/**
 * Order always-apply rules broadest scope first and most specific last: user
 * rules, the sticky user rule, project rules, then the sticky project rule.
 * Budget trimming omits from the front, so the most specific rules survive.
 * @param rules - always-apply rules in discovery order.
 * @returns the rules in render order.
 */
export function orderAlwaysApplyRules(rules: readonly Rule[]): Rule[] {
  const rank = (rule: Rule): number => rule.level === 'user' ? (rule.sticky ? 1 : 0) : (rule.sticky ? 3 : 2)
  return [...rules].sort((left, right) => rank(left) - rank(right))
}

/**
 * Content digest over the durable published records rather than the rendered
 * prose: the framing is written for the model and must not decide whether a
 * republication is needed.
 * @param catalog - published catalog entries in order.
 * @param alwaysApply - published always-apply records in order.
 * @returns a SHA-256 hex digest of the complete published rule content.
 */
export function digestAgentRulesContent(
  catalog: readonly AgentRulesCatalogEntry[],
  alwaysApply: readonly AgentRulesAlwaysApplyRecord[],
): string {
  const canonical = [
    ...catalog.map(entry => JSON.stringify(['entry', entry.name, entry.description, entry.globs ?? null])),
    ...alwaysApply.map(record => JSON.stringify(['rule', record.name, record.path, record.digest])),
  ].join('\n')
  return createHash('sha256').update(canonical).digest('hex')
}

function renderCatalogLines(entries: readonly AgentRulesCatalogEntry[]): string[] {
  return entries.map((entry) => {
    const globs = entry.globs !== undefined && entry.globs.length > 0
      ? ` (${entry.globs.map(glob => `\`${glob}\``).join(', ')})`
      : ''
    return `- \`${entry.name}\`${globs}: ${escapeRuleFrameBody(entry.description)}`
  })
}

interface AssembledParts {
  intro: string
  notices: string[]
  sections: { path: string; body: string; originalBytes: number }[]
  catalog: readonly AgentRulesCatalogEntry[]
}

function assemble(parts: AssembledParts): string {
  const blocks: string[] = [SYSTEM_REMINDER_OPEN, parts.intro]
  if (parts.notices.length > 0) blocks.push(parts.notices.join(' '))
  for (const section of parts.sections) blocks.push(`Rules from: ${section.path}\n\n${section.body}`)
  if (parts.catalog.length > 0) {
    blocks.push([
      RULEBOOK_INTRO,
      '',
      '<available_rules>',
      ...renderCatalogLines(parts.catalog),
      '</available_rules>',
      '',
      RULEBOOK_OUTRO,
    ].join('\n'))
  }
  blocks.push(SYSTEM_REMINDER_CLOSE)
  return blocks.join('\n\n')
}

/**
 * Render the complete rule context message within the byte budget. Always-apply
 * sections beyond the budget are omitted broadest-first; the most specific
 * surviving body is truncated to fit; when even the framing and catalog exceed
 * the budget, the message degrades to a compact notice.
 * @param input - render-ordered rules, catalog entries, budget, and update flag.
 * @returns the model-facing text plus omission and truncation records.
 */
export function renderAgentRulesContext(input: {
  alwaysApply: readonly Rule[]
  catalog: readonly AgentRulesCatalogEntry[]
  maxBytes: number
  update: boolean
}): RenderedAgentRules {
  const intro = input.update ? REPLACEMENT_RULES_CONTEXT_INTRO : RULES_CONTEXT_INTRO
  if (input.update && input.alwaysApply.length === 0 && input.catalog.length === 0) {
    const text = [
      SYSTEM_REMINDER_OPEN,
      intro,
      'No .omp rules are currently active. Do not rely on rules listed earlier in this session.',
      SYSTEM_REMINDER_CLOSE,
    ].join('\n\n')
    return { text, omitted: [], truncated: [] }
  }
  const omitted: string[] = []
  const truncated: TruncatedRule[] = []
  const sections = input.alwaysApply.map(rule => ({
    path: rule.displayPath,
    body: escapeRuleFrameBody(rule.content),
    originalBytes: byteLength(rule.content),
  }))
  const notices = (): string[] => [
    ...omitted.map(path => `omitted ${path}`),
    ...truncated.map(record => `truncated ${record.path} from ${record.originalBytes} to ${record.includedBytes} bytes`),
  ]
  const build = (): string => assemble({
    intro,
    notices: notices(),
    sections,
    catalog: input.catalog,
  })
  const noticePrefix = (): string => `Rule context budget ${input.maxBytes} bytes: `

  let text = build()
  while (sections.length > 1 && byteLength(text) > input.maxBytes) {
    // The length check proves a section exists.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    omitted.push(sections.shift()!.path)
    text = build()
  }
  if (sections.length === 1 && byteLength(text) > input.maxBytes) {
    // The length check proves a section exists.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const section = sections[0]!
    const withoutBody = assemble({ intro, notices: notices(), sections: [{ ...section, body: '' }], catalog: input.catalog })
    const remaining = input.maxBytes - byteLength(withoutBody)
    if (remaining > 0) {
      section.body = truncateUtf8(section.body, remaining)
      truncated.push({ path: section.path, originalBytes: section.originalBytes, includedBytes: byteLength(section.body) })
      text = build()
    } else {
      omitted.push(section.path)
      sections.length = 0
      text = build()
    }
  }
  if (byteLength(text) > input.maxBytes) {
    const summary = notices()
    text = [
      SYSTEM_REMINDER_OPEN,
      `${noticePrefix()}${summary.length > 0 ? summary.join(' ') : 'no rule content fits'}`,
      SYSTEM_REMINDER_CLOSE,
    ].join('\n')
  }
  return { text, omitted, truncated }
}
