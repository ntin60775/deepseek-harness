/** Keyed recorded-result rows sharing the compact detail body. */
import { useMemo } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import {
  IconAgentPresetOutlineRegular, IconBranchOutlineRegular, IconChecklistOutlineRegular, IconClockOutlineRegular,
  IconCodeOutlineRegular, IconCordisPluginOutlineRegular, IconGoalOutlineRegular, IconSearchOutlineRegular,
  IconUsersOutlineRegular, Tag, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '../../contract/slots.ts'
import { CONVERSATION_NS as NS } from '../../locale.ts'
import { ToolRow } from '../components/ToolRow.tsx'
import { detailsCardModel } from '../models/details-card-model.ts'
import { detailRecord, nonempty } from '../models/detail-model-shared.ts'
import { parsedToolCall } from '../models/raw-tool-call.ts'
import { catalogChildId, matchCatalogEntry, spawnCardRoute } from '../models/subagent-route.ts'
import { toolRowModel } from '../models/tool-call-model.ts'
import css from './details-row.module.css'

type DetailsRowProps = ToolCallViewProps & PropsLocale<'conversation'>

const LSP_TITLE_KEYS = {
  goToDefinition: 'tool.title.findDefinition',
  findReferences: 'tool.title.findReferences',
  goToImplementation: 'tool.title.findImplementation',
  hover: 'tool.title.hoverSymbol',
} as const

/** Agent delegation, discovery, and coordination share the two-person icon. */
const AGENT_TOOLS = new Set(['subagent', 'subagent_fork', 'list_subagent_models', 'spawn_teammate', 'list_agents', 'send_message', 'interrupt_agent', 'wait_agent'])

function detailIcon(toolName: string) {
  if (AGENT_TOOLS.has(toolName)) return <IconUsersOutlineRegular size={14} />
  if (toolName.startsWith('schedule_')) return <IconClockOutlineRegular size={14} />
  if (toolName.endsWith('_goal')) return <IconGoalOutlineRegular size={14} />
  if (toolName.startsWith('cordis_')) return <IconCordisPluginOutlineRegular />
  if (toolName.startsWith('terminal_')) return <IconCodeOutlineRegular size={14} />
  if (toolName.startsWith('session_') || toolName === 'lsp') return <IconSearchOutlineRegular size={14} />
  if (toolName.startsWith('job_') || toolName.startsWith('team_task_')) return <IconChecklistOutlineRegular />
  if (toolName === 'workflow' || toolName === 'ralph') return <IconBranchOutlineRegular size={14} />
  return <IconAgentPresetOutlineRegular size={14} />
}

/** Read the streamed description directly; old complete calls may use their prompt instead. */
function subagentSummary(block: ToolCallViewProps['block']): string {
  const description = block.args.text('description')?.trimStart()
  if (description) return description.split(/\r?\n/u, 1)[0] ?? ''
  if (!('kind' in block) && block.phase === 'preparing') return ''
  return block.args.text('prompt')?.trimStart().split(/\r?\n/u, 1)[0] ?? ''
}

/**
 * Present recorded entities, receipts, and report fields in the existing expandable row.
 * Subagent spawn cards additionally chip the child's recorded model route between
 * the title and the summary; the resolution lives in {@link spawnCardRoute}.
 * @param props - Tool call, row actions, and locale supplied by the keyed slot.
 * @returns A Tool row with structured details or generic input/output.
 */
export function DetailsRow({ toolName, block, cwd, home, openFile, inspect, useDisclosure, sessionId, useSessions, t }: DetailsRowProps) {
  const model = toolRowModel(toolName, block, cwd, home)
  const locale = document.documentElement.lang
  const isSpawn = toolName === 'subagent' || toolName === 'subagent_fork'
  const taskSummary = isSpawn ? subagentSummary(block) : undefined
  const meta = 'kind' in block ? block.meta : undefined
  const childName = (detailRecord(meta) && meta.kind === 'activation' && nonempty(meta.name) ? meta.name : undefined) ?? block.args.text('name')
  const catalog = useSessions(state => state.projectionsBySession[sessionId]?.values.subagentCatalog)
  const entry = useMemo(() => matchCatalogEntry(catalog, childName), [catalog, childName])
  const childId = catalogChildId(entry)
  const selection = useSessions(state => childId === undefined ? undefined : state.byId[childId]?.projectionValues?.modelSelection?.next)
  const routeArgs = useMemo(() => ({
    provider: block.args.text('provider'),
    model: block.args.text('model'),
    reasoning_effort: block.args.text('reasoning_effort'),
  }), [block])
  const route = useMemo(
    () => isSpawn ? spawnCardRoute(entry, selection ?? undefined, routeArgs) : undefined,
    [isSpawn, entry, selection, routeArgs],
  )
  const headerChip = useMemo(() => route === undefined ? undefined : (
    <Tooltip
      label={t('tool.route.title', { route: `${route.provider}/${route.model}` })}
      delayMs={500}
      portal
      side="bottom"
      openOnClick
    >
      {/* The anchor is a host element for the Tooltip ref; stopPropagation keeps a
          chip tap from also toggling the row, and the decoration marker lets the
          running shimmer tint the capsule fill like the adjacent separator. */}
      <span
        className={css.routeChipAnchor}
        data-shimmer-decoration
        onClick={(event) => { event.stopPropagation() }}
      >
        <Tag tone="neutral" size="compact" className={css.routeChip}>
          <span className={css.routeChipText}>{route.provider}/{route.model}</span>
          <span className={css.routeChipEffort}>{route.reasoningEffort ?? t('tool.route.effortDefault')}</span>
        </Tag>
      </span>
    </Tooltip>
  ), [route, t])
  const details = useMemo(() => {
    const result = detailsCardModel(block, t, locale)
    return result !== null && taskSummary !== undefined
      ? { ...result, summary: taskSummary, expandedSummary: taskSummary }
      : result
  }, [block, t, locale, taskSummary])
  const operation = toolName === 'lsp' ? parsedToolCall(block)?.args.operation : undefined
  const titleKey = typeof operation === 'string' && Object.hasOwn(LSP_TITLE_KEYS, operation)
    ? LSP_TITLE_KEYS[operation as keyof typeof LSP_TITLE_KEYS]
    : toolName === 'cordis_inspect'
      ? parsedToolCall(block)?.args.query === undefined ? 'tool.title.inspectProviders' : 'tool.title.queryRuntime'
      : model.titleKey
  const isWait = toolName === 'wait_agent'
  return (
    <ToolRow
      useDisclosure={useDisclosure}
      t={t}
      variant={model.variant}
      toolName={toolName}
      icon={detailIcon(toolName)}
      title={isWait ? details?.summary ?? t(titleKey) : t(titleKey)}
      headerChip={headerChip}
      summary={isWait ? '' : taskSummary ?? details?.summary ?? details?.items[0]?.title ?? details?.empty ?? model.summary}
      details={details}
      bodyRaw={model.bodyRaw}
      output={model.output}
      errorSummary={model.errorSummary}
      state={model.state}
      inspect={inspect}
      onOpenFile={openFile}
    />
  )
}

/** Register recorded-result details through the standard atomic Tool slot. */
export const detailsToolview = {
  name: 'details-toolview',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', function* () {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'create_goal', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'get_goal', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'update_goal', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'schedule_create', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'schedule_list', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'schedule_view', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'schedule_edit', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'schedule_delete', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'schedule_update', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'cordis_inspect', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'cordis_inspect_list', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'cordis_inspect_query', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'cordis_inspect_self', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'workflow', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'ralph', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'session_event_read', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'session_event_search', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'session_event_trace', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'session_search', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'session_trace', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'list_subagent_models', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'subagent', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'subagent_fork', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'list_agents', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'send_message', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'interrupt_agent', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'job_list', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'job_output', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'job_kill', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'terminal_open', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'terminal_read', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'terminal_list', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'terminal_signal', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'terminal_close', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'lsp', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'spawn_teammate', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'team_task_create', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'team_task_get', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'team_task_update', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'team_task_list', locale: NS }, DetailsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'wait_agent', locale: NS }, DetailsRow)
    })
  },
}
