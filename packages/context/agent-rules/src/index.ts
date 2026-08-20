/**
 * oh-my-pi-compatible `.omp` rule loader: always-apply injection, sticky
 * `RULES.md` support, an on-demand rulebook catalog, and the `rule` tool.
 *
 * Rule context enters durable history at the first eligible pre-step and is
 * republished as a complete replacement whenever the discovered rule set
 * changes; when compaction hides the visible publication, the next observation
 * re-establishes it. Plugin reads use the optional `ctx.fs` provider, so
 * providerless products mount it as a no-op.
 *
 * @module @deepseek-ai/dsh-agent-rules
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Config, resolveConfig, type ResolvedConfig } from './config.ts'
import { discoverAgentRules } from './discovery.ts'
import { ruleBucket, type Rule } from './rule.ts'
import {
  alwaysApplyRecords,
  digestAgentRulesContent,
  orderAlwaysApplyRules,
  renderAgentRulesContext,
  rulebookCatalogEntries,
} from './render.ts'
import {
  agentRulesBatchMessage,
  agentRulesHistory,
  name,
} from './state.ts'

export { Config, name }
export { discoverAgentRules, findProjectRoot } from './discovery.ts'
export type { DiscoveredRuleSet, DiscoverRulesOptions } from './discovery.ts'
export { parseRuleDocument, ruleBucket } from './rule.ts'
export type { ParsedRuleDocument, Rule, RuleLevel } from './rule.ts'
export {
  alwaysApplyRecords,
  digestAgentRulesContent,
  orderAlwaysApplyRules,
  renderAgentRulesContext,
  rulebookCatalogEntries,
} from './render.ts'
export type {
  AgentRulesAlwaysApplyRecord,
  AgentRulesCatalogEntry,
  RenderedAgentRules,
  TruncatedRule,
} from './render.ts'
export { STICKY_PROJECT_RULE_NAME, STICKY_USER_RULE_NAME } from './discovery.ts'
export type { AgentRulesSource } from './state.ts'

export const inject = ['agents', 'tools']

interface BucketedRules {
  alwaysApply: Rule[]
  catalog: ReturnType<typeof rulebookCatalogEntries>
}

function bucketDiscoveredRules(rules: readonly Rule[], descriptionMaxLength: number): BucketedRules {
  const alwaysApply: Rule[] = []
  const rulebook: Rule[] = []
  for (const rule of rules) {
    const bucket = ruleBucket(rule)
    if (bucket === 'always-apply') alwaysApply.push(rule)
    else if (bucket === 'rulebook') rulebook.push(rule)
  }
  return {
    alwaysApply: orderAlwaysApplyRules(alwaysApply),
    catalog: rulebookCatalogEntries(rulebook, descriptionMaxLength),
  }
}

/** The current rule set for one agent, or undefined when this agent gets no rule context. */
async function discoverForAgent(
  ctx: Context,
  agent: Agent,
  resolved: ResolvedConfig,
  signal: AbortSignal,
): Promise<{ bucketed: BucketedRules; warnings: string[] } | undefined> {
  if (resolved.maxBytes <= 0 || !Number.isFinite(resolved.maxBytes)) return undefined
  const fileSystem = ctx.get('fs')
  if (fileSystem === undefined) return undefined
  /* v8 ignore next -- normal agents carry an absolute session cwd. */
  const cwd = agent.session.header.cwd ?? process.cwd()
  const discovered = await discoverAgentRules({
    cwd,
    ompAgentDir: resolved.ompAgentDir,
    projectRootMarkers: resolved.projectRootMarkers,
    maxSourceBytes: resolved.maxSourceBytes,
    signal,
  }, fileSystem)
  return {
    bucketed: bucketDiscoveredRules(discovered.rules, resolved.catalogDescriptionMaxLength),
    warnings: discovered.warnings,
  }
}

