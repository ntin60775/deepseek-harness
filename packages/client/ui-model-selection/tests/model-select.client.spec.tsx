// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, onTestFinished, vi, beforeEach } from 'vitest'
import {
  RemoteError, SlotTestRuntime, bindSnapshotSelector, makeTranslate,
} from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelCatalogModel, ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentProps } from 'react'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import type { ModelPickerRequest } from '../src/client/slots.ts'
import { ModelSelect } from '../src/client/ModelSelect.tsx'
import { en, zh } from '../src/client/locales.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { brandString } from '@deepseek-ai/dsh-brand'

afterEach(cleanup)

// jsdom has no scrollIntoView; the picker scrolls the checked row into view.
beforeEach(() => {
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() })
  onTestFinished(() => {
    if (descriptor === undefined) Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    else Object.defineProperty(Element.prototype, 'scrollIntoView', descriptor)
  })
})

type SeatProps = ComponentProps<typeof ModelSelect>
type SelectOutcome = Awaited<ReturnType<SeatProps['select']>>

// The seat's key domain is model ∪ common; makeTranslate mirrors the real
// lookup chain: package dictionary, then the shared vocabulary, then the key.
const tzh = makeTranslate(zh, commonZh)
const ten = makeTranslate(en, commonEn)

const SESSION = brandString<SessionId>('composer-seat')
const OTHER_SESSION = brandString<SessionId>('other-seat')

/** Resolve a catalog badge the way the injected resolver does for English. */
const resolveText: SeatProps['resolveText'] = text => typeof text === 'string' ? text : text.en
/** No label contribution: the trigger and every row keep the catalog name. */
const renderLabel: SeatProps['renderSlot'] = (_name, _owner, options) => options?.fallback ?? null

const reasoning = {
  efforts: [
    { id: 'off', name: 'Off' },
    { id: 'high', name: 'High' },
    { id: 'max', name: 'Max', description: 'Largest budget' },
  ],
  defaultEffort: 'high',
}

function group(
  models: readonly ModelCatalogModel[],
  id = 'deepseek-official',
  name = 'DeepSeek',
): ModelProviderGroup {
  return { id, name, models }
}

function state(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    routable: true,
    groups: [group([{
      id: 'deepseek-v4-flash',
      name: 'DeepSeek-V4-Flash',
      description: 'Fast catalog description',
      reasoning,
    }])],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
    ...overrides,
  }
}

/**
 * A catalog where every row has its own level set: the flash default is the
 * declared High, the pro entry declares no default, and the lite entry has no
 * reasoning at all.
 */
function fullCatalog(): ModelProviderGroup[] {
  return [group([
    {
      id: 'deepseek-v4-flash',
      name: 'DeepSeek-V4-Flash',
      description: 'Fast catalog description',
      reasoning,
    },
    {
      id: 'deepseek-v4-pro',
      name: 'DeepSeek-V4-Pro',
      description: 'Deep catalog description',
      reasoning: { efforts: [{ id: 'low', name: 'Low' }] },
    },
    {
      id: 'deepseek-v4-lite',
      name: 'DeepSeek-V4-Lite',
      description: 'Lite catalog description',
    },
  ])]
}

/** `count` plain models in one provider, for the catalog-size thresholds. */
function modelGroups(count: number): ModelProviderGroup[] {
  return [group(Array.from({ length: count }, (_, index) => ({
    id: `model-${index + 1}`,
    name: `Model ${index + 1}`,
  })))]
}

interface Seat {
  directory: SnapshotStore<ModelDirectoryState>
  request: SnapshotStore<ModelPickerRequest | null>
  select: ReturnType<typeof vi.fn<(selection: ModelSelection) => Promise<SelectOutcome>>>
  load: ReturnType<typeof vi.fn<() => void>>
  clearRequest: ReturnType<typeof vi.fn<(seq: number) => void>>
}

/**
 * Render the seat with the injected face the renderer binds: the picker
 * request is a real observable behind the selector hook, and clearing a
 * request writes it back, so open/close cycles behave as in the product.
 */
function mountSeat(options: {
  state?: Partial<ModelDirectoryState>
  props?: Partial<SeatProps>
  requests?: ModelPickerRequest | null
} = {}): Seat {
  const directory = createSnapshotStore(state(options.state))
  const request = createSnapshotStore<ModelPickerRequest | null>(options.requests ?? null)
  const select = vi.fn<(selection: ModelSelection) => Promise<SelectOutcome>>(
    async () => ({ ok: true, value: undefined }),
  )
  const load = vi.fn<() => void>()
  const clearRequest = vi.fn<(seq: number) => void>((seq) => {
    if (request.getSnapshot()?.seq === seq) request.set(null)
  })
  render(<ModelSelect
    locked={false}
    available
    sessionId={SESSION}
    directory={directory}
    load={load}
    select={select}
    resolveText={resolveText}
    t={tzh}
    renderSlot={renderLabel}
    usePickerRequest={bindSnapshotSelector(request)}
    clearPickerRequest={clearRequest}
    {...options.props}
  />)
  return { directory, request, select, load, clearRequest }
}

