/**
 * fork-patch: composer-model-picker — see docs/reference/fork-composer-model-picker.md
 * the composer's named model seat (`conversation.input.model`).
 *
 * The seat is ONE control — a model chip plus the reasoning chips of the
 * current model beside it — over the shared per-session directory. Clicking
 * the chip opens the picker dialog: a single centred panel (over the
 * conversation column, never the viewport) that shows every model with its
 * description and ALL of that model's effort levels at once, so a model and a
 * level are one decision on one screen rather than a two-level drill-down.
 * Clicking a level applies model and effort together and closes.
 *
 * Keyboard: `Ctrl+Alt+E` cycles the current model's effort from anywhere in
 * the composer, `Ctrl+Alt+M` opens the picker (both matched on `event.code`,
 * so they ignore the active layout); inside the dialog ↑/↓ move between
 * models, ←/→ draft the highlighted model's effort, Enter applies, Escape
 * closes and backs out of a plugin pane first.
 *
 * Plugin-owned panes keep their contract: the footer's `options` entries call
 * `openPane`, which unfolds `conversation.input.model.pane` inside the same
 * card below its entry; the model list stays visible and one Escape collapses
 * the pane without dismissing the picker.
 */
import {
  Input, Modal, StateDot, Tag, Toast,
  IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconDataOutlineRegular, IconWarningOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  useLayoutEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties, type KeyboardEvent,
} from 'react'
import clsx from 'clsx'
import type { ModelReasoningEffort, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ModelLabelOwner, ModelMenuControls, ModelMenuPaneRef, ModelSelectInjected,
} from './slots.ts'
import css from './ModelSelect.module.css'
import { TextSearchIndex } from '@deepseek-ai/dsh-util-text-search'
import { orderModelProviders } from './provider-order.ts'

/** The plugin-owned detail pane unfolded below its footer entry, if any. */
type Pane = { kind: 'list' } | { kind: 'detail'; pane: ModelMenuPaneRef }

const LIST_PANE: Pane = { kind: 'list' }


/** One dynamic effort row; undefined means preserve the provider default. */
interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
}

/** A drafted keyboard choice that has not been applied yet. */
interface EffortDraft {
  key: string
  effort: string | undefined
}

/** Rendered seat props: injected face (hooks bound) + the standard shares. */
type ModelSelectProps = InjectFace<ModelSelectInjected>
  & Pick<PropsRuntime<'conversation.input.model'>, 'locked'>
  & PropsLocale<'model'>
  & Omit<PropsRenderSlots<
    'conversation.input.model.label' | 'conversation.input.model.options' | 'conversation.input.model.pane'
  >, 'SessionProvider'>

/**
 * Render the composer model seat and its picker dialog.
 * @param props - owner share (locked) + injected face (directory store, verbs,
 * open requests) + the standard locale and slot seats.
 * @returns the effort chips, the model chip, and the dialog while open.
 */
