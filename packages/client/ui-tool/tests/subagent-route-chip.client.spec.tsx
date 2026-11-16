// @vitest-environment jsdom
/** The spawn-card route chip: recorded selection, explicit-argument fallback, and hidden states. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState, SessionProjectionMap } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { useDisclosure } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/use-disclosure.ts'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import { en } from '@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { DetailsRow } from '../src/client/tool/toolviews/details-row.tsx'
import { ToolRow } from '../src/client/tool/components/ToolRow.tsx'
import { catalogChildId, explicitRoute, matchCatalogEntry, spawnCardRoute } from '../src/client/tool/models/subagent-route.ts'

const t = makeTranslate(en, commonEn)
afterEach(cleanup)

const PARENT = 'parent-1' as SessionId
const CHILD = 'child-1' as SessionId
type Selection = NonNullable<SessionProjectionMap['modelSelection']['next']>
const ROUTE: Selection = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
const EFFORT_ROUTE: Selection = { ...ROUTE, reasoningEffort: ReasoningEffortId('xhigh') }
const CHIP = '[data-size="compact"]'

type Catalog = SessionProjectionMap['subagentCatalog']

function summary(id: SessionId) {
  return { id, title: 't', displayTitle: 't', running: false, retainedBy: {}, blank: false, updatedAt: 0 }
}

function store(catalog: Catalog | undefined, selection: Selection | null) {
  return createSnapshotStore<SessionListState>({
    ids: [PARENT, CHILD],
    byId: {
      [PARENT]: summary(PARENT),
      [CHILD]: { ...summary(CHILD), projectionValues: { modelSelection: { lastUsed: selection, next: selection } } },
    },
    phase: 'ready',
    projectionsBySession: catalog === undefined ? {} : { [PARENT]: { values: { subagentCatalog: catalog }, state: 'ready', error: null } },
  })
}

function storeSplit(catalog: Catalog | undefined, lastUsed: Selection | null, next: Selection | null) {
  return createSnapshotStore<SessionListState>({
    ids: [PARENT, CHILD],
    byId: {
      [PARENT]: summary(PARENT),
      [CHILD]: { ...summary(CHILD), projectionValues: { modelSelection: { lastUsed, next } } },
    },
    phase: 'ready',
    projectionsBySession: catalog === undefined ? {} : { [PARENT]: { values: { subagentCatalog: catalog }, state: 'ready', error: null } },
  })
}

function namedCatalog(mode: 'continuable' | 'external'): Catalog {
  return [{ id: CHILD, mode, name: 'agent-1', label: 'research' } as Catalog[number]]
}

function spawnBlock(toolName: string, args: Record<string, unknown>, meta?: unknown): ToolResultNode {
  const argsRaw = JSON.stringify(args)
  return {
    kind: 'tool-result', seq: 1, time: 2, callTime: 1, callId: 'c1', name: toolName,
    args: PartialArguments.fromText(argsRaw), call: { name: toolName, argsRaw },
    content: [{ type: 'text', text: 'started subagent agent-1' }], isError: false, subCalls: [],
    ...(meta === undefined ? {} : { meta }),
  }
}

function mount(toolName: string, block: ToolResultNode, list: ReturnType<typeof store>) {
  const props = {
    useDisclosure, callId: 'c1', toolName, phase: 'result', block, openFile: vi.fn(), loadImage: vi.fn(),
    sessionId: PARENT, useSessions: bindSnapshotSelector(list), t,
  } as Parameters<typeof DetailsRow>[0]
  return render(<DetailsRow {...props} />)
}

const ACTIVATION = { kind: 'activation', name: 'agent-1' }

describe('spawn-card route chip', () => {
  it('chips the named child’s recorded route between title and summary without a name-tag', () => {
    const view = mount('subagent', spawnBlock('subagent', { description: 'Research', prompt: 'p' }, ACTIVATION), store(namedCatalog('continuable'), ROUTE))
    const chip = view.container.querySelector(CHIP)!
    expect(chip.textContent).toBe('deepseek-official/deepseek-v4-flashDefault')
    expect(view.getByRole('button', { expanded: false })).toBeTruthy()
    expect(view.queryByText('agent-1')).toBeNull()
    const title = view.getByText('Create subagent')
    const summaryText = view.getByText('Research')
    expect(title.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(chip.compareDocumentPosition(summaryText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows a recorded effort verbatim and the localized default when absent', () => {
    const withEffort = mount('subagent', spawnBlock('subagent', { prompt: 'p' }, ACTIVATION), store(namedCatalog('continuable'), EFFORT_ROUTE))
    expect(withEffort.container.querySelector(CHIP)!.textContent).toContain('xhigh')
    withEffort.unmount()
    const noEffort = mount('subagent', spawnBlock('subagent', { prompt: 'p' }, ACTIVATION), store(namedCatalog('continuable'), ROUTE))
    expect(noEffort.container.querySelector(CHIP)!.textContent).toContain('Default')
  })

  it('falls back to explicit arguments for a named child before its first request', () => {
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p', provider: 'p', model: 'm', reasoning_effort: 'high' }, ACTIVATION), store(namedCatalog('continuable'), null))
    expect(view.container.querySelector(CHIP)!.textContent).toBe('p/mhigh')
  })

  it('localizes the default effort for an argued route without one', () => {
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p', provider: 'p', model: 'm' }, ACTIVATION), store(namedCatalog('continuable'), null))
    expect(view.container.querySelector(CHIP)!.textContent).toBe('p/mDefault')
  })

  it('hides the chip while streaming arguments lack a model', () => {
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p', provider: 'p' }, ACTIVATION), store(namedCatalog('continuable'), null))
    expect(view.container.querySelector(CHIP)).toBeNull()
  })

  it('hides the chip for an unnamed historical call without route arguments', () => {
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p' }), store(undefined, null))
    expect(view.container.querySelector(CHIP)).toBeNull()
  })

  it('hides the chip for an unnamed row even with full route arguments', () => {
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p', provider: 'p', model: 'm' }), store(undefined, null))
    expect(view.container.querySelector(CHIP)).toBeNull()
  })

  it('hides the chip for an external execution even with route arguments', () => {
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p', provider: 'p', model: 'm' }, ACTIVATION), store(namedCatalog('external'), ROUTE))
    expect(view.container.querySelector(CHIP)).toBeNull()
  })

  it('ignores result metadata that is not an activation receipt', () => {
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p' }, { kind: 'other', name: 'agent-1' }), store(namedCatalog('continuable'), ROUTE))
    expect(view.container.querySelector(CHIP)).toBeNull()
  })

  it('chips a fork’s inherited route from creation', () => {
    const view = mount('subagent_fork', spawnBlock('subagent_fork', { prompt: 'p' }, ACTIVATION), store(namedCatalog('continuable'), ROUTE))
    expect(view.container.querySelector(CHIP)!.textContent).toContain('deepseek-official/deepseek-v4-flash')
  })

  it('prefers the recorded selection over conflicting explicit arguments', () => {
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p', provider: 'other', model: 'other' }, ACTIVATION), store(namedCatalog('continuable'), ROUTE))
    expect(view.container.querySelector(CHIP)!.textContent).toContain('deepseek-official/deepseek-v4-flash')
  })

  it('reads the child name from arguments when result metadata lacks one', () => {
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p', name: 'agent-1' }), store(namedCatalog('continuable'), ROUTE))
    expect(view.container.querySelector(CHIP)!.textContent).toContain('deepseek-official/deepseek-v4-flash')
  })

  it('chips the pending next selection over a differing lastUsed', () => {
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p' }, ACTIVATION), storeSplit(namedCatalog('continuable'), ROUTE, EFFORT_ROUTE))
    expect(view.container.querySelector(CHIP)!.textContent).toContain('xhigh')
  })

  it('hides the chip when next is null even if lastUsed is recorded', () => {
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p' }, ACTIVATION), storeSplit(namedCatalog('continuable'), ROUTE, null))
    expect(view.container.querySelector(CHIP)).toBeNull()
  })

  it('hides the chip for a catalog row recorded without a name', () => {
    const unnamed = [{ id: CHILD, mode: 'one-shot', label: 'research' } as Catalog[number]]
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p' }, ACTIVATION), storeSplit(unnamed, ROUTE, ROUTE))
    expect(view.container.querySelector(CHIP)).toBeNull()
  })

  it('a chip tap pins the tooltip without toggling the row', () => {
    enableTooltips()
    vi.useFakeTimers()
    const view = mount('subagent', spawnBlock('subagent', { prompt: 'p' }, ACTIVATION), store(namedCatalog('continuable'), ROUTE))
    const row = view.getByRole('button', { expanded: false })
    const anchor = view.container.querySelector(CHIP)!.parentElement!
    fireEvent.pointerDown(anchor, { pointerType: 'touch' })
    fireEvent.click(anchor)
    const bubble = view.getByRole('tooltip')
    expect(bubble.textContent).toBe('Model route: deepseek-official/deepseek-v4-flash')
    expect(anchor.getAttribute('aria-describedby')).toBe(bubble.id)
    expect(view.getByRole('button', { expanded: false })).toBe(row)
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})

/** jsdom lacks the observers the Tooltip measures with; mirror the catalog spec. */
function enableTooltips(): void {
  class TooltipObserver implements ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      const size = { inlineSize: 160, blockSize: 30 }
      this.callback([{
        target, borderBoxSize: [size], contentBoxSize: [size], devicePixelContentBoxSize: [size], contentRect: new DOMRect(),
      }], this)
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', TooltipObserver)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
}

