/**
 * Durable agent-rules message source and session-history scanning.
 *
 * The durable source records exactly what was published — catalog entries and
 * always-apply identity/digest records — so republication decisions compare
 * recorded facts and never re-parse the model-facing prose.
 *
 * @module @deepseek-ai/dsh-agent-rules/state
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import {
  digestAgentRulesContent,
  type AgentRulesAlwaysApplyRecord,
  type AgentRulesCatalogEntry,
} from './render.ts'

/** Plugin name shared by the Cordis plugin and its durable source kind. */
export const name = 'agent-rules'

/** Durable provider records for one published agent rule context. */
export interface AgentRulesSource {
  readonly kind: 'agent-rules'
  readonly form: 'catalog'
  /** Marks a replacement context rather than this session's first publication. */
  readonly update?: true
  /** Exactly the rulebook entries this message published, in catalog order. */
  readonly entries: readonly AgentRulesCatalogEntry[]
  /** Identity and content digest of each published always-apply rule, in render order. */
  readonly alwaysApply: readonly AgentRulesAlwaysApplyRecord[]
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'agent-rules': AgentRulesSource
  }
}

/**
 * Records of one durable agent-rules message, or undefined when the record is
 * not a usable agent-rules publication. Session events may be resumed, forked,
 * or externally written seeds, so malformed records are skipped rather than
 * throwing inside the step listener.
 * @param source - the durable message source to read.
 * @returns the published catalog entries and always-apply records.
 */
export function readAgentRulesSource(
  source: unknown,
): { entries: AgentRulesCatalogEntry[]; alwaysApply: AgentRulesAlwaysApplyRecord[] } | undefined {
  if (typeof source !== 'object' || source === null) return undefined
  const { entries, alwaysApply } = source as { entries?: unknown; alwaysApply?: unknown }
  if (!Array.isArray(entries) || !Array.isArray(alwaysApply)) return undefined
  const readableEntries: AgentRulesCatalogEntry[] = []
  for (const entry of entries as readonly unknown[]) {
    if (typeof entry !== 'object' || entry === null) return undefined
    const { name: entryName, description, globs } = entry as { name?: unknown; description?: unknown; globs?: unknown }
    if (typeof entryName !== 'string' || entryName === '' || typeof description !== 'string') return undefined
    if (globs !== undefined && (!Array.isArray(globs) || globs.some(glob => typeof glob !== 'string'))) return undefined
    readableEntries.push({
      name: entryName,
      description,
      ...globs === undefined ? {} : { globs: globs as string[] },
    })
  }
  const readableRules: AgentRulesAlwaysApplyRecord[] = []
  for (const record of alwaysApply as readonly unknown[]) {
    if (typeof record !== 'object' || record === null) return undefined
    const { name: ruleName, path, digest } = record as { name?: unknown; path?: unknown; digest?: unknown }
    if (typeof ruleName !== 'string' || typeof path !== 'string' || typeof digest !== 'string') return undefined
    readableRules.push({ name: ruleName, path, digest })
  }
  return { entries: readableEntries, alwaysApply: readableRules }
}

/**
 * Digest of one durable agent-rules message source.
 * @param source - the durable message source to digest.
 * @returns the content digest, or undefined for unreadable records.
 */
export function agentRulesSourceDigest(source: unknown): string | undefined {
  const records = readAgentRulesSource(source)
  return records === undefined
    ? undefined
    : digestAgentRulesContent(records.entries, records.alwaysApply)
}

/**
 * Newest-published and newest-visible digests for this session's agent rule
 * context. A publication that compaction hid still counts as published, so the
 * next observation re-establishes the current context.
 * @param agent - the agent whose session history is scanned.
 * @returns the visible digest when one survives, and whether any publication exists.
 */
export function agentRulesHistory(agent: Agent): { visibleDigest?: string; published: boolean } {
  const visible = new Set(agent.session.surface.nodes)
  const events = agent.session.events
  let published = false
  for (let index = events.length - 1; index >= 0; index -= 1) {
    // The loop bounds prove the read-only event view contains this index.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const event = events[index]!
    if (event.type !== 'user/message' || event.data.source.kind !== 'agent-rules') continue
    const digest = agentRulesSourceDigest(event.data.source)
    if (digest === undefined) continue
    published = true
    if (visible.has(event.seq)) return { visibleDigest: digest, published }
  }
  return { published }
}

/**
 * The agent-rules message inside one entering batch, with its digest.
 * @param messages - the batch about to enter the session.
 * @returns the batch's agent-rules message, when present and readable.
 */
export function agentRulesBatchMessage(
  messages: readonly UserMessage[],
): { message: UserMessage; digest: string } | undefined {
  for (const message of messages) {
    if (message.source.kind !== 'agent-rules') continue
    const digest = agentRulesSourceDigest(message.source)
    if (digest !== undefined) return { message, digest }
  }
  return undefined
}
