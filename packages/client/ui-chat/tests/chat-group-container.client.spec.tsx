// @vitest-environment jsdom
/**
 * The process-group container: one always-mounted presentational shell around the visible body,
 * with the group title as a plain row above it. Covers the material by mode and disclosure state,
 * the no-remount motion contract, and the header presence matrix.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useLayoutEffect, type ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { KeyedSnapshotSelectorHook, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  AssistantMessageNode, ChatFlowSlotProps, ChatNode, ChatSnapshot, TranscriptViewMode,
} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { GroupKey, GroupSnapshot, NodeKey } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { presentationPolicyFor, type ChatPresentationPolicy, type CollapseTiming } from '../src/client/presentation-policy.ts'
import type { ProcessGroupData } from '../src/client/contract/process-groups.ts'
import { ChatGroupSeat } from '../src/client/chat/ChatGroupSeat.tsx'
import { useSearchableHidden } from '../src/client/chat/searchable-hidden.ts'
import { useDisclosure } from '../src/client/chat/use-disclosure.ts'
import { en } from '../src/client/locale.ts'
import { createChatStore } from '../src/client/stores.ts'
import { chatSnapshotFixture } from './chat-snapshot-fixture.client.ts'

const GROUP_KEY = 'fixture:group' as GroupKey
const MEMBER_KEY = 'fixture:assistant:1' as NodeKey
const t = makeTranslate(en, commonEn)

function member(label: string): AssistantMessageNode {
  return {
    kind: 'assistant', seq: 1, time: 1_000, turn: 1, step: 1,
    blocks: [{ kind: 'reasoning', text: label }],
  }
}

function snapshot(closed: boolean): ChatSnapshot {
  return chatSnapshotFixture({
    nodes: [member('container member')],
    turnTimings: new Map([[1, { startTime: 0 }]]),
    turnEnds: closed ? new Map([[1, 2]]) : new Map(),
  })
}

function bindKeyedSnapshotSelector<Value>(
  resolve: (key: string) => ObservableSnapshot<Value>,
): KeyedSnapshotSelectorHook<Value> {
  const hooks = new WeakMap<object, SnapshotSelectorHook<Value>>()
  return ((key: string, selector?: (value: Value) => unknown, equal?: (left: unknown, right: unknown) => boolean) => {
    const source = resolve(key)
    let useValue = hooks.get(source)
    if (useValue === undefined) {
      useValue = bindSnapshotSelector(source)
      hooks.set(source, useValue)
    }
    return useValue(selector ?? ((value: Value) => value), equal)
  }) as KeyedSnapshotSelectorHook<Value>
}

const useGroupAction: ChatFlowSlotProps['useGroupAction'] = (hidden, reveal) => useSearchableHidden(hidden, reveal)

const useGroupHeaderAction: ChatFlowSlotProps['useGroupHeaderAction'] = (ref, hidden) => {
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    if (hidden) element.setAttribute('hidden', '')
    else element.removeAttribute('hidden')
  }, [ref, hidden])
}

/** Stateful member: expanding it proves that group disclosure never remounts its subtree. */
function Member({ label }: { readonly label: string }) {
  const { expanded, toggle } = useDisclosure()
  return <button type="button" aria-pressed={expanded} onClick={toggle}>{label}</button>
}

interface SeatOptions {
  readonly mode: TranscriptViewMode
  readonly timing?: CollapseTiming
  readonly closed: boolean
  readonly deferCollapse?: boolean
  readonly bottom?: boolean
}