export function ModelSelect({
  locked, usePickerRequest, clearPickerRequest, sessionId, available, directory, load, select, resolveText, t, renderSlot,
}: ModelSelectProps) {
  const state = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const request = usePickerRequest(value => value)
  const [opened, setOpened] = useState(false)
  const [pane, setPane] = useState<Pane>(LIST_PANE)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const [draft, setDraft] = useState<EffortDraft | null>(null)
  const [shift, setShift] = useState(0)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const optionsRef = useRef<HTMLDivElement | null>(null)
  const selectedRowRef = useRef<HTMLDivElement | null>(null)
  const id = useId()

  // A shortcut request opens the same dialog the chip does; consuming it is
  // render-derived (never an effect that mirrors state).
  const requested = request !== null && request.sessionId === sessionId
  const open = available && (opened || requested)

  const accountProviderName = t('provider.account')
  const groups = useMemo(() => orderModelProviders(state.groups).map(group => ({
    ...group,
    provider: {
      id: group.id,
      name: group.id === 'deepseek-account' ? accountProviderName : group.name,
    },
  })), [state.groups, accountProviderName])
  const choices = useMemo(() => groups.flatMap(group => group.models.map(model => ({
    key: `${group.id}/${model.id}`,
    group,
    model,
    selection: {
      provider: group.id,
      model: model.id,
      ...model.reasoning?.defaultEffort === undefined
        ? {}
        : { reasoningEffort: model.reasoning.defaultEffort },
    } satisfies ModelSelection,
  }))), [groups])
  const showSearch = choices.length > 4
  const groupIndexes = useMemo(() => groups.map(group => ({
    group, index: new TextSearchIndex(group.models, model => ({ fuzzy: [model.name, model.id], substring: [model.description] })),
  })), [groups])
  const filteredGroups = useMemo(() => groupIndexes.map(({ group, index }) => ({
    ...group, models: index.search(showSearch ? query : ''),
  })).filter(group => group.models.length > 0), [groupIndexes, query, showSearch])
  const visibleModels = useMemo(() => filteredGroups.flatMap(group => group.models.map(model => ({
    key: `${group.provider.id}/${model.id}`,
    provider: group.provider.id,
    group: group.provider,
    model,
  }))), [filteredGroups])
  const currentKey = state.current === null ? undefined : `${state.current.provider}/${state.current.model}`
  const currentChoice = choices.find(choice => choice.key === currentKey)
  const reasoning = currentChoice?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = currentChoice === undefined
    ? undefined
    : reasoning === undefined
      ? state.retainedEffort
      : effectiveEffort === undefined
        ? t('effort.providerDefault')
        : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const currentChips = useMemo<readonly EffortChoice[]>(() => {
    const entry = currentChoice?.model
    if (entry === undefined) return []
    if (entry.reasoning === undefined) return []
    const efforts = entry.reasoning.efforts.map((effort: ModelReasoningEffort) => ({
      key: `effort:${effort.id}`,
      effort: effort.id as string | undefined,
      label: effort.name,
    }))
    // A provider default is a real, selectable option only when the catalog
    // declares one; otherwise the effort list is the whole choice.
    return entry.reasoning.defaultEffort === undefined
      ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }, ...efforts]
      : efforts
  }, [currentChoice, t])
  const { pending } = state
  const busy = pending !== null

  const menuControls: ModelMenuControls = {
    locked: locked || busy,
    dismiss: () => { closeDialog() },
    reportFailure: (message) => {
      toastSeq.current += 1
      setToast({ seq: toastSeq.current, text: message })
    },
  }

  // The dialog centres over the conversation column, not the viewport: with a
  // side panel open the two centres differ, and the picker belongs to the
  // composer it covers. One measurement per opening, from the card the seat
  // lives in.
  useLayoutEffect(() => {
    if (!open) return
    const card = triggerRef.current?.closest('[data-composer-card]')
    const rect = card?.getBoundingClientRect()
    setShift(rect === undefined ? 0 : Math.round(rect.left + rect.width / 2 - window.innerWidth / 2))
  }, [open])

  // A long catalog can open scrolled past the model in use; the dialog brings
  // the checked row into view instead of hiding it behind the footer.
  useLayoutEffect(() => {
    if (!open) return
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const highlightedIndex = highlighted ?? visibleModels.findIndex(row => row.key === currentKey)
  const activeRow = visibleModels[highlightedIndex < 0 ? 0 : highlightedIndex]
  const rowEffort = (rowKey: string, model: typeof visibleModels[number]['model']): string | undefined => {
    if (draft !== null && draft.key === rowKey) return draft.effort
    if (rowKey === currentKey) return state.current?.reasoningEffort ?? model.reasoning?.defaultEffort
    return model.reasoning?.defaultEffort
  }

  if (!available) return null

  /**
   * Fold a plugin pane away, handing the keyboard back to the footer entry that
   * opened it (the contract's data-model-menu-pane key). The model list never
   * leaves the card, so nothing else has to be restored.
   */
  function collapsePane(): void {
    const key = pane.kind === 'detail' ? pane.pane.key : undefined
    setPane(LIST_PANE)
    if (key === undefined) return
    // The entry stays mounted, so the keyboard can move before React commits
    // the collapsed card back.
    optionsRef.current?.querySelector<HTMLElement>(`[data-model-menu-pane="${key}"]`)?.focus()
  }

  function closeDialog(): void {
    setOpened(false)
    setPane(LIST_PANE)
    setQuery('')
    setHighlighted(null)
    setDraft(null)
    if (requested) clearPickerRequest(request.seq)
    triggerRef.current?.focus()
  }

  const openDialog = (): void => {
    setPane(LIST_PANE)
    setQuery('')
    setHighlighted(null)
    setDraft(null)
    setOpened(true)
    load()
  }

  const settleSelection = (result: Awaited<ReturnType<ModelSelectInjected['select']>>): void => {
    if (result === undefined) return
    if (result.ok) {
      closeDialog()
      return
    }
    const { error } = result
    toastSeq.current += 1
    setToast({
      seq: toastSeq.current,
      text: error.code === 'session/writer-held'
        ? t('error.sessionInUse')
        : t('error.action', { message: `${error.code}: ${error.message}` }),
    })
  }

  const submit = (selection: ModelSelection): void => {
    triggerRef.current?.focus()
    void select(selection).then(settleSelection)
  }

  /** Apply one row: the same route only closes, a new route selects. */
  const choose = (rowKey: string, provider: string, model: string, effort: string | undefined): void => {
    if (busy || locked) return
    if (rowKey === currentKey && effort === effectiveEffort) {
      closeDialog()
      return
    }
    submit({ provider, model, ...effort === undefined ? {} : { reasoningEffort: effort } })
  }

  const chooseEffort = (effort: string | undefined): void => {
    if (state.current === null || busy || locked) return
    if (effectiveEffort === effort) return
    submit({
      provider: state.current.provider,
      model: state.current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    })
  }

  const moveHighlight = (offset: number): void => {
    if (visibleModels.length === 0) return
    const at = highlightedIndex < 0 ? (offset > 0 ? 0 : visibleModels.length - 1) : highlightedIndex
    const next = (at + offset + visibleModels.length) % visibleModels.length
    setHighlighted(next)
    setDraft(null)
  }

  /** Draft the highlighted model's effort; Enter applies the pair. */
  const draftEffort = (direction: 1 | -1): void => {
    if (activeRow === undefined) return
    const reasoningOf = activeRow.model.reasoning
    if (reasoningOf === undefined) return
    const levels: (string | undefined)[] = reasoningOf.defaultEffort === undefined
      ? [undefined, ...reasoningOf.efforts.map(level => level.id as string | undefined)]
      : reasoningOf.efforts.map(level => level.id as string | undefined)
    if (levels.length === 0) return
    const active = rowEffort(activeRow.key, activeRow.model)
    const at = levels.findIndex(level => level === active)
    const next = levels[(Math.max(at, 0) + direction + levels.length) % levels.length]
    setDraft({ key: activeRow.key, effort: next })
  }

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      // Escape folds a plugin pane first, then closes the dialog; the modal's
      // own document listener must not also fire.
      event.preventDefault()
      event.stopPropagation()
      if (pane.kind === 'detail') collapsePane()
      else closeDialog()
      return
    }
    if (pane.kind === 'detail') return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      draftEffort(event.key === 'ArrowRight' ? 1 : -1)
      return
    }
    if (event.key === 'Enter' && activeRow !== undefined) {
      event.preventDefault()
      choose(activeRow.key, activeRow.provider, activeRow.model.id, rowEffort(activeRow.key, activeRow.model))
    }
  }

  const renderModelLabel = (
    provider: ModelLabelOwner['provider'], model: ModelLabelOwner['model'],
    placement: ModelLabelOwner['placement'], selected: boolean,
  ) => (
    <span data-provider-id={provider.id} data-model-id={model.id}>
      {renderSlot('conversation.input.model.label', {
        provider, model, placement, selected,
      }, {
        fallback: model.badge === undefined ? model.name : (
          <span className={css.badgedName}>
            <span className={css.badgedNameText}>{model.name}</span>{' '}
            <Tag className={css.badge} tone={model.badge.tone}>{resolveText(model.badge.text)}</Tag>
          </span>
        ),
      })}
    </span>
  )
  const waiting = currentChoice === undefined && state.status === 'loading'
  const modelLabel = waiting ? t('trigger.loading') : currentChoice?.model.name ?? t('trigger.fallback')
  const triggerAria = waiting
    ? t('trigger.loading')
    : currentChoice === undefined
      ? t('trigger.selectAria')
      : effortLabel === undefined
        ? t('trigger.aria', { model: modelLabel })
        : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel })
  const pickerStyle: CSSProperties | undefined = shift === 0 ? undefined : { transform: `translateX(${String(shift)}px)` }

  return (
    <div className={css.root}>
      <button
        ref={triggerRef}
        type="button"
        className={clsx(css.trigger, open && css.triggerOpen)}
        aria-label={triggerAria}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={modelLabel}
        aria-busy={busy}
        disabled={locked}
        onMouseDown={(event) => { event.preventDefault() }}
        onClick={() => { if (open) closeDialog(); else openDialog() }}
      >
        {/* The composer's own width measurement hides the label in compact
            rows; the glyph keeps the seat recognisable there. */}
        <IconDataOutlineRegular className={css.triggerIcon} size={16} />
        <span className={css.triggerLabel}>
          {currentChoice === undefined ? modelLabel : renderModelLabel(currentChoice.group.provider, currentChoice.model, 'trigger', true)}
        </span>
        {busy
          ? <StateDot state="ongoing" />
          : <IconChevronDownOutlineRegular className={clsx(css.chevron, open && css.chevronOpen)} />}
      </button>

      {currentChips.length > 0 && (
        <div className={css.chips} role="group" aria-label={t('menu.effort')}>
          {currentChips.map(level => (
            <button
              key={level.key}
              type="button"
              className={clsx(css.chip, effectiveEffort === level.effort && css.chipSelected)}
              aria-pressed={effectiveEffort === level.effort}
              disabled={locked || busy}
              // Keep the composer's draft focus: the chip is a composer control.
              onMouseDown={(event) => { event.preventDefault() }}
              onClick={() => { chooseEffort(level.effort) }}
            >
              {level.label}
            </button>
          ))}
        </div>
      )}


      <Modal
        open={open}
        onClose={closeDialog}
        title={t('menu.aria')}
        closeLabel={t('menu.close')}
        {...currentChoice === undefined ? {} : { description: t('menu.current', { model: modelLabel }) }}
        className={clsx(css.picker)}
        contentClassName={clsx(css.pickerContent)}
        {...pickerStyle === undefined ? {} : { style: pickerStyle }}
        onKeyDownCapture={onKeyDownCapture}
        footer={(
          <div className={clsx(css.foot)}>
            <div className={clsx(css.footBar)}>
              <div ref={optionsRef} className={clsx(css.options)}>
                {renderSlot('conversation.input.model.options', {
                  ...menuControls,
                  openPaneKey: pane.kind === 'detail' ? pane.pane.key : null,
                  openPane: (ref: ModelMenuPaneRef) => {
                    // An entry toggles its own pane: clicking it again folds it.
                    setPane(current => current.kind === 'detail' && current.pane.key === ref.key
                      ? LIST_PANE
                      : { kind: 'detail', pane: ref })
                  },
                })}
              </div>
              <div className={clsx(css.hints)}>
                <span className={clsx(css.hint)}><span className={css.kbd}>↑↓</span>{t('menu.model')}</span>
                <span className={clsx(css.hint)}><span className={css.kbd}>←→</span>{t('menu.effort')}</span>
                <span className={clsx(css.hint)}><span className={css.kbd}>{t('menu.keyApply')}</span></span>
                <span className={clsx(css.hint)}><span className={css.kbd}>{t('menu.keyClose')}</span></span>
              </div>
            </div>
            {pane.kind === 'detail' && (
              <div className={clsx(css.pane)}>
                {renderSlot('conversation.input.model.pane', menuControls, { entryKey: pane.pane.key })}
              </div>
            )}
          </div>
        )}
      >
        <div ref={menuRef} className={css.body}>
          {showSearch && (
            <div className={css.searchRow}>
              <Input
                ref={searchRef}
                data-modal-autofocus={query === '' ? '' : undefined}
                className={clsx(css.search)}
                type="text"
                role="searchbox"
                aria-label={t('search.placeholder')}
                placeholder={t('search.placeholder')}
                value={query}
                readOnly={busy}
                onChange={(event) => { setQuery(event.target.value); setHighlighted(0); setDraft(null) }}
              />
            </div>
          )}
          {state.status === 'loading' && <div className={css.status}>{t('status.loading')}</div>}
          {state.error !== null && (
            <div className={css.error}>
              <span>{t('error.action', { message: state.error })}</span>
              <button type="button" className={css.retry} onClick={() => { load() }}>{t('action.reload')}</button>
            </div>
          )}
          {state.failures.map(failure => (
            <div className={css.warning} key={failure.id}>
              <span>{t('warning.groupLoad', {
                name: failure.id === 'deepseek-account' ? t('provider.account') : failure.name,
                message: failure.message,
              })}</span>
              <button type="button" className={css.retry} onClick={() => { load() }}>{t('action.reload')}</button>
            </div>
          ))}
          <div className={css.rows} role="listbox" aria-label={t('menu.model')} id={`${id}-picker-list`}>
            {filteredGroups.map(group => (
              <div key={group.provider.id} className={css.group}>
                <div className={css.groupLabel}>{group.provider.name}</div>
                {group.models.map((model) => {
                  const rowKey = `${group.provider.id}/${model.id}`
                  const index = visibleModels.findIndex(row => row.key === rowKey)
                  const selected = rowKey === currentKey
                  const shownEffort = rowEffort(rowKey, model)
                  const levels: EffortChoice[] = model.reasoning === undefined
                    ? []
                    : [
                      ...model.reasoning.defaultEffort === undefined
                        ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
                        : [],
                      ...model.reasoning.efforts.map((effort: ModelReasoningEffort) => ({
                        key: `effort:${effort.id}`,
                        effort: effort.id as string | undefined,
                        label: effort.name,
                      })),
                    ]
                  return (
                    <div
                      key={rowKey}
                      ref={selected ? selectedRowRef : undefined}
                      role="option"
                      aria-selected={selected}
                      tabIndex={-1}
                      data-highlighted={index === highlightedIndex ? '' : undefined}
                      className={clsx(css.row, selected && css.rowSelected, index === highlightedIndex && css.rowActive)}
                      {...(index === highlightedIndex && !showSearch ? { 'data-modal-autofocus': '' } : {})}
                      onMouseMove={() => { if (index !== highlightedIndex) { setHighlighted(index); setDraft(null) } }}
                      onClick={() => { choose(rowKey, group.provider.id, model.id, shownEffort) }}
                    >
                      <span className={css.rowMain}>
                        <span className={css.rowName}>
                          {renderModelLabel(group.provider, model, 'option', selected)}
                        </span>
                        {model.description !== undefined && <span className={css.rowDesc}>{model.description}</span>}
                      </span>
                      {levels.length > 0 && (
                        <span className={css.rowChips} role="group" aria-label={t('menu.effort')}>
                          {levels.map(level => (
                            <button
                              key={level.key}
                              type="button"
                              tabIndex={-1}
                              className={clsx(css.rowChip, shownEffort === level.effort && css.rowChipSelected)}
                              aria-pressed={shownEffort === level.effort}
                              disabled={locked || busy}
                              onClick={(event) => {
                                event.stopPropagation()
                                choose(rowKey, group.provider.id, model.id, level.effort)
                              }}
                            >
                              {level.label}
                            </button>
                          ))}
                        </span>
                      )}
                      <span className={css.check}>
                        {pending?.provider === group.provider.id && pending.model === model.id
                          ? <StateDot state="ongoing" />
                          : selected ? <IconCheckOutlineRegular /> : null}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          {state.status === 'ready' && filteredGroups.length === 0 && (
            <div className={css.empty} role="status">{t(choices.length === 0 ? 'empty.models' : 'search.empty')}</div>
          )}
        </div>
      </Modal>

      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutlineRegular />}
          anchor={triggerRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