/**
 * Register the `rule` tool and the durable rule context publisher. The context
 * is emitted only when the calling agent resolves this plugin's exact tool
 * registration; a restriction or scoped same-name shadow therefore removes both
 * the schema and the catalog that points at it.
 * @param ctx - the plugin's Cordis context.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)

  const ruleTool = defineTool({
    name: 'rule',
    description: 'Load the full body of an available rule. Call this with the exact rule name from the session rule catalog (<available_rules>) before relying on that rule.',
    parameters: {
      name: { type: 'string', required: true, description: 'The exact rule name from the available rules list.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          path: { type: 'string', required: true },
          content: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `<rule_content name="${value.name}" path="${value.path}">\n${value.content}\n</rule_content>` }],
    },
    async execute(args, exec) {
      const fileSystem = ctx.get('fs')
      if (fileSystem === undefined) throw new Error('rule lookup requires a filesystem provider')
      const cwd = exec.agent?.session.header.cwd ?? process.cwd()
      const discovered = await discoverAgentRules({
        cwd,
        ompAgentDir: resolved.ompAgentDir,
        projectRootMarkers: resolved.projectRootMarkers,
        maxSourceBytes: resolved.maxSourceBytes,
        signal: exec.signal,
      }, fileSystem)
      const addressable = discovered.rules.filter(rule => ruleBucket(rule) !== undefined)
      const found = addressable.find(rule => rule.name === args.name)
      if (found === undefined) {
        const available = addressable.map(rule => rule.name).join(', ')
        throw new Error(available.length > 0
          ? `unknown rule "${args.name}". Available rules: ${available}`
          : `unknown rule "${args.name}". No rules are currently discovered`)
      }
      return { name: found.name, path: found.displayPath, content: found.content }
    },
    presentCall(args) {
      return { card: 'generic', title: `Read rule ${args.name}`, kind: 'read', rawInput: args.name }
    },
  })
  ctx.tools.register(ruleTool)

  // Register after the tool so reverse teardown removes the guidance first.
  // Exact definition identity prevents a scoped shadow merely named `rule`
  // from inheriting this catalog.
  ctx.on('agent/pre-step', async (
    { agent, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    signal.throwIfAborted()
    const toolVisible = ctx.tools.get(ruleTool.name, agent) === ruleTool
    const discovered = toolVisible
      ? await discoverForAgent(ctx, agent, resolved, signal)
      : undefined
    signal.throwIfAborted()
    const bucketed = discovered?.bucketed ?? { alwaysApply: [], catalog: [] }
    const alwaysApply = alwaysApplyRecords(bucketed.alwaysApply)
    const digest = digestAgentRulesContent(bucketed.catalog, alwaysApply)
    const history = agentRulesHistory(agent)
    const existing = agentRulesBatchMessage(decision.messages)
    if (history.visibleDigest === digest) {
      return existing === undefined
        ? decision
        : { kind: 'enter', messages: decision.messages.filter(message => message.id !== existing.message.id) }
    }
    if (existing !== undefined && existing.digest === digest) return decision
    if (!history.published && bucketed.catalog.length === 0 && bucketed.alwaysApply.length === 0) {
      return existing === undefined
        ? decision
        : { kind: 'enter', messages: decision.messages.filter(message => message.id !== existing.message.id) }
    }
    for (const warning of discovered?.warnings ?? []) ctx.logger.warn('agent-rules: %s', warning)
    const rendered = renderAgentRulesContext({
      alwaysApply: bucketed.alwaysApply,
      catalog: bucketed.catalog,
      maxBytes: resolved.maxBytes,
      update: history.published,
    })
    const message = createUserMessage({
      content: [{ type: 'text', text: rendered.text }],
      source: {
        kind: 'agent-rules',
        form: 'catalog',
        ...history.published ? { update: true as const } : {},
        entries: bucketed.catalog,
        alwaysApply,
      },
    })
    return {
      kind: 'enter',
      messages: existing === undefined
        ? [...decision.messages, message]
        : decision.messages.map(item => item.id === existing.message.id ? message : item),
    }
  })
}