function renderSeat({ mode, timing = 'completion', closed, deferCollapse = false, bottom = false }: SeatOptions) {
  const chatSource = snapshot(closed)
  const group: GroupSnapshot<ProcessGroupData> = {
    key: GROUP_KEY,
    data: {
      turn: 1,
      closed,
      summary: { counts: [], running: undefined, runningDetail: '' },
    },
    members: [{ kind: 'node', key: MEMBER_KEY }],
  }
  const groupStore = createSnapshotStore<GroupSnapshot<ProcessGroupData> | undefined>(group)
  const presentation = createSnapshotStore<ChatPresentationPolicy>(
    presentationPolicyFor(mode, timing),
  )
  const bottomStore = createSnapshotStore(bottom)
  const noProcess = createSnapshotStore<undefined>(undefined)
  const chat = createChatStore().create()
  const useChatGroup = bindKeyedSnapshotSelector(() => groupStore)
  const useChatNode = bindKeyedSnapshotSelector(key => chatSource.nodes.source(key))
  const useChatNodeBottom = bindKeyedSnapshotSelector(() => bottomStore)
  const useChatNodeProcess = bindKeyedSnapshotSelector(() => noProcess)
  const renderSlot: ChatFlowSlotProps['renderSlot'] = (_name, owner) => {
    if (!('node' in owner)) return null
    const routed = owner as { readonly node: ChatNode }
    return <Member label={routed.node.key} />
  }
  const props: ComponentProps<typeof ChatGroupSeat> = {
    groupKey: GROUP_KEY,
    useChatGroup,
    useGroupHeaderAction,
    nodeStore: chatSource.nodes,
    useChatNode,
    useChatNodeBottom,
    useChatNodeProcess,
    usePresentation: bindSnapshotSelector(presentation),
    cwd: '/work',
    openFile: () => {},
    inspectCall: () => {},
    forkAt: () => {},
    loadImage: async () => '',
    useStore: bindSnapshotSelector(chat),
    actions: chat.actions,
    renderSlot,
    t,
    useGroupAction,
    deferCollapse,
  }
  const view = render(<ChatGroupSeat {...props} />)
  const root = view.container.querySelector<HTMLElement>('[data-chat-group-key]')
  if (root === null) throw new Error('group root missing')
  const shell = root.querySelector<HTMLElement>('[data-process-container]')
  const header = root.querySelector<HTMLButtonElement>('[data-process-activity]')
  const body = root.querySelector<HTMLElement>('[data-step-process-body]')
  if (shell === null || body === null) throw new Error('group container or body missing')
  return { ...view, root, shell, header, body }
}

afterEach(cleanup)

describe('process-container material', () => {
  it('frames the body in Verbose, running Detailed, and a reader-opened group', () => {
    const verbose = renderSeat({ mode: 'verbose', closed: true })
    expect(verbose.shell.getAttribute('data-process-surface')).toBe('material')
    expect(verbose.body.hasAttribute('hidden')).toBe(false)
    expect(verbose.header?.closest('[hidden]')).not.toBeNull()

    const running = renderSeat({ mode: 'detailed', closed: false })
    expect(running.shell.getAttribute('data-process-surface')).toBe('material')
    expect(running.body.hasAttribute('hidden')).toBe(false)
    expect(running.header?.closest('[hidden]')).not.toBeNull()

    const grouped = renderSeat({ mode: 'standard', closed: true })
    expect(grouped.shell.getAttribute('data-process-surface')).toBe('plain')
    expect(grouped.body.hasAttribute('hidden')).toBe(true)
    fireEvent.click(grouped.header!)
    expect(grouped.shell.getAttribute('data-process-surface')).toBe('material')
    expect(grouped.body.hasAttribute('hidden')).toBe(false)
  })

  it('keeps the shell mounted and turns the surface off for a collapsed group', () => {
    for (const mode of ['compact', 'standard', 'detailed'] as const) {
      const view = renderSeat({ mode, closed: true })
      expect(view.shell.getAttribute('data-process-surface')).toBe('plain')
      expect(view.body.hasAttribute('hidden')).toBe(true)
      fireEvent.click(view.header!)
      fireEvent.click(view.header!)
      expect(view.root.querySelector('[data-process-container]')).toBe(view.shell)
      expect(view.shell.getAttribute('data-process-surface')).toBe('plain')
      cleanup()
    }
  })

  it('keeps the plain title outside the container and the container around the body', () => {
    const view = renderSeat({ mode: 'standard', closed: true })
    expect(view.header).not.toBeNull()
    expect(view.root.contains(view.shell)).toBe(true)
    expect(view.shell.contains(view.header)).toBe(false)
    expect(view.root.firstElementChild?.contains(view.header)).toBe(true)
    expect(view.shell.compareDocumentPosition(view.header!) & Node.DOCUMENT_POSITION_PRECEDING).not.toBe(0)
    expect(view.shell.contains(view.body)).toBe(true)
    const content = view.body.querySelector('[data-step-process-content]')
    expect(content).not.toBeNull()
    expect(content?.contains(view.shell)).toBe(false)
    expect(content?.contains(view.body)).toBe(false)
    expect(view.shell.getAttribute('role')).toBeNull()
    expect(view.shell.getAttribute('aria-label')).toBeNull()
  })
})