describe('subagent-route resolution helpers', () => {
  it('matches a catalog row by name and rejects unnamed or absent names', () => {
    const catalog = namedCatalog('continuable')
    expect(matchCatalogEntry(catalog, 'agent-1')?.id).toBe(CHILD)
    expect(matchCatalogEntry(catalog, 'other')).toBeUndefined()
    expect(matchCatalogEntry(catalog, undefined)).toBeUndefined()
    expect(matchCatalogEntry(catalog, '')).toBeUndefined()
    expect(matchCatalogEntry(undefined, 'agent-1')).toBeUndefined()
  })

  it('addresses only local children', () => {
    expect(catalogChildId(namedCatalog('continuable')[0])).toBe(CHILD)
    expect(catalogChildId(namedCatalog('external')[0])).toBeUndefined()
    expect(catalogChildId(undefined)).toBeUndefined()
  })

  it('admits an explicit route only with both provider and model', () => {
    expect(explicitRoute({ provider: 'p', model: 'm', reasoning_effort: 'high' })).toEqual({ provider: 'p', model: 'm', reasoningEffort: 'high' })
    expect(explicitRoute({ provider: 'p', model: 'm' })).toEqual({ provider: 'p', model: 'm' })
    expect(explicitRoute({ provider: 'p', model: 'm', reasoning_effort: '' })).toEqual({ provider: 'p', model: 'm' })
    expect(explicitRoute({ provider: 'p' })).toBeUndefined()
    expect(explicitRoute({ model: 'm' })).toBeUndefined()
    expect(explicitRoute({ provider: '', model: 'm' })).toBeUndefined()
    expect(explicitRoute({})).toBeUndefined()
  })

  it('requires a matched local row, then prefers selection over arguments', () => {
    const args = { provider: 'p', model: 'm' }
    expect(spawnCardRoute(undefined, ROUTE, args)).toBeUndefined()
    expect(spawnCardRoute(undefined, undefined, args)).toBeUndefined()
    expect(spawnCardRoute(namedCatalog('external')[0], ROUTE, args)).toBeUndefined()
    expect(spawnCardRoute(namedCatalog('continuable')[0], ROUTE, args)).toBe(ROUTE)
    expect(spawnCardRoute(namedCatalog('continuable')[0], undefined, args)).toEqual({ provider: 'p', model: 'm' })
    expect(spawnCardRoute(namedCatalog('continuable')[0], undefined, {})).toBeUndefined()
  })
})

describe('ToolRow header chip placement', () => {
  const base = { useDisclosure, t, variant: 'others' as const, icon: <i />, title: 'Title', state: 'ok' as const }
  it('renders a chip even when the summary is empty, without a separator', () => {
    const view = render(<ToolRow {...base} summary="" headerChip={<span data-size="compact">chip</span>} />)
    expect(view.getByText('chip')).toBeTruthy()
    expect(view.container.querySelector('[class*="sep"]')).toBeNull()
  })
  it('keeps the separator and summary beside a chip', () => {
    const view = render(<ToolRow {...base} summary="body" headerChip={<span data-size="compact">chip</span>} />)
    expect(view.getByText('chip')).toBeTruthy()
    expect(view.getByText('body')).toBeTruthy()
    expect(view.container.querySelector('[class*="sep"]')).not.toBeNull()
  })
  it('an empty summary without a chip still drops the separator', () => {
    const view = render(<ToolRow {...base} summary="" />)
    expect(view.container.querySelector('[class*="sep"]')).toBeNull()
  })
})
