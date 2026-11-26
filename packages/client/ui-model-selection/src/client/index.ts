/**
 * Model selection plugin, browser half — TWO entries over ONE per-session
 * directory owned by ModelDirectoryResolver (`ctx.modelDirectories`). The /model popupSelect
 * contribution and the composer's named `conversation.input.model` seat share
 * one Host-generation `session/modelCatalog` catalog, combine it with the Session's
 * durable model-selection projection, and submit through `session.selectModel`.
 * A switch made in either entry is what the other shows next. Failures
 * ride each entry's own retry surface (popup shell error/retry; seat menu
 * inline error) without forking the state. Addressed subagent sessions expose
 * neither entry because those Agent-bound RPCs would activate persisted
 * history outside the direct-parent continuation path.
 */
// Type-only: the carrier types, the forwarded Host-event face and the ctx.remote merge.
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { CommandUiContract, SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { ShortcutCommand, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the ui-conversation SlotMap merge (the input.model seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { IconDataOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelDirectoryState } from './directory.ts'
import { ModelDirectoryResolver } from './service.ts'
import type { ModelPickerRequest, ModelSelectInjected } from './slots.ts'
import { ModelSelect } from './ModelSelect.tsx'
import { en, ja, es, fr, de, ru, pt, zh, type ModelKey } from './locales.ts'
import { orderModelProviders } from './provider-order.ts'

export { ModelDirectory } from './directory.ts'
export type { ModelDirectoryState } from './directory.ts'
export { ModelDirectoryResolver } from './service.ts'
export type { ModelLabelOwner, ModelSelectInjected } from './slots.ts'
export type { ModelKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The model selection surfaces' copy (/model popup + composer seat). */
    model: ModelKey
  }
}

/** One selectable row's id: an opaque row key (resolved by lookup, never parsed). */
function rowId(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`
}

/** Flatten the directory into popup rows; failure rows are listed for visibility but never selectable. */
function optionsOf(directory: ModelDirectoryState, t: TranslateNS<'model'>): SelectOption[] {
  const rows: SelectOption[] = []
  for (const group of orderModelProviders(directory.groups)) {
    const name = group.id === 'deepseek-account' ? t('provider.account') : group.name
    for (const model of group.models) {
      rows.push({
        id: rowId(group.id, model.id),
        label: model.name,
        group: { name: group.id, label: name },
        ...(directory.current !== null
          && directory.current.provider === group.id
          && directory.current.model === model.id
          ? { active: true } : {}),
      })
    }
  }
  for (const failure of directory.failures) {
    rows.push({
      id: `failure/${failure.id}`,
      label: failure.id === 'deepseek-account' ? t('provider.account') : failure.name,
      detail: t('option.loadError', { message: failure.message }),
    })
  }
  return rows
}

/**
 * Resolve a picked row back to its model selection by matching against the loaded
 * groups (the same data the rows were built from — ids stay opaque).
 * @param state - the session's directory snapshot.
 * @param id - the picked row id.
 * @returns the row's model selection, or undefined for failure rows / stale ids.
 */
function selectionOf(state: ModelDirectoryState, id: string): ModelSelection | undefined {
  for (const group of state.groups) {
    for (const model of group.models) {
      if (rowId(group.id, model.id) !== id) continue
      const sameRoute = state.current?.provider === group.id && state.current.model === model.id
      const reasoningEffort = sameRoute
        ? state.current?.reasoningEffort ?? model.reasoning?.defaultEffort
        : model.reasoning?.defaultEffort
      return {
        provider: group.id,
        model: model.id,
        ...reasoningEffort === undefined ? {} : { reasoningEffort },
      }
    }
  }
  return undefined
}

/** Dictionary namespace owned by this plugin. */
const NS = 'model'

/** Required services: the contribution registry, the seat's slot registry, locale, and the service's own faces. */
export const inject = ['commandUi', 'locale', 'sessions', 'slots', 'remote', 'remote.session']

/**
 * Client plugin body: mount ModelDirectoryResolver, register the `model` dictionaries,
 * then register the /model popup contribution and the composer model seat
 * over the service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-model-selection: dictionaries')

  // Non-slot faces (the command description, the popup option builder) read
  // through the bound translate; the seat component reads the standard seat.
  const t = ctx.locale.bind(NS)

  ctx.plugin(ModelDirectoryResolver)

  // Entry 1: the /model popupSelect over the shared directory.
  ctx.inject(['commandUi', 'modelDirectories'], (scope: ClientContext) => {
    const command = scope.get('commandUi') as CommandUiContract
    const models = scope.modelDirectories
    const sessions = scope.sessions
    scope.effect(() => command.register({
      name: 'model',
      label: () => t('command.label'),
      description: () => t('command.description'),
      icon: IconDataOutlineRegular,
      available: session => sessions.subagentAddress(session.sessionId) === undefined,
      ui: {
        kind: 'popupSelect',
        searchLabels: () => ({
          placeholder: t('search.placeholder'),
          empty: t('empty.models'),
          noResults: t('search.empty'),
        }),
        options: async (session) => {
          if (sessions.subagentAddress(session.sessionId) !== undefined) {
            throw new Error('model selection is unavailable for addressed subagent sessions')
          }
          return optionsOf(await models.directoryFor(session.sessionId).load(), t)
        },
        onSelect: async (option, session) => {
          if (sessions.subagentAddress(session.sessionId) !== undefined) {
            throw new Error('model selection is unavailable for addressed subagent sessions')
          }
          const directory = models.directoryFor(session.sessionId)
          const selection = selectionOf(directory.store.getSnapshot(), option.id)
          if (selection === undefined) {
            throw new Error('this provider\'s catalog failed to load — pick a model from a loaded group')
          }
          const result = await directory.select(selection)
          if (!result.ok) {
            if (result.error.code === 'session/writer-held') throw new Error(t('error.sessionInUse'))
            throw result.error
          }
        },
      },
    }), 'ui-model-selection: /model contribution')
  })

  // Entry 2: the composer's named model seat over the SAME directory.
  ctx.inject(['slots', 'modelDirectories', 'shortcuts'], (scope: ClientContext) => {
    const models = scope.modelDirectories
    const sessions = scope.sessions
    // Shortcut requests ride a plugin-owned observable: the seat binds it as
    // `usePickerRequest`, and a Session id keeps split-view seats apart.
    const pickerRequests = createSnapshotStore<ModelPickerRequest | null>(null)
    let requestSeq = 0
    const clearPickerRequest = (seq: number): void => {
      if (pickerRequests.getSnapshot()?.seq === seq) pickerRequests.set(null)
    }
    const mainSession = (): SessionId | undefined => Object.values(sessions.list.getSnapshot().byId)
      .find(row => (row.retainedBy.mainView ?? 0) > 0)?.id
    const shortcut = (id: string, label: () => string, aliases: string[], code: string,
      modifiers: ('primary' | 'alt' | 'shift')[], resolve: ShortcutCommand['resolve']): void => {
      scope.effect(() => scope.shortcuts.register({
        id: id as ShortcutCommandId, label, aliases,
        // Ctrl+Alt (Cmd+Alt on macOS) keeps the web shortcuts free of browser
        // reservations; `code` makes the gesture layout-independent.
        defaults: {
          'desktop:macos': { code, modifiers },
          'desktop:windows': { code, modifiers },
          'desktop:linux': { code, modifiers },
          'web:macos': { code, modifiers },
          'web:windows': { code, modifiers },
        },
        regions: ['page', 'editable'], modals: [], resolve,
      }), `ui-model-selection: ${id}`)
    }
    shortcut('model.picker', () => t('shortcut.picker'), ['choose model', 'model picker'], 'KeyM', ['primary', 'alt'], () => {
      const sessionId = mainSession()
      if (sessionId === undefined) return { status: 'blocked', reason: t('shortcut.noSession') }
      if (sessions.subagentAddress(sessionId) !== undefined) return { status: 'blocked', reason: t('shortcut.noSession') }
      return { status: 'handled', run: () => {
        requestSeq += 1
        pickerRequests.set({ sessionId, seq: requestSeq })
      } }
    })
    const cycleEffort = (direction: 1 | -1): ReturnType<NonNullable<ShortcutCommand['resolve']>> => {
      const sessionId = mainSession()
      if (sessionId === undefined || sessions.subagentAddress(sessionId) !== undefined) {
        return { status: 'blocked', reason: t('shortcut.noSession') }
      }
      const directory = models.directoryFor(sessionId)
      const state = directory.store.getSnapshot()
      const current = state.current
      const model = current === null ? undefined
        : state.groups.find(group => group.id === current.provider)?.models.find(entry => entry.id === current.model)
      const reasoning = model?.reasoning
      if (current === null || reasoning === undefined || reasoning.efforts.length === 0) {
        return { status: 'blocked', reason: t('shortcut.noEffort') }
      }
      const active = current.reasoningEffort ?? reasoning.defaultEffort
      const at = reasoning.efforts.findIndex(level => level.id === active)
      const next = reasoning.efforts[(Math.max(at, 0) + direction + reasoning.efforts.length) % reasoning.efforts.length]
      if (next === undefined) return { status: 'blocked', reason: t('shortcut.noEffort') }
      return { status: 'handled', run: () => {
        void directory.select({ provider: current.provider, model: current.model, reasoningEffort: next.id })
          .catch(() => { /* surfaced on the shared directory */ })
      } }
    }
    shortcut('model.effortNext', () => t('shortcut.effortNext'), ['next effort', 'raise reasoning'], 'KeyE',
      ['primary', 'alt'], () => cycleEffort(1))
    shortcut('model.effortPrevious', () => t('shortcut.effortPrevious'), ['previous effort', 'lower reasoning'], 'KeyE',
      ['primary', 'alt', 'shift'], () => cycleEffort(-1))
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model',
      locale: NS,
      children: {
        'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true },
        'conversation.input.model.options': { kind: 'list', scope: 'session' },
        'conversation.input.model.pane': { kind: 'keyed', scope: 'session' },
      },
      inject: (sessionId): ModelSelectInjected => {
        const directory = models.directoryFor(sessionId)
        const available = sessions.subagentAddress(sessionId) === undefined
        return {
          available,
          sessionId,
          hooks: { pickerRequest: pickerRequests },
          clearPickerRequest,
          directory: directory.store,
          load: () => {
            if (available) directory.load().catch(() => { /* surfaced on the store */ })
          },
          resolveText: text => ctx.locale.resolveText(text),
          select: (selection: ModelSelection) => available
            ? directory.select(selection)
            : Promise.resolve(undefined),
        }
      },
    }, ModelSelect))
  })
}
