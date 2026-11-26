/** Session-owned Agent Teams switch in the model picker footer. */

import { useState } from 'react'
import { IconUsersOutlineRegular, Switch, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-agent-team/client'
import type {} from '@deepseek-ai/dsh-agent'
import type { NS } from './locales.ts'
import css from './TeamModeToggle.module.css'

/** Session selection callbacks supplied to the Team switch. */
export interface TeamModeInjected {
  /** Save the selection; null means success, otherwise the string describes the failure. */
  selectTeamMode: (enabled: boolean) => Promise<string | null>
  /** Open a Session-targeted confirmation outside this menu. */
  requestDisableConfirmation: () => void
}

/** Full props of the model-menu Team switch. */
export type TeamModeToggleProps = PropsRuntime<'conversation.input.model.options'>
  & PropsLocale<typeof NS> & TeamModeInjected

/**
 * Show the Team state as a switch beside the picker's key hints; the tooltip
 * carries the name, the state, and what the mode costs.
 * @param props - Session projection, mode operations, menu dismissal, and locale.
 * @returns the switch when Team mode is available on a root Session.
 */
export function TeamModeToggle(props: TeamModeToggleProps) {
  const addressedChild = props.useSession(snapshot => snapshot.subagent !== null)
  const listedChild = props.useSessions(state => state.byId[props.sessionId]?.origin === 'subagent')
  if (addressedChild || listedChild) return null
  return <RootTeamModeSwitch {...props} />
}

/** Read and change the selection only for root Sessions. */
function RootTeamModeSwitch({
  useProjection, locked, dismiss, reportFailure, selectTeamMode, requestDisableConfirmation, t,
}: TeamModeToggleProps) {
  const mode = useProjection('agentTeam')
  const modelSelection = useProjection('modelSelection')
  const [pending, setPending] = useState(false)
  if (mode === undefined) return null
  const select = (enabled: boolean): void => {
    if (!enabled && modelSelection !== undefined && modelSelection.lastUsed !== null) {
      dismiss()
      requestDisableConfirmation()
      return
    }
    setPending(true)
    void selectTeamMode(enabled).then((failure) => {
      if (failure !== null) reportFailure(t('mode.failed', { message: failure }))
    }, (error: unknown) => {
      reportFailure(t('mode.failed', { message: error instanceof Error ? error.message : String(error) }))
    }).finally(() => { setPending(false) })
  }
  const state = t(mode.enabled ? 'mode.on' : 'mode.off')
  return (
    <Tooltip
      label={`${t('command.title')} · ${state}\n${t('mode.description')}`}
      side="top"
      portal
      maxWidth={280}
    >
      <span className={css.inline}>
        <IconUsersOutlineRegular className={css.icon} size={16} aria-hidden="true" />
        <Switch
          checked={mode.enabled}
          disabled={locked || pending || modelSelection === undefined}
          label={t('mode.label')}
          onChange={select}
        />
      </span>
    </Tooltip>
  )
}