/** The trigger of a seat whose aria-label names the model and its level. */
function triggerOf(model = 'DeepSeek-V4-Flash', effort = 'High'): HTMLElement {
  return screen.getByRole('button', { name: tzh('trigger.ariaEffort', { model, effort }) })
}

/** Click the seat chip and hand back the dialog the contract promises. */
function openPicker(trigger: HTMLElement = triggerOf()): HTMLElement {
  fireEvent.click(trigger)
  return screen.getByRole('dialog', { name: tzh('menu.aria') })
}

/** The option row of one model, in the picker's catalog order. */
function rowOf(model: string): HTMLElement {
  return screen.getByRole('option', { name: new RegExp(model) })
}

/**
 * The level chips beside the trigger. Per-row chip groups carry the same
 * accessible name, so the trigger-side group is the first one in document
 * order (the dialog is portaled after the seat).
 */
function triggerChips(): HTMLElement[] {
  const chips = screen.getAllByRole('group', { name: tzh('menu.effort') })[0]
  if (chips === undefined) throw new Error('the seat rendered no level chips')
  return within(chips).getAllByRole('button')
}

describe('ModelSelect seat', () => {
  it('names the current model and its level, and opens the picker dialog from the chip', () => {
    const { load } = mountSeat()
    const trigger = triggerOf()
    expect(trigger.textContent).toBe('DeepSeek-V4-Flash')
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    const dialog = openPicker(trigger)
    // The accessible name of the dialog is the picker title, and its header
    // states the value in use so the list is read in context.
    expect(dialog.getAttribute('aria-label')).toBe(tzh('menu.aria'))
    expect(within(dialog).getByText(tzh('menu.current', { model: 'DeepSeek-V4-Flash' }))).toBeTruthy()
    expect(screen.getByRole('button', { name: tzh('menu.close') })).toBeTruthy()
    expect(screen.getByRole('listbox', { name: tzh('menu.model') })).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    // Opening refreshes the shared advisory catalog.
    expect(load).toHaveBeenCalledTimes(1)

    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('falls back to the select prompt when the saved route left the catalog', () => {
    mountSeat({ state: { current: { provider: 'deepseek-official', model: 'removed-model' } } })
    const trigger = screen.getByRole('button', { name: tzh('trigger.selectAria') })
    expect(trigger.textContent).toBe(tzh('trigger.fallback'))
    // No route means no level to caption and no level chips beside the chip.
    expect(screen.queryByRole('group', { name: tzh('menu.effort') })).toBeNull()

    const dialog = openPicker(trigger)
    // The catalog stays browsable; the stale route is not presented as a row.
    expect(screen.queryByRole('option', { name: /removed-model/ })).toBeNull()
    expect(within(dialog).getAllByRole('option').every(row => row.getAttribute('aria-selected') === 'false')).toBe(true)
    expect(within(dialog).queryByText(tzh('menu.current', { model: 'removed-model' }))).toBeNull()
  })

  it('renders no Agent-bound control for an addressed subagent session', () => {
    const { load } = mountSeat({ props: { available: false } })
    expect(screen.queryByRole('button')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })
})

describe('ModelSelect effort chips', () => {
  it('shows one chip per level and applies a level as a selection of the same model', () => {
    const { select } = mountSeat()
    const chips = triggerChips()
    expect(chips.map(chip => chip.textContent)).toEqual(['Off', 'High', 'Max'])
    // The level in use is the catalog default until the Session overrides it.
    expect(chips.map(chip => chip.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])

    fireEvent.click(screen.getByRole('button', { name: 'Max' }))
    expect(select).toHaveBeenCalledWith({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'max',
    })
    // A level is a composer action, not a picker visit.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not resend the level already in use', () => {
    const { select } = mountSeat()
    fireEvent.click(screen.getByRole('button', { name: 'High' }))
    expect(select).not.toHaveBeenCalled()
  })

  it('offers the provider default only when the catalog declares no default', () => {
    const standard = { efforts: [{ id: 'standard', name: 'Standard' }] }
    const { select, directory } = mountSeat({
      state: {
        current: { provider: 'provider', model: 'model' },
        groups: [group([{ id: 'model', name: 'Model', reasoning: standard }], 'provider', 'Provider')],
      },
    })
    // Without a declared default the provider default IS a selectable level.
    let chips = triggerChips()
    expect(chips.map(chip => chip.textContent)).toEqual(['Default', 'Standard'])
    expect(chips[0]!.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Standard' }))
    expect(select).toHaveBeenCalledWith({ provider: 'provider', model: 'model', reasoningEffort: 'standard' })

    // From a concrete level back to the provider default drops the field.
    act(() => {
      directory.set(state({
        current: { provider: 'provider', model: 'model', reasoningEffort: 'standard' },
        groups: [group([{ id: 'model', name: 'Model', reasoning: standard }], 'provider', 'Provider')],
      }))
    })
    chips = triggerChips()
    expect(chips[1]!.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Default' }))
    expect(select).toHaveBeenLastCalledWith({ provider: 'provider', model: 'model' })
  })

  it('renders no chips for a model whose catalog entry has no levels', () => {
    mountSeat({
      state: {
        current: { provider: 'provider', model: 'model' },
        groups: [group([{ id: 'model', name: 'Model' }], 'provider', 'Provider')],
      },
    })
    expect(screen.getByRole('button', { name: tzh('trigger.aria', { model: 'Model' }) })).toBeTruthy()
    expect(screen.queryByRole('group', { name: tzh('menu.effort') })).toBeNull()
  })
})

describe('ModelSelect picker dialog', () => {
  it('lists every model with its description and all of its own levels at once', () => {
    mountSeat({ state: { groups: fullCatalog() } })
    const dialog = openPicker(triggerOf())
    const rows = within(dialog).getAllByRole('option')
    expect(rows).toHaveLength(3)
    // One screen: name, description, and that model's whole level set.
    expect(rows[0]!.textContent).toContain('DeepSeek-V4-Flash')
    expect(rows[0]!.textContent).toContain('Fast catalog description')
    expect(within(rows[0]!).getAllByRole('button').map(chip => chip.textContent)).toEqual(['Off', 'High', 'Max'])
    expect(rows[1]!.textContent).toContain('Deep catalog description')
    expect(within(rows[1]!).getAllByRole('button').map(chip => chip.textContent)).toEqual(['Default', 'Low'])
    expect(rows[2]!.textContent).toContain('Lite catalog description')
    expect(within(rows[2]!).queryAllByRole('button')).toHaveLength(0)
    // The route in use is marked for assistive tech.
    expect(rows.map(row => row.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
  })

  it('applies a row level as one model-and-effort selection and closes the dialog', async () => {
    const { select } = mountSeat({ state: { groups: fullCatalog() } })
    const trigger = triggerOf()
    openPicker(trigger)
    fireEvent.click(within(rowOf('DeepSeek-V4-Pro')).getByRole('button', { name: 'Low' }))

    expect(select).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledWith({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'low',
    })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(document.activeElement).toBe(trigger)
  })

  it('applies the level shown on a row when the row itself is clicked', async () => {
    const { select } = mountSeat({ state: { groups: fullCatalog() } })
    openPicker(triggerOf())

    // The current model at its current level is already the session value; the
    // row click only closes.
    fireEvent.click(rowOf('DeepSeek-V4-Flash'))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(select).not.toHaveBeenCalled()

    // A model without a declared default is applied without an effort field.
    openPicker(triggerOf())
    fireEvent.click(rowOf('DeepSeek-V4-Pro'))
    expect(select).toHaveBeenCalledWith({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })
})

describe('ModelSelect dialog keyboard', () => {
  it('walks the highlighted row with the vertical arrows and drafts its level with the horizontal ones', () => {
    mountSeat({ state: { groups: fullCatalog() } })
    openPicker(triggerOf())
    const rows = screen.getAllByRole('option')
    // The picker opens on the route in use.
    expect(rows[0]!.hasAttribute('data-highlighted')).toBe(true)

    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' })
    expect(rows[1]!.hasAttribute('data-highlighted')).toBe(true)
    expect(rows[0]!.hasAttribute('data-highlighted')).toBe(false)
    fireEvent.keyDown(rows[1]!, { key: 'ArrowUp' })
    expect(rows[0]!.hasAttribute('data-highlighted')).toBe(true)

    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' })
    const pro = rows[1]!
    const pressed = () => within(pro).getAllByRole('button')
      .filter(chip => chip.getAttribute('aria-pressed') === 'true')
      .map(chip => chip.textContent)
    expect(pressed()).toEqual(['Default'])
    // ←/→ draft the highlighted model's level; nothing is submitted yet.
    fireEvent.keyDown(pro, { key: 'ArrowRight' })
    expect(pressed()).toEqual(['Low'])
    fireEvent.keyDown(pro, { key: 'ArrowLeft' })
    expect(pressed()).toEqual(['Default'])
    expect(screen.getByRole('dialog', { name: tzh('menu.aria') })).toBeTruthy()
  })

  it('submits the drafted pair on Enter and closes the dialog', async () => {
    const { select } = mountSeat({ state: { groups: fullCatalog() } })
    openPicker(triggerOf())
    const rows = screen.getAllByRole('option')
    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' })
    fireEvent.keyDown(rows[1]!, { key: 'ArrowRight' })
    fireEvent.keyDown(rows[1]!, { key: 'Enter' })

    expect(select).toHaveBeenCalledWith({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'low',
    })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('closes on Escape without a selection', async () => {
    const { select } = mountSeat({ state: { groups: fullCatalog() } })
    const trigger = triggerOf()
    openPicker(trigger)
    const focused = document.activeElement
    if (!(focused instanceof HTMLElement)) throw new Error('the dialog placed no initial focus')
    fireEvent.keyDown(focused, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(select).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('ModelSelect search', () => {
  const searchable = (): ModelDirectoryState => state({
    current: { provider: 'deepseek-official', model: 'beta' },
    groups: [
      group([
        { id: 'alpha', name: 'Alpha', description: 'Long context' },
        { id: 'beta', name: 'Beta', description: 'Vision specialist' },
        { id: 'gamma', name: 'Gamma', description: 'Fast responses' },
        { id: 'delta', name: 'Delta', description: 'Cheap batch' },
        { id: 'epsilon', name: 'Epsilon', description: 'Deep reasoning' },
      ]),
      group([{ id: 'zeta', name: 'Zeta', description: 'Third party' }], 'external', 'External Provider'),
    ],
  })

  it.each([0, 1, 4, 5])('shows search only above four models (%i models)', (count) => {
    const current = count > 1
      ? { provider: 'deepseek-official', model: 'model-2' }
      : count === 1 ? { provider: 'deepseek-official', model: 'model-1' } : null
    mountSeat({ state: { groups: modelGroups(count), current } })
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: tzh('menu.aria') })).toBeTruthy()
    expect(screen.queryAllByRole('option')).toHaveLength(count)
    if (count > 4) expect(screen.getByRole('searchbox', { name: tzh('search.placeholder') })).toBeInstanceOf(HTMLInputElement)
    else expect(screen.queryByRole('searchbox')).toBeNull()
    if (count === 0) expect(screen.getByRole('status').textContent).toBe(tzh('empty.models'))
  })

  it('filters by model name and catalog description, and reports no matches', () => {
    mountSeat({ state: searchable() })
    const trigger = screen.getByRole('button', { name: tzh('trigger.aria', { model: 'Beta' }) })
    openPicker(trigger)
    const search = screen.getByRole('searchbox', { name: tzh('search.placeholder') })
    // A large catalog opens with the query field focused, ready to type.
    expect(document.activeElement).toBe(search)

    // Arrows over the results keep the typing focus.
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[2]!.hasAttribute('data-highlighted')).toBe(true)
    expect(document.activeElement).toBe(search)

    // The description is searchable too, not only the name.
    fireEvent.change(search, { target: { value: 'vision' } })
    expect(screen.getAllByRole('option').map(row => row.textContent)).toEqual(['BetaVision specialist'])
    expect(screen.queryByText('External Provider')).toBeNull()

    fireEvent.change(search, { target: { value: 'zeta' } })
    expect(screen.getAllByRole('option').map(row => row.textContent)).toEqual(['ZetaThird party'])
    expect(screen.queryByText('DeepSeek')).toBeNull()

    fireEvent.change(search, { target: { value: 'zzzz' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe(tzh('search.empty'))
  })

  it('hides a provider heading whose models were filtered out', () => {
    mountSeat({ state: { groups: [...modelGroups(5), group([], 'empty', 'Empty Provider')] } })
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    expect(screen.queryByText('Empty Provider')).toBeNull()
    expect(screen.getByText('DeepSeek')).toBeTruthy()
  })
})

describe('ModelSelect catalog states', () => {
  it('announces the loading catalog and settles into the selection', () => {
    const { directory } = mountSeat({
      state: { current: null, routable: null, groups: [], status: 'loading' },
    })
    fireEvent.click(screen.getByRole('button', { name: tzh('trigger.loading') }))
    const dialog = screen.getByRole('dialog', { name: tzh('menu.aria') })
    expect(within(dialog).getByText(tzh('status.loading'))).toBeTruthy()
    // The empty-list notice belongs to a settled catalog, not a pending load.
    expect(within(dialog).queryByRole('status')).toBeNull()

    act(() => { directory.set(state()) })
    expect(screen.getByRole('button', { name: tzh('trigger.ariaEffort', { model: 'DeepSeek-V4-Flash', effort: 'High' }) })).toBeTruthy()
  })

  it('reports a failed catalog load with a retry that reloads', () => {
    const { load } = mountSeat({ state: { groups: [], status: 'error', error: 'catalog down' } })
    fireEvent.click(screen.getByRole('button', { name: tzh('trigger.selectAria') }))
    expect(screen.getByText(tzh('error.action', { message: 'catalog down' }))).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: tzh('action.reload') }))
    // One load from opening the picker, one from the retry.
    expect(load).toHaveBeenCalledTimes(2)
  })

  it.each([
    { provider: 'gateway', name: 'Gateway X' },
    { provider: 'deepseek-account', name: 'DeepSeek Account' },
  ])('warns about a failed provider group and retries ($provider)', ({ provider, name }) => {
    const { load } = mountSeat({
      state: {
        groups: [group([{
          id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning,
        }])],
        failures: [{ id: provider, name, message: 'timeout' }],
      },
    })
    fireEvent.click(triggerOf())
    // The account provider is displayed under its localized name, and the
    // failure sentence uses that same display name.
    const displayName = provider === 'deepseek-account' ? tzh('provider.account') : name
    expect(screen.getByText(tzh('warning.groupLoad', { name: displayName, message: 'timeout' }))).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: tzh('action.reload') }))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('announces an empty catalog', () => {
    mountSeat({ state: { current: null, groups: [] } })
    fireEvent.click(screen.getByRole('button', { name: tzh('trigger.selectAria') }))
    expect(screen.getByRole('status').textContent).toBe(tzh('empty.models'))
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})

describe('ModelSelect selection failure', () => {
  it.each([
    {
      code: 'session/writer-held',
      // RemoteFailure is a union of code-literal RemoteErrors, so each row
      // builds its own literal-code error instead of widening the code.
      failure: () => new RemoteError('session/writer-held', 'writer held', {
        sessionId: brandString<SessionId>('owned'),
      }),
      copy: () => zh['error.sessionInUse'],
    },
    {
      code: 'session/model-unavailable',
      failure: () => new RemoteError('session/model-unavailable', 'session already contains images', {
        provider: 'deepseek-official',
        model: 'deepseek-v4-pro',
      }),
      copy: () => tzh('error.action', { message: 'session/model-unavailable: session already contains images' }),
    },
  ])('announces a rejected selection through the toast ($code)', async ({ failure, copy }) => {
    const select = vi.fn<(selection: ModelSelection) => Promise<SelectOutcome>>(async () => ({
      ok: false as const,
      error: failure(),
    }))
    mountSeat({ state: { groups: fullCatalog() }, props: { select } })
    openPicker(triggerOf())
    fireEvent.click(within(rowOf('DeepSeek-V4-Pro')).getByRole('button', { name: 'Low' }))

    const toast = await screen.findByRole('alert')
    // A rejected selection is transient feedback, not a catalog-load strip:
    // the picker keeps its rows and offers no reload control for it.
    expect(toast.textContent).toBe(copy())
    expect(screen.getByRole('dialog', { name: tzh('menu.aria') })).toBeTruthy()
  })
})

describe('ModelSelect picker request', () => {
  it('opens the picker when the Session already holds an open request', () => {
    mountSeat({ requests: { sessionId: SESSION, seq: 1 } })
    // The shortcut opens the same dialog the chip does, with no click.
    expect(screen.getByRole('dialog', { name: tzh('menu.aria') })).toBeTruthy()
    expect(triggerOf().getAttribute('aria-expanded')).toBe('true')
  })

  it('opens the picker for a request that arrives later and retires it on close', async () => {
    const { request, clearRequest } = mountSeat()
    act(() => { request.set({ sessionId: SESSION, seq: 2 }) })
    expect(screen.getByRole('dialog', { name: tzh('menu.aria') })).toBeTruthy()

    const focused = document.activeElement
    if (!(focused instanceof HTMLElement)) throw new Error('the dialog placed no initial focus')
    fireEvent.keyDown(focused, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    // The consumed request is retired, so a remount cannot reopen the picker.
    expect(clearRequest).toHaveBeenCalledWith(2)
    expect(request.getSnapshot()).toBeNull()
  })

  it('ignores a request addressed to another Session', () => {
    mountSeat({ requests: { sessionId: OTHER_SESSION, seq: 5 } })
    expect(screen.queryByRole('dialog')).toBeNull()
    // A foreign request must not block this seat's own entry point either.
    fireEvent.click(triggerOf())
    expect(screen.getByRole('dialog', { name: tzh('menu.aria') })).toBeTruthy()
  })

  it('retires only the request this seat consumed when it closes', () => {
    // Another Session's shortcut request is pending while THIS seat opens its
    // picker by click: closing here must not cancel the other seat's open.
    // closeDialog clears any non-null request today (src/client/ModelSelect.tsx:196)
    // instead of the `requested` one it opened with.
    const { request, clearRequest } = mountSeat({ requests: { sessionId: OTHER_SESSION, seq: 5 } })
    fireEvent.click(triggerOf())
    fireEvent.click(triggerOf())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(clearRequest).not.toHaveBeenCalled()
    expect(request.getSnapshot()).toEqual({ sessionId: OTHER_SESSION, seq: 5 })
  })
})

describe('ModelSelect busy and locked', () => {
  it('disables the trigger and every chip while the composer refuses changes', () => {
    mountSeat({ props: { locked: true } })
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    expect(trigger.hasAttribute('disabled')).toBe(true)
    const chips = triggerChips()
    expect(chips.every(chip => chip.hasAttribute('disabled'))).toBe(true)
    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('blocks a second selection while one is saving and settles the feedback afterwards', async () => {
    const pending = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
    const { select, directory } = mountSeat({
      state: { pending, groups: fullCatalog() },
    })
    const trigger = triggerOf()
    expect(trigger.getAttribute('aria-busy')).toBe('true')
    const chips = triggerChips()
    expect(chips.every(chip => chip.hasAttribute('disabled'))).toBe(true)

    openPicker(trigger)
    const pro = rowOf('DeepSeek-V4-Pro')
    // Row controls refuse while the save is in flight; the row itself is
    // guarded too, so no second selection can race the first.
    expect(within(pro).getAllByRole('button').every(chip => chip.hasAttribute('disabled'))).toBe(true)
    fireEvent.click(pro)
    expect(select).not.toHaveBeenCalled()

    await act(async () => { directory.set(state({ groups: fullCatalog() })) })
    expect(trigger.getAttribute('aria-busy')).toBe('false')
    expect(triggerChips().every(chip => chip.hasAttribute('disabled'))).toBe(false)
  })
})

describe('ModelSelect provider order', () => {
  it('places account and official models before third-party models', async () => {
    const groups = ['custom', 'deepseek-official', 'deepseek-account', 'another'].map(id => group(
      [1, 2].map(index => ({ id: `${id}-${index}`, name: `${id}-${index}` })),
      id,
      id,
    ))
    mountSeat({ state: { current: null, groups } })
    fireEvent.click(screen.getByRole('button', { name: tzh('trigger.selectAria') }))
    const names = screen.getAllByRole('option').map(row => row.textContent)
    expect(names).toEqual([
      'deepseek-account-1', 'deepseek-account-2', 'deepseek-official-1', 'deepseek-official-2',
      'custom-1', 'custom-2', 'another-1', 'another-2',
    ])
    // Ordering is a display projection: the store's catalog keeps its order.
    expect(groups.map(entry => entry.id)).toEqual(['custom', 'deepseek-official', 'deepseek-account', 'another'])
    await expect(`${names.join('\n')}\n`).toMatchFileSnapshot('./expected/account-first.txt')
  })

  it.each([['zh', tzh], ['en', ten]] as const)('localizes the account group while preserving external names (%s)', (_locale, copy) => {
    const groups = [
      group([{ id: 'model', name: 'Model' }], 'deepseek-account', 'DeepSeek Account'),
      group([{ id: 'model', name: 'Model' }], 'custom', 'My Gateway'),
    ]
    mountSeat({ state: { current: null, groups }, props: { t: copy } })
    fireEvent.click(screen.getByRole('button', { name: copy('trigger.selectAria') }))
    const dialog = screen.getByRole('dialog', { name: copy('menu.aria') })
    expect(within(dialog).getByText(copy('provider.account'))).toBeTruthy()
    expect(within(dialog).getByText('My Gateway')).toBeTruthy()
  })
})

describe('ModelSelect saved route', () => {
  it('hides the inherited effort until a listed model is selected', async () => {
    const { select } = mountSeat({
      state: { current: null, routable: false, retainedEffort: 'High' },
    })
    const trigger = screen.getByRole('button', { name: tzh('trigger.selectAria') })
    expect(trigger.hasAttribute('disabled')).toBe(false)
    // The retained effort belongs to the saved route, not to the trigger text.
    await expect(`${trigger.textContent}\n`).toMatchFileSnapshot('./expected/unselected-model.txt')
    expect(trigger.textContent).not.toContain('High')
    expect(screen.queryByRole('group', { name: tzh('menu.effort') })).toBeNull()

    openPicker(trigger)
    expect(screen.getByRole('option', { name: /DeepSeek-V4-Flash/ })).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(select).not.toHaveBeenCalled()
  })

  it('restores the account model name after login without changing the saved route', () => {
    const groups = [group([{ id: 'deepseek-flash', name: 'DeepSeek Flash', reasoning }], 'deepseek-account', 'DeepSeek Account')]
    const selected = { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' }
    const { directory } = mountSeat({ state: { current: selected, groups, retainedEffort: 'High' } })
    expect(triggerOf('DeepSeek Flash', 'High').textContent).toBe('DeepSeek Flash')

    act(() => { directory.update((snapshot) => { snapshot.groups = []; snapshot.routable = false }) })
    expect(screen.getByRole('button', { name: tzh('trigger.selectAria') }).textContent).toBe(tzh('trigger.fallback'))

    act(() => { directory.update((snapshot) => { snapshot.groups = groups; snapshot.routable = true }) })
    expect(triggerOf('DeepSeek Flash', 'High').textContent).toBe('DeepSeek Flash')
    // The saved route survives a catalog gap; the client never rewrites it.
    expect(directory.getSnapshot().current).toEqual(selected)
  })
})

describe('ModelSelect catalog badges', () => {
  const BADGE = { text: { en: 'New', zh: '新' }, tone: 'info' } as const
  // Locale maps are partial: the required English entry is the fallback.
  const chinese: SeatProps['resolveText'] = text => typeof text === 'string' ? text : text.zh ?? text.en
  const badged = (): ModelDirectoryState => state({
    current: { provider: 'deepseek-official', model: 'deepseek-flash' },
    groups: [group([
      { id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash', badge: BADGE },
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
    ])],
  })

  it('renders the provider-authored badge in the trigger and in the picker rows', () => {
    mountSeat({ state: badged(), props: { resolveText: chinese } })
    const trigger = screen.getByRole('button', { name: tzh('trigger.aria', { model: 'DeepSeek-V4.1-Flash' }) })
    expect(trigger.textContent).toContain('DeepSeek-V4.1-Flash')
    expect(within(trigger).getByText('新').getAttribute('data-tone')).toBe('info')

    openPicker(trigger)
    const badgedRow = rowOf('DeepSeek-V4.1-Flash')
    expect(badgedRow.textContent).toContain('DeepSeek-V4.1-Flash')
    expect(within(badgedRow).getByText('新').getAttribute('data-tone')).toBe('info')
    expect(within(rowOf('DeepSeek-V4-Pro')).queryByText('新')).toBeNull()
  })

  it('hands the badge to a label contribution, which replaces the default rendering', async () => {
    const runtime = await SlotTestRuntime.create()
    onTestFinished(() => runtime.dispose())
    const sessionId = brandString<SessionId>('model-badge')
    await runtime.sessions.add({ id: sessionId })
    const session = runtime.sessions.retainFor(runtime.ctx, sessionId)
    const directory = createSnapshotStore(badged())
    await runtime.root.declare({
      'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true },
      'conversation.input.model.options': { kind: 'list', scope: 'session' },
      'conversation.input.model.pane': { kind: 'keyed', scope: 'session' },
    }, ({ renderSlot, SessionProvider }) => <SessionProvider session={session}>
      <ModelSelect locked={false} available sessionId={sessionId} directory={directory}
        load={vi.fn<() => void>()} resolveText={chinese} select={vi.fn()} t={tzh} renderSlot={renderSlot}
        usePickerRequest={bindSnapshotSelector(createSnapshotStore<ModelPickerRequest | null>(null))}
        clearPickerRequest={vi.fn<(seq: number) => void>()} />
    </SessionProvider>)
    runtime.renderRoot()
    await runtime.mount({ inject: ['slots'], apply(ctx) {
      ctx.slots.inject('conversation.input.model.label', () => ctx.slots.register({
        name: 'conversation.input.model.label',
      }, ({ model }) => <span>{model.name} [{model.badge?.tone ?? 'none'}]</span>))
    } })
    expect(screen.getByRole('button', { name: tzh('trigger.aria', { model: 'DeepSeek-V4.1-Flash' }) }).textContent)
      .toBe('DeepSeek-V4.1-Flash [info]')
    // The contribution owns the whole label: the default badge is gone.
    expect(screen.queryByText('新')).toBeNull()
  })
})

describe('ModelSelect label slot', () => {
  it('distinguishes identical model names by provider across the trigger and the rows, and restores labels on unload', async () => {
    const runtime = await SlotTestRuntime.create()
    onTestFinished(() => runtime.dispose())
    const sessionId = brandString<SessionId>('model-label')
    await runtime.sessions.add({ id: sessionId })
    const session = runtime.sessions.retainFor(runtime.ctx, sessionId)
    const groups = ['trusted', 'external'].map(id => group(
      [{ id: 'same-model', name: 'Same model' }], id, `${id} gateway`,
    ))
    const directory = createSnapshotStore(state({ groups, current: { provider: 'trusted', model: 'same-model' } }))
    const select = vi.fn<(selection: ModelSelection) => Promise<SelectOutcome>>(async (selection) => {
      directory.update((snapshot) => { snapshot.current = selection })
      return { ok: true, value: undefined }
    })
    await runtime.root.declare({
      'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true },
      'conversation.input.model.options': { kind: 'list', scope: 'session' },
      'conversation.input.model.pane': { kind: 'keyed', scope: 'session' },
    }, ({ renderSlot, SessionProvider }) => <SessionProvider session={session}>
      <ModelSelect locked={false} available sessionId={sessionId} directory={directory}
        load={vi.fn<() => void>()} resolveText={resolveText} select={select} t={tzh} renderSlot={renderSlot}
        usePickerRequest={bindSnapshotSelector(createSnapshotStore<ModelPickerRequest | null>(null))}
        clearPickerRequest={vi.fn<(seq: number) => void>()} />
    </SessionProvider>)
    runtime.renderRoot()

    const trigger = screen.getByRole('button', { name: tzh('trigger.aria', { model: 'Same model' }) })
    expect(trigger.textContent).toBe('Same model')

    const plugin = await runtime.mount({ inject: ['slots'], apply(ctx) {
      ctx.slots.inject('conversation.input.model.label', () => ctx.slots.register({
        name: 'conversation.input.model.label',
      }, ({ provider, model, placement, selected }) => <span
        data-testid={`${placement}-${provider.id}`}
        data-selected={selected}
        title={provider.name}
      >{provider.id}: {model.name}</span>))
    } })
    // The trigger placement receives the same provider identity as the rows.
    expect(screen.getByTestId('trigger-trusted').textContent).toBe('trusted: Same model')
    expect(screen.getByTestId('trigger-trusted').title).toBe('trusted gateway')
    // The label content is rendered inside the anchored provider/model span.
    expect(trigger.querySelector('[data-provider-id="trusted"][data-model-id="same-model"]')).toBeTruthy()

    openPicker(trigger)
    expect(screen.getByTestId('option-trusted').textContent).toBe('trusted: Same model')
    expect(screen.getByTestId('option-trusted').getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId('option-external').getAttribute('data-selected')).toBe('false')

    await act(async () => { await plugin.dispose() })
    expect(runtime.slots.entries('conversation.input.model.label')).toHaveLength(0)
    expect(trigger.textContent).toBe('Same model')
    expect(trigger.querySelector('[data-provider-id="trusted"][data-model-id="same-model"]')).toBeTruthy()
  })

  it('does not decorate loading or missing selections with a stale provider', () => {
    const directory = createSnapshotStore(state({ current: null, routable: null, groups: [], status: 'loading' }))
    // The picker always renders its options slot; only the label seat is
    // conditional, so the record has to name the slot it saw.
    const slotsRendered: string[] = []
    const renderSlot: ComponentProps<typeof ModelSelect>['renderSlot'] = (name, _owner, options) => {
      slotsRendered.push(name)
      return options?.fallback ?? null
    }
    render(<ModelSelect locked={false} available sessionId={SESSION} directory={directory}
      load={vi.fn<() => void>()} resolveText={resolveText} select={vi.fn()} t={tzh} renderSlot={renderSlot}
      usePickerRequest={bindSnapshotSelector(createSnapshotStore<ModelPickerRequest | null>(null))}
      clearPickerRequest={vi.fn<(seq: number) => void>()} />)
    // No route yet: nothing decorates the seat with a provider or a label.
    expect(slotsRendered).not.toContain('conversation.input.model.label')
    expect(document.querySelector('[data-provider-id]')).toBeNull()

    act(() => { directory.set(state({ current: null, routable: false, groups: [] })) })
    expect(screen.getByRole('button', { name: tzh('trigger.selectAria') })).toBeTruthy()
    expect(slotsRendered).not.toContain('conversation.input.model.label')
  })
})
