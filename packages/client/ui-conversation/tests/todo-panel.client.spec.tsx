// @vitest-environment jsdom
/**
 * Todo display acceptance: the TodoPanel plan strip (empty-hidden, status rows
 * including several `in_progress` at once, collapse), its TodoDock adapter
 * (selects the plan off the session snapshot and follows changes), and the
 * live behavior the owner Session's run state drives (auto-expansion, the
 * operator override, the done/total meter, and the scrolling cap).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate, sessionSnapshot as sessionFixture } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { InputState } from '../src/client/contract/input.ts'
import type { TodoDockProps } from '../src/client/skeleton/TodoPanel.tsx'
import { TodoDock, TodoPanel, todoDockEntry } from '../src/client/skeleton/TodoPanel.tsx'
import css from '../src/client/skeleton/TodoPanel.module.css'
import { NS, zh } from '../src/client/locales.ts'

const t: TodoDockProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

const LIST: TodoItem[] = [
  { content: '搭骨架', status: 'completed' },
  { content: '写组件', status: 'in_progress' },
  { content: '补测试', status: 'pending' },
]

/** A parallel plan: three tasks running at once (concurrent subagents). */
const PARALLEL: TodoItem[] = [
  { content: '搭骨架', status: 'completed' },
  { content: '写组件', status: 'in_progress' },
  { content: '跑后台构建', status: 'in_progress' },
  { content: '读源码', status: 'in_progress' },
  { content: '补测试', status: 'pending' },
]

const TODO_CSS = readFileSync(resolve(import.meta.dirname, '../src/client/skeleton/TodoPanel.module.css'), 'utf8')

