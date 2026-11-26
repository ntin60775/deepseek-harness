// @vitest-environment jsdom
/**
 * The composer picker hosts plugin-owned settings panes. An entry contributed
 * to `conversation.input.model.options` calls `openPane`, the dialog body
 * becomes the keyed `conversation.input.model.pane`, and Escape backs out to
 * the model list before it closes the dialog. The pane returns focus to the
 * entry that opened it, marked by `data-model-menu-pane`.
 *
 * The specs below encode that contract as EXPECTED behaviour and are marked
 * Regression guard over the fix: ModelSelect renders
 * `conversation.input.model.options` (src/client/ModelSelect.tsx renders the
 * label and pane slots only), so `openPane` is unreachable and the pane body
 * never shows. Drop the `.fails` markers together with the fix.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
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

it('opens the keyed pane from an options entry and backs out to the model list on Escape', () => {
  const { trigger, select } = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Fixture settings' }))
  // The pane replaces the list instead of drilling into a second menu.
  expect(screen.getByText('Fixture explanation')).toBeTruthy()
  expect(screen.queryAllByRole('option')).toHaveLength(0)
  expect(document.activeElement).toBe(screen.getByRole('switch'))

  fireEvent.keyDown(screen.getByRole('switch'), { key: 'Escape' })
  // One Escape backs out to the list; it does not dismiss the picker.
  expect(screen.queryByText('Fixture explanation')).toBeNull()
  expect(screen.getByRole('option')).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fixture settings' }))

  fireEvent.keyDown(screen.getByRole('option'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(select).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(trigger)
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
