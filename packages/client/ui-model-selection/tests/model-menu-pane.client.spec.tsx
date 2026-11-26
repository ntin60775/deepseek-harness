// @vitest-environment jsdom
/**
 * The composer picker hosts plugin-owned settings panes. An entry contributed
 * to `conversation.input.model.options` calls `openPane`, and the keyed
 * `conversation.input.model.pane` unfolds below that entry inside the same
 * card: the model list stays visible, the entry reports `aria-expanded`, and
 * clicking it again or pressing Escape folds the pane without closing the
 * picker. Folding returns focus to the entry, marked by `data-model-menu-pane`.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, onTestFinished, expect, it, vi, beforeEach } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentProps } from 'react'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import type { ModelMenuControls, ModelMenuOptions, ModelPickerRequest } from '../src/client/slots.ts'
import { ModelSelect } from '../src/client/ModelSelect.tsx'
import { en } from '../src/client/locales.ts'
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

const t = makeTranslate(en)
const SESSION = brandString<SessionId>('pane-seat')

/** The picker over one plain model, with the plugin option and pane stubs. */
function setup() {
  const directory = createSnapshotStore<ModelDirectoryState>({
    current: { provider: 'fixture', model: 'fixture' },
    routable: true,
    groups: [{ id: 'fixture', name: 'Fixture', models: [{ id: 'fixture', name: 'Fixture' }] }],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
  })
  const select = vi.fn<(selection: ModelSelection) => Promise<SelectOutcome>>(
    async () => ({ ok: true, value: undefined }),
  )
  const change = vi.fn()
  const renderSlot: SeatProps['renderSlot'] = (name, owner, options) => {
    if (name === 'conversation.input.model.options') {
      const controls = owner as object as ModelMenuOptions
      // The key matches the pane it opens: that is how focus returns.
      return <button type="button" data-model-menu-pane="fixture" disabled={controls.locked}
        aria-expanded={controls.openPaneKey === 'fixture'}
        onClick={() => { controls.openPane({ key: 'fixture', title: 'Fixture settings' }) }}>
        Fixture settings
      </button>
    }
    if (name === 'conversation.input.model.pane') {
      const controls = owner as object as ModelMenuControls
      return <>
        <button type="button" role="switch" aria-checked="false" disabled={controls.locked}
          autoFocus onClick={change}>
          Fixture setting
        </button>
        <p>Fixture explanation</p>
      </>
    }
    return options?.fallback ?? null
  }
  render(<ModelSelect locked={false} available sessionId={SESSION} directory={directory}
    load={vi.fn<() => void>()} resolveText={text => typeof text === 'string' ? text : text.en} select={select}
    t={t} renderSlot={renderSlot}
    usePickerRequest={bindSnapshotSelector(createSnapshotStore<ModelPickerRequest | null>(null))}
    clearPickerRequest={vi.fn<(seq: number) => void>()} />)
  const trigger = screen.getByRole('button', { name: t('trigger.aria', { model: 'Fixture' }) })
  fireEvent.click(trigger)
  expect(screen.getByRole('dialog', { name: t('menu.aria') })).toBeTruthy()
  return { trigger, change, select, directory }
}

it('unfolds the keyed pane below its entry, keeps the model list, and folds it on Escape', () => {
  const { trigger, select } = setup()
  const entry = screen.getByRole('button', { name: 'Fixture settings' })
  fireEvent.click(entry)
  // The pane opens inside the same card: the rows above never leave.
  expect(screen.getByText('Fixture explanation')).toBeTruthy()
  expect(screen.getAllByRole('option')).toHaveLength(1)
  expect(entry.getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(screen.getByRole('switch'))

  fireEvent.keyDown(screen.getByRole('switch'), { key: 'Escape' })
  // One Escape folds the pane; it does not dismiss the picker.
  expect(screen.queryByText('Fixture explanation')).toBeNull()
  expect(screen.getByRole('option')).toBeTruthy()
  expect(entry.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(entry)

  fireEvent.keyDown(screen.getByRole('option'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(select).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(trigger)
})

it('folds an open pane when its entry is clicked again', () => {
  setup()
  const entry = screen.getByRole('button', { name: 'Fixture settings' })
  fireEvent.click(entry)
  expect(screen.getByText('Fixture explanation')).toBeTruthy()
  fireEvent.click(entry)
  expect(screen.queryByText('Fixture explanation')).toBeNull()
  expect(entry.getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByRole('option')).toBeTruthy()
})

it('keeps the model-save lock on both the options entry and the pane controls', () => {
  const { directory } = setup()
  act(() => { directory.update((snapshot) => { snapshot.pending = { provider: 'fixture', model: 'fixture' } }) })
  expect(screen.getByRole('button', { name: 'Fixture settings' }).hasAttribute('disabled')).toBe(true)

  act(() => { directory.update((snapshot) => { snapshot.pending = null }) })
  fireEvent.click(screen.getByRole('button', { name: 'Fixture settings' }))
  act(() => { directory.update((snapshot) => { snapshot.pending = { provider: 'fixture', model: 'fixture' } }) })
  expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true)
})

it('renders the plugin options the picker declares to the renderer', () => {
  const dispatch: string[] = []
  const renderSlot: SeatProps['renderSlot'] = (name, _owner, options) => {
    dispatch.push(name)
    return options?.fallback ?? null
  }
  const directory = createSnapshotStore<ModelDirectoryState>({
    current: { provider: 'fixture', model: 'fixture' },
    routable: true,
    groups: [{ id: 'fixture', name: 'Fixture', models: [{ id: 'fixture', name: 'Fixture' }] }],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
  })
  render(<ModelSelect locked={false} available sessionId={SESSION} directory={directory}
    load={vi.fn<() => void>()} resolveText={text => typeof text === 'string' ? text : text.en}
    select={vi.fn()} t={t} renderSlot={renderSlot}
    usePickerRequest={bindSnapshotSelector(createSnapshotStore<ModelPickerRequest | null>(null))}
    clearPickerRequest={vi.fn<(seq: number) => void>()} />)
  fireEvent.click(screen.getByRole('button', { name: t('trigger.aria', { model: 'Fixture' }) }))
  // Declaring a child slot is claiming it: the open picker must dispatch it.
  expect(dispatch).toContain('conversation.input.model.options')
})