describe('TodoPanel', () => {
  it('renders nothing while the list is empty', () => {
    const { container } = render(<TodoPanel todos={[]} running t={t} />)
    expect(container.innerHTML).toBe('')
  })

  it('starts collapsed with the per-status count summary visible', () => {
    render(<TodoPanel todos={LIST} running={false} t={t} />)
    expect(screen.getByTestId('todo-panel')).toBeTruthy()
    expect(screen.getByText('任务')).toBeTruthy()
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('omits the completed segment while nothing is done yet', () => {
    render(<TodoPanel todos={[
      { content: '写组件', status: 'in_progress' },
      { content: '补测试', status: 'pending' },
    ]} running={false} t={t} />)
    expect(screen.getByText('1 进行中 · 1 待处理')).toBeTruthy()
    expect(screen.queryByText(/已完成/)).toBeNull()
  })

  it('expands to show one row per item with its status glyph', () => {
    render(<TodoPanel todos={LIST} running={false} t={t} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    const items = screen.getAllByRole('listitem')
    expect(items.map(li => li.getAttribute('data-status'))).toEqual(['completed', 'in_progress', 'pending'])
    expect(screen.getByText('搭骨架')).toBeTruthy()
    expect(screen.getByText('写组件')).toBeTruthy()
    expect(items.map(li => li.querySelector('[data-state]')?.getAttribute('data-state')))
      .toEqual(['done', 'ongoing', 'idle'])
    expect(screen.getAllByRole('img').map(node => node.getAttribute('aria-label')))
      .toEqual(['已完成', '进行中', '待处理'])
  })

  it('collapse hides an expanded list; expand restores; header keeps the count summary', () => {
    render(<TodoPanel todos={LIST} running={false} t={t} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    const header = screen.getByRole('button', { expanded: true })
    fireEvent.click(header)
    expect(screen.queryByRole('list')).toBeNull()
    // Collapsed header is title + progress only (no in-progress content hint).
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
    expect(screen.queryByText('写组件')).toBeNull()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('marks every parallel active item, and counts them all in the header', () => {
    render(<TodoPanel todos={PARALLEL} running={false} t={t} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    // An unconditional in-progress cap would make this list unreachable: three
    // items carry the in-progress glyph at once, and the header counts all three.
    const statuses = screen.getAllByRole('listitem').map(li => li.getAttribute('data-status'))
    expect(statuses.filter(s => s === 'in_progress')).toHaveLength(3)
    expect(screen.getByText('跑后台构建')).toBeTruthy()
    expect(screen.getByText('读源码')).toBeTruthy()
    expect(screen.getByText('1 已完成 · 3 进行中 · 1 待处理')).toBeTruthy()
  })

  it('an all-completed list collapses the summary to the done count alone', () => {
    render(<TodoPanel todos={[{ content: '都完了', status: 'completed' }]} running={false} t={t} />)
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy()
    expect(screen.queryByText('都完了')).toBeNull()
    expect(screen.getByText('1 已完成')).toBeTruthy()
    expect(screen.queryByText(/进行中|待处理/)).toBeNull()
  })
})

/** The plan projection the dock selects off its owner Session. */
type TodoStore = ReturnType<typeof createSnapshotStore<{ value: readonly TodoItem[] | null | undefined }>>

/** Empty input machine: the dock adapter reads the owner session's run state and the plan projection only. */
const INPUT: InputState = {
  draft: '', attachmentIds: [], draftRev: 0, phase: 'plain', occurrences: [], queue: [],
}
const SID = 'todo-dock-session' as SessionId

/**
 * Dock props stub: the plan projection and the `InputZone` owner share are the
 * complete input; the remaining standard seats this adapter does not read stay
 * unmodelled. `running` arrives exactly as the Conversation body passes it.
 */
function dockProps(store: TodoStore, running: boolean): TodoDockProps {
  const useProjection = (_key: string, selector?: (v: unknown) => unknown) =>
    bindSnapshotSelector(store)(s => (selector ?? (v => v))(s.value))
  return {
    useProjection,
    session: { ...sessionFixture(SID), running },
    input: INPUT,
    t,
  } as unknown as TodoDockProps
}

function mountDock(initial: readonly TodoItem[] | null | undefined, running: boolean) {
  const store = createSnapshotStore<{ value: readonly TodoItem[] | null | undefined }>({ value: initial })
  const dock = (nextRunning: boolean) => <TodoDock {...dockProps(store, nextRunning)} />
  const view = render(dock(running))
  return { store, ...view, rerenderWith: (nextRunning: boolean) => { view.rerender(dock(nextRunning)) } }
}

describe('TodoDock', () => {
  it('reads the host-computed todos projection and follows pushed updates', () => {
    const store = createSnapshotStore<{ value: readonly TodoItem[] | null | undefined }>({ value: undefined })
    render(<TodoDock {...dockProps(store, false)} />)
    // Capability absent (no baseline/frame yet) renders nothing.
    expect(screen.queryByTestId('todo-panel')).toBeNull()
    act(() => { store.set({ value: LIST }) })
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
    // The pre-first-write whole value (null) retires the strip (the panel owns no data).
    act(() => { store.set({ value: null }) })
    expect(screen.queryByTestId('todo-panel')).toBeNull()
  })

  it('expands an already-present plan while the session runs, without a todo change event', () => {
    mountDock(LIST, true)
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('写组件')).toBeTruthy()
  })

  it('returns to the strip when the session goes idle', () => {
    const dock = mountDock(LIST, true)
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy()
    dock.rerenderWith(false)
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
  })

  it('holds an operator collapse through the running interval, then auto-expands again', () => {
    const dock = mountDock(LIST, true)
    fireEvent.click(screen.getByRole('button', { expanded: true }))
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
    // A live plan update does not reopen what the operator closed.
    act(() => {
      dock.store.set({ value: [...LIST, { content: '新任务', status: 'pending' }] })
    })
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
    // Idle keeps the strip; the next running interval resumes auto-expansion.
    dock.rerenderWith(false)
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy()
    dock.rerenderWith(true)
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('shows the done/total meter beside the counters, hidden from assistive technology', () => {
    mountDock(LIST, false)
    const meter = screen.getByTestId('todo-progress')
    expect(meter.getAttribute('aria-hidden')).toBe('true')
    const fill = meter.firstElementChild
    expect(fill).not.toBeNull()
    expect(Number.parseFloat((fill as HTMLElement).style.width)).toBeCloseTo(100 / 3, 5)
    // The meter repeats the numbers the existing localized counters carry.
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
  })

  it('keeps StateDot rows and the 180px scrolling cap in the expanded list', () => {
    mountDock(LIST, true)
    expect(screen.getAllByRole('listitem').map(li => li.querySelector('[data-state]')?.getAttribute('data-state')))
      .toEqual(['done', 'ongoing', 'idle'])
    const listClass = css.list
    if (listClass === undefined) throw new Error('list class missing from TodoPanel.module.css')
    expect(screen.getByRole('list').className).toContain(listClass)
    const listRule = /\.list\s*\{([^}]*)\}/.exec(TODO_CSS)?.[1] ?? ''
    expect(listRule).toMatch(/max-height:\s*180px;/)
    expect(listRule).toMatch(/overflow-y:\s*auto;/)
  })

  it('registers before the goal and queue entries', () => {
    expect(todoDockEntry.name).toBe('conversation-todo-dock')
    expect(todoDockEntry.inject).toEqual(['slots'])
    const register = vi.fn(() => () => undefined)
    const inject = vi.fn((_name: string, callback: () => () => void) => callback())
    todoDockEntry.apply({ slots: { inject, register } } as never)
    expect(inject).toHaveBeenCalledWith('conversation.input.dock', expect.any(Function))
    expect(register).toHaveBeenCalledWith({ name: 'conversation.input.dock', id: 'todo', order: 0, locale: NS }, TodoDock)
  })
})