describe('process-container disclosure contract', () => {
  it('preserves member identity, disclosure state, and anchors across opening and closing', () => {
    const view = renderSeat({ mode: 'standard', closed: true })
    const memberButton = view.body.querySelector<HTMLButtonElement>('[data-chat-anchor-key] button')!
    fireEvent.click(memberButton)
    expect(memberButton.getAttribute('aria-pressed')).toBe('true')

    const memberKey = memberButton.closest<HTMLElement>('[data-chat-anchor-key]')!.dataset.chatAnchorKey
    const rootAnchor = view.root.dataset.chatAnchorKey
    const headerClass = view.header!.className

    fireEvent.click(view.header!)
    expect(view.body.hasAttribute('hidden')).toBe(false)
    expect(view.body.querySelector<HTMLButtonElement>('[data-chat-anchor-key] button')).toBe(memberButton)
    expect(memberButton.getAttribute('aria-pressed')).toBe('true')
    expect(memberButton.closest<HTMLElement>('[data-chat-anchor-key]')!.dataset.chatAnchorKey).toBe(memberKey)
    expect(view.root.dataset.chatAnchorKey).toBe(rootAnchor)

    fireEvent.click(view.header!)
    expect(view.body.hasAttribute('hidden')).toBe(true)
    expect(view.body.querySelector<HTMLButtonElement>('[data-chat-anchor-key] button')).toBe(memberButton)
    expect(memberButton.getAttribute('aria-pressed')).toBe('true')
    expect(view.header!.className).toBe(headerClass)
  })
})

describe('process-container header presence', () => {
  it.each([
    { name: 'Verbose', mode: 'verbose' as const, closed: true, deferred: false, titled: false, surface: 'material' },
    { name: 'Detailed running', mode: 'detailed' as const, closed: false, deferred: false, titled: false, surface: 'material' },
    { name: 'Detailed completed on next message', mode: 'detailed' as const, closed: true, deferred: true, titled: false, surface: 'material' },
    { name: 'Detailed historical', mode: 'detailed' as const, closed: true, deferred: false, titled: true, surface: 'plain' },
    { name: 'Compact historical', mode: 'compact' as const, closed: true, deferred: false, titled: true, surface: 'plain' },
    { name: 'Standard running', mode: 'standard' as const, closed: false, deferred: false, titled: true, surface: 'plain' },
  ])('renders $name with title=$titled and surface=$surface', ({ mode, closed, deferred, titled, surface }) => {
    const view = renderSeat({
      mode, closed, timing: 'next-input', deferCollapse: deferred, bottom: deferred,
    })
    expect(view.header?.closest('[hidden]') !== null).toBe(!titled)
    expect(view.shell.getAttribute('data-process-surface')).toBe(surface)
    expect(view.body.hasAttribute('hidden')).toBe(surface === 'plain')
  })
})
