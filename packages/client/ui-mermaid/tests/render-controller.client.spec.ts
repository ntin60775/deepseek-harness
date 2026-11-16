/** Render controller lifecycle: generation tokens, cancellation, serialization, re-settle, import policy. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMermaidRenderController } from '../src/client/render-controller.ts'
import type { MermaidThemeVariables } from '../src/client/theme-variables.ts'

const { renderMermaid } = vi.hoisted(() => ({
  renderMermaid: vi.fn<(id: string, code: string, variables: MermaidThemeVariables) => Promise<string>>(),
}))
vi.mock('../src/client/mermaid-entry.ts', () => ({
  renderMermaid: (id: string, code: string, variables: MermaidThemeVariables) => renderMermaid(id, code, variables),
}))

const variables = { fontSize: '13px' } as MermaidThemeVariables
const options = { resolveVariables: () => variables, publishVariables: vi.fn() }

beforeEach(() => { renderMermaid.mockReset() })

/** A render call whose settlement the test controls. */
function deferred() {
  let resolve!: (svg: string) => void
  let reject!: (error: Error) => void
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('mermaid render controller', () => {
  it('discards a stale theme result by generation token', async () => {
    const controller = createMermaidRenderController(options)
    const slow = deferred()
    renderMermaid.mockReturnValueOnce(slow.promise)
    const old = controller.attempt('flowchart LR\n A-->B')
    await vi.waitFor(() => { expect(renderMermaid).toHaveBeenCalledTimes(1) })
    controller.themeChanged()
    renderMermaid.mockResolvedValueOnce('<svg><text>new</text></svg>')
    const fresh = controller.attempt('flowchart LR\n A-->B')
    slow.resolve('<svg><text>old</text></svg>')
    expect((await old.promise).kind).toBe('stale')
    const result = await fresh.promise
    expect(result.kind).toBe('rendered')
    if (result.kind === 'rendered') expect(result.svg).toContain('new')
    controller.dispose()
  })

  it('cancels an attempt on unmount and discards its in-flight result', async () => {
    const controller = createMermaidRenderController(options)
    const slow = deferred()
    renderMermaid.mockReturnValueOnce(slow.promise)
    const attempt = controller.attempt('flowchart LR\n A-->B')
    await vi.waitFor(() => { expect(renderMermaid).toHaveBeenCalledTimes(1) })
    attempt.cancel()
    slow.resolve('<svg><text>late</text></svg>')
    expect((await attempt.promise).kind).toBe('stale')
    controller.dispose()
  })

  it('serializes two cards through the owner instance', async () => {
    const controller = createMermaidRenderController(options)
    const order: string[] = []
    const first = deferred()
    const second = deferred()
    renderMermaid.mockImplementationOnce(async (id) => { order.push(`start:${id}`); const svg = await first.promise; order.push(`end:${id}`); return svg })
    renderMermaid.mockImplementationOnce(async (id) => { order.push(`start:${id}`); const svg = await second.promise; order.push(`end:${id}`); return svg })
    const a = controller.attempt('flowchart LR\n A-->B')
    const b = controller.attempt('sequenceDiagram\n A->>B: hi')
    await vi.waitFor(() => { expect(order).toHaveLength(1) })
    first.resolve('<svg><text>a</text></svg>')
    await vi.waitFor(() => { expect(order).toHaveLength(3) })
    second.resolve('<svg><text>b</text></svg>')
    expect((await a.promise).kind).toBe('rendered')
    expect((await b.promise).kind).toBe('rendered')
    expect(order[0]).toMatch(/^start:/u)
    expect(order[1]).toMatch(/^end:/u)
    expect(order[2]).toMatch(/^start:/u)
    expect(order[3]).toMatch(/^end:/u)
    expect(order[0]!.slice(6)).not.toBe(order[2]!.slice(6))
    controller.dispose()
  })

  it('starts a new attempt with a fresh render id on re-settle', async () => {
    const controller = createMermaidRenderController(options)
    renderMermaid.mockResolvedValue('<svg><text>ok</text></svg>')
    const first = await controller.attempt('flowchart LR\n A-->B').promise
    const second = await controller.attempt('flowchart LR\n A-->C').promise
    expect(first.kind).toBe('rendered')
    expect(second.kind).toBe('rendered')
    expect(renderMermaid).toHaveBeenCalledTimes(2)
    expect(renderMermaid.mock.calls[0]![0]).not.toBe(renderMermaid.mock.calls[1]![0])
    expect(renderMermaid.mock.calls[1]![1]).toBe('flowchart LR\n A-->C')
    controller.dispose()
  })

  it('reports a render failure without retrying inside the attempt', async () => {
    const controller = createMermaidRenderController(options)
    renderMermaid.mockRejectedValueOnce(new Error('Parse error on line 2'))
    const result = await controller.attempt('not a diagram').promise
    expect(result.kind).toBe('failed')
    expect(renderMermaid).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('settles pending attempts stale after dispose', async () => {
    const controller = createMermaidRenderController(options)
    const slow = deferred()
    renderMermaid.mockReturnValueOnce(slow.promise)
    const attempt = controller.attempt('flowchart LR\n A-->B')
    await vi.waitFor(() => { expect(renderMermaid).toHaveBeenCalledTimes(1) })
    controller.dispose()
    slow.resolve('<svg><text>late</text></svg>')
    expect((await attempt.promise).kind).toBe('stale')
  })

  it('discards a result whose theme changed while the render was running', async () => {
    const controller = createMermaidRenderController(options)
    const slow = deferred()
    renderMermaid.mockReturnValueOnce(slow.promise)
    const attempt = controller.attempt('flowchart LR\n A-->B')
    await vi.waitFor(() => { expect(renderMermaid).toHaveBeenCalledTimes(1) })
    controller.themeChanged()
    slow.reject(new Error('Parse error on line 2'))
    expect((await attempt.promise).kind).toBe('stale')
    controller.dispose()
  })
})

describe('mermaid chunk import policy', () => {
  it('discards an attempt cancelled while the chunk import is in flight', async () => {
    vi.resetModules()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let started!: () => void
    const importStarted = new Promise<void>((resolve) => { started = resolve })
    vi.doMock('../src/client/mermaid-entry.ts', async () => {
      started()
      await gate
      return { renderMermaid: vi.fn(async () => '<svg><text>ok</text></svg>') }
    })
    const { createMermaidRenderController: create } = await import('../src/client/render-controller.ts')
    const controller = create(options)
    const attempt = controller.attempt('flowchart LR\n A-->B')
    await importStarted
    attempt.cancel()
    release()
    expect((await attempt.promise).kind).toBe('stale')
    controller.dispose()
    vi.doUnmock('../src/client/mermaid-entry.ts')
    vi.resetModules()
  })
  it('fails the attempt on a rejected import and re-imports on the next attempt', async () => {
    vi.resetModules()
    let importCalls = 0
    vi.doMock('../src/client/mermaid-entry.ts', () => {
      importCalls += 1
      if (importCalls === 1) throw new Error('chunk load failed')
      return { renderMermaid: vi.fn(async () => '<svg><text>ok</text></svg>') }
    })
    const { createMermaidRenderController: create } = await import('../src/client/render-controller.ts')
    const controller = create(options)
    const failed = await controller.attempt('flowchart LR\n A-->B').promise
    expect(failed.kind).toBe('failed')
    expect(importCalls).toBe(1)
    const retried = await controller.attempt('flowchart LR\n A-->B').promise
    expect(retried.kind).toBe('rendered')
    expect(importCalls).toBe(2)
    controller.dispose()
    vi.doUnmock('../src/client/mermaid-entry.ts')
    vi.resetModules()
  })
})
