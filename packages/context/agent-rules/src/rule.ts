/**
 * Rule model and frontmatter parsing for `.omp`-compatible rule files.
 *
 * A rule file is Markdown with an optional YAML frontmatter block. The canonical
 * field set matches oh-my-pi: `description`, `globs`, and `alwaysApply` drive
 * bucketing here, while the TTSR fields (`condition`, `astCondition`, `scope`,
 * `interruptMode`) are recognized and reported but not enforced.
 *
 * @module @deepseek-ai/dsh-agent-rules/rule
 */

import { parse } from 'yaml'

/** Where a rule file was discovered. */
export type RuleLevel = 'user' | 'project'

/** One discovered rule normalized into the canonical shape. */
export interface Rule {
  /** Rule identity: the file basename without its `.md`/`.mdc` extension, or the fixed sticky names. */
  readonly name: string
  /** Absolute host path of the rule file. */
  readonly absolutePath: string
  /** Model-facing path: project-root-relative for project rules, home-anchored for user rules. */
  readonly displayPath: string
  /** Markdown body with the frontmatter stripped. */
  readonly content: string
  readonly level: RuleLevel
  /** Sticky rules come from top-level `RULES.md` files and are always applied. */
  readonly sticky: boolean
  /** Rulebook summary from frontmatter; required for on-demand listing. */
  readonly description?: string
  /** Frontmatter glob annotations, rendered beside the catalog entry. */
  readonly globs?: string[]
  /** Whether the full body is injected into context unconditionally. */
  readonly alwaysApply: boolean
  /** The frontmatter declared TTSR-only fields that this harness parses but does not enforce. */
  readonly hasTtsrFields: boolean
}

/** A raw rule document split into metadata and body. */
export interface ParsedRuleDocument {
  /** Trimmed Markdown body with the frontmatter block removed. */
  readonly body: string
  readonly description?: string
  readonly globs?: string[]
  readonly alwaysApply: boolean
  readonly hasTtsrFields: boolean
  /** Human-readable parse problem; the document still loads with degraded metadata. */
  readonly warning?: string
}

const FRONTMATTER_OPEN = /^---\r?\n/
const FRONTMATTER_CLOSE = /^---[ \t]*\r?$/
/** Frontmatter keys that select oh-my-pi TTSR behavior; recognized, never enforced here. */
const TTSR_KEYS = ['condition', 'astCondition', 'scope', 'interruptMode', 'ttsr_trigger', 'ttsrTrigger'] as const

/**
 * Split a raw rule file into frontmatter metadata and body. Frontmatter is
 * recognized only when the file starts with `---` and a later line closes the
 * block; a YAML failure degrades the file to plain content with a warning
 * rather than dropping it.
 * @param raw - complete UTF-8 rule file text.
 * @param displayPath - model-facing path used in the warning text.
 * @returns the parsed metadata and trimmed body.
 */
export function parseRuleDocument(raw: string, displayPath: string): ParsedRuleDocument {
  if (!FRONTMATTER_OPEN.test(raw)) return plainDocument(raw)
  const lines = raw.split('\n')
  let closeIndex = -1
  for (let index = 1; index < lines.length; index += 1) {
    // The loop bound proves this index exists.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    if (FRONTMATTER_CLOSE.test(lines[index]!)) {
      closeIndex = index
      break
    }
  }
  if (closeIndex === -1) return plainDocument(raw)
  const frontmatterText = lines.slice(1, closeIndex).join('\n')
  const body = lines.slice(closeIndex + 1).join('\n').trim()
  let data: unknown
  try {
    data = parse(frontmatterText)
  } catch (error: unknown) {
    return {
      ...plainDocument(raw),
      warning: `rule ${displayPath}: frontmatter YAML failed to parse (${error instanceof Error ? error.message : String(error)}); treating the file as plain content`,
    }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { body, alwaysApply: false, hasTtsrFields: false }
  }
  const record = data as Record<string, unknown>
  const description = typeof record.description === 'string' && record.description.trim().length > 0
    ? record.description.trim()
    : undefined
  const globs = normalizeGlobs(record.globs)
  const hasTtsrFields = TTSR_KEYS.some(key => record[key] !== undefined)
  return {
    body,
    ...description === undefined ? {} : { description },
    ...globs === undefined ? {} : { globs },
    alwaysApply: record.alwaysApply === true,
    hasTtsrFields,
  }
}

/** Treat the whole document as body when no frontmatter block is present. */
function plainDocument(raw: string): ParsedRuleDocument {
  return { body: raw.trim(), alwaysApply: false, hasTtsrFields: false }
}

/** Normalize the `globs` field: a single string or a string array, trimmed and non-empty. */
function normalizeGlobs(value: unknown): string[] | undefined {
  const tokens = typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : undefined
  const globs = tokens?.map(token => token.trim()).filter(token => token.length > 0)
  return globs !== undefined && globs.length > 0 ? globs : undefined
}

/**
 * Select the model-facing bucket for one rule. TTSR-only fields never select a
 * bucket here: a rule with triggers still lands in always-apply or the rulebook
 * by its remaining metadata, matching the oh-my-pi fallthrough when TTSR
 * registration rejects a rule.
 * @param rule - the discovered rule.
 * @returns the bucket the rule's content is served through, or undefined when unreachable.
 */
export function ruleBucket(rule: Rule): 'always-apply' | 'rulebook' | undefined {
  if (rule.alwaysApply) return 'always-apply'
  if (rule.description !== undefined) return 'rulebook'
  return undefined
}
