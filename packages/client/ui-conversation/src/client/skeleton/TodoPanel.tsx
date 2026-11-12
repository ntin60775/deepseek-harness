import { useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// The domain's client-namespace pure-type outlet: one import edge delivers
// the `todos` projection-key merge (single source, no consumer-side restated
// declare) and the payload type. Type-only by construction — the outlet is
// free of host value imports, so no host Context merge enters this program.
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/client'
import {
  IconChecklistOutlineRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, StateDot,
  type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from '../locales.ts'
import css from './TodoPanel.module.css'

export interface TodoPanelProps {
  /** The session's current plan (empty renders nothing) — selected by the dock adapter. */
  todos: readonly TodoItem[]
  /** The owning Session's run state: the plan expands by itself while it is true. */
  running: boolean
  /** The dock entry's locale seat, passed down as a plain prop. */
  t: TodoDockProps['t']
}

/** Local exhaustiveness helper — client packages do not depend on `dsh-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if status is forged */
function assertNever(value: never): never {
  throw new Error(`unreachable todo status: ${String(value)}`)
}

/** Map Todo lifecycle state onto the shared compact status language. */
function statusDotState(status: TodoItem['status']): StateDotState {
  switch (status) {
    case 'completed': return 'done'
    case 'in_progress': return 'ongoing'
    case 'pending': return 'idle'
    /* v8 ignore next -- closed TodoItem status union */
    default: return assertNever(status)
  }
}

/** Return the localized status announced beside one decorative marker. */
function statusLabel(status: TodoItem['status'], t: TodoPanelProps['t']): string {
  switch (status) {
    case 'completed': return t('todo.status.completed')
    case 'in_progress': return t('todo.status.inProgress')
    case 'pending': return t('todo.status.pending')
    /* v8 ignore next -- closed TodoItem status union */
    default: return assertNever(status)
  }
}

/** Header summary: "·"-joined per-status counts; zero-count segments are omitted as noise (a non-empty list keeps at least one). */
function progressLabel(todos: readonly TodoItem[], done: number, t: TodoPanelProps['t']): string {
  const active = todos.filter(item => item.status === 'in_progress').length
  const pending = todos.length - done - active
  // En spaces (U+2002): HTML collapses runs of ASCII spaces, so widening the
  // separator breathing room needs a literal wide space.
  return [
    ...done > 0 ? [t('todo.progress.done', { done })] : [],
    ...active > 0 ? [t('todo.progress.active', { active })] : [],
    ...pending > 0 ? [t('todo.progress.pending', { pending })] : [],
  ].join('\u2002·\u2002')
}

/**
 * Render the plan strip above the composer.
 * The list expands by itself while the Session runs and returns to the strip when it goes idle.
 * A manual toggle overrides auto-expansion until the next running interval starts.
 * @param props - the projected plan, the owning Session's run state, and the locale seat.
 * @returns the plan strip, or nothing while the plan is empty.
 */
export function TodoPanel({ todos, running, t }: TodoPanelProps) {
  // `undefined` follows the Session: expanded while running, strip at idle.
  // An explicit value is the operator's choice for one running interval; the
  // render-phase reset (React's derived-state pattern) rebases it on every
  // run-state change so it cannot leak into the next interval, with no effect.
  const [collapsedByOperator, setCollapsedByOperator] = useState<boolean | undefined>(undefined)
  const [lastRunning, setLastRunning] = useState(running)
  if (lastRunning !== running) {
    setLastRunning(running)
    setCollapsedByOperator(undefined)
  }
  const collapsed = collapsedByOperator ?? !running
  if (todos.length === 0) return null

  const done = todos.filter(item => item.status === 'completed').length
  const meterFillWidth = `${String((done / todos.length) * 100)}%`

  return (
    <section className={css.root} data-testid="todo-panel" aria-label={t('todo.title')}>
      <div className={css.body}>
        <button
          type="button"
          className={css.header}
          aria-expanded={!collapsed}
          onClick={() => { setCollapsedByOperator(!collapsed) }}
        >
          <span className={css.lead} aria-hidden><IconChecklistOutlineRegular /></span>
          <span className={css.title}>{t('todo.title')}</span>
          <span className={css.progress}>{progressLabel(todos, done, t)}</span>
          <span className={css.meter} data-testid="todo-progress" aria-hidden>
            <span className={css.meterFill} style={{ width: meterFillWidth }} />
          </span>
          <span className={css.chevron} aria-hidden>
            {collapsed ? <IconChevronUpOutlineRegular /> : <IconChevronDownOutlineRegular />}
          </span>
        </button>
        {!collapsed && (
          <ul className={css.list}>
            {todos.map(item => (
              <li key={item.content} className={css.item} data-status={item.status}>
                <span className={css.glyph} role="img" aria-label={statusLabel(item.status, t)}>
                  <StateDot state={statusDotState(item.status)} />
                </span>
                <span className={css.content}>{item.content}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Props for the projected todo dock. */
export type TodoDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'conversation'>

/** Renders the current todo projection, or nothing when it is absent; the plan expands while the Session runs. */
export function TodoDock({ useProjection, session, t }: TodoDockProps) {
  const todos = useProjection('todos')
  return <TodoPanel todos={todos ?? []} running={session.running} t={t} />
}

/** Registers the projected todo dock. */
export const todoDockEntry = {
  name: 'conversation-todo-dock',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('conversation.input.dock', () =>
      ctx.slots.register({ name: 'conversation.input.dock', id: 'todo', order: 0, locale: NS }, TodoDock))
  },
}
