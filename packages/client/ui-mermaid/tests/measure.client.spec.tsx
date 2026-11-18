// @vitest-environment jsdom
/** Measurement face: injected clientWidth, threshold in the RO callback, attribute-only mode switches. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MermaidFenceLayer } from '../src/client/MermaidFenceLayer.tsx'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { FakeResizeObserver, fenceFixture, measureWidth, t, wideSvg } from './harness.client.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  FakeResizeObserver.made.length = 0
})

/** Synthetic box with exact decimal fractions: W=1000 makes 850/1000 exactly the 0.85 double. */
const boxSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100"><text>node</text></svg>'
const smallBoxSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 100"><text>node</text></svg>'

/** Render one settled card and return its card node, diagram wrapper, and measure container. */
async function renderedCard(fixture: ReturnType<typeof fenceFixture>, svg: string) {
  const view = render(<MermaidFenceLayer {...fixture.props}><p>inner</p></MermaidFenceLayer>)
  fixture.attempts[0]!.settle({ kind: 'rendered', svg })
  await vi.waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
  const card = view.container.querySelector('[data-mermaid-card]') as HTMLElement
  const wrapper = screen.getByRole('img')
  const measure = wrapper.parentElement as HTMLElement
  return { view, card, wrapper, measure }
}

describe('mermaid measurement face', () => {
  it('injects the measure container clientWidth and publishes natural size from viewBox.baseVal', async () => {
    measureWidth(1200)
    const fixture = fenceFixture()
    const { card, wrapper, measure } = await renderedCard(fixture, wideSvg)
    // 1200 / 1432.15625 ≈ 0.838 < 0.85: natural size, explicit W×H from the recorded viewBox.
    expect(card.dataset.fitMode).toBe('natural')
    expect(card.dataset.fitScale).toBe('1')
    const svg = wrapper.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('1432.15625')
    expect(svg.getAttribute('height')).toBe('63')
    // The owner is the card node; the measured node is its inner non-scrolling
    // container, and the diagram wrapper scrolls inside it.
    expect(measure.closest('[data-mermaid-card]')).toBe(card)
    expect(FakeResizeObserver.made.at(-1)!.observe).not.toHaveBeenCalledWith(card)
    expect(FakeResizeObserver.made.at(-1)!.observe).not.toHaveBeenCalledWith(wrapper)
    expect(FakeResizeObserver.made.at(-1)!.observe).toHaveBeenCalledWith(measure)
    expect(fixture.attempts).toHaveLength(1)
  })

  it('holds natural size against mermaid-style inline max-width', async () => {
    measureWidth(840)
    const mermaidForm = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width: 1000px;" viewBox="0 0 1000 100"><text>node</text></svg>'
    const { card, wrapper } = await renderedCard(fenceFixture(), mermaidForm)
    expect(card.dataset.fitMode).toBe('natural')
    const svg = wrapper.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('1000')
    expect(svg.getAttribute('height')).toBe('100')
  })

  it('switches mode in the RO callback by attributes only, without a mermaid re-render', async () => {
    measureWidth(1200)
    const fixture = fenceFixture()
    const { card, wrapper } = await renderedCard(fixture, wideSvg)
    const svg = wrapper.querySelector('svg')!
    const observer = FakeResizeObserver.made.at(-1)!
    expect(card.dataset.fitMode).toBe('natural')
    // 1300 / 1432.15625 ≈ 0.908 ≥ 0.85: the same cached svg fits the column.
    measureWidth(1300)
    act(() => { observer.fire() })
    expect(card.dataset.fitMode).toBe('fit')
    expect(card.dataset.fitScale).toBe('0.9077221846429117')
    expect(svg.getAttribute('width')).toBe('100%')
    expect(svg.getAttribute('height')).toBeNull()
    expect(wrapper.querySelector('svg')).toBe(svg)
    measureWidth(1200)
    act(() => { observer.fire() })
    expect(card.dataset.fitMode).toBe('natural')
    expect(svg.getAttribute('width')).toBe('1432.15625')
    expect(svg.getAttribute('height')).toBe('63')
    expect(fixture.attempts).toHaveLength(1)
  })

  it('resolves equality with the floor to the fitted mode', async () => {
    measureWidth(850)
    const { card } = await renderedCard(fenceFixture(), boxSvg)
    expect(card.dataset.fitMode).toBe('fit')
    expect(card.dataset.fitScale).toBe('0.85')
  })

  it('coalesces repeated callbacks without debounce and without growing render attempts', async () => {
    measureWidth(840)
    const fixture = fenceFixture()
    const { card } = await renderedCard(fixture, boxSvg)
    const observer = FakeResizeObserver.made.at(-1)!
    // Each callback applies the threshold synchronously; a debounce would defer it.
    act(() => { observer.fire() })
    expect(card.dataset.fitMode).toBe('natural')
    measureWidth(860)
    act(() => { observer.fire(); observer.fire(); observer.fire() })
    expect(card.dataset.fitMode).toBe('fit')
    expect(fixture.attempts).toHaveLength(1)
  })

  it('reads the same mode-independent clientWidth source on both sides of the threshold', async () => {
    measureWidth(849)
    const fixture = fenceFixture()
    const { card, measure } = await renderedCard(fixture, boxSvg)
    const observer = FakeResizeObserver.made.at(-1)!
    expect(card.dataset.fitMode).toBe('natural')
    measureWidth(850)
    act(() => { observer.fire() })
    expect(card.dataset.fitMode).toBe('fit')
    measureWidth(851)
    act(() => { observer.fire() })
    expect(card.dataset.fitMode).toBe('fit')
    // One observation of the measure container serves both modes.
    expect(observer.observe).toHaveBeenCalledTimes(1)
    expect(observer.observe).toHaveBeenCalledWith(measure)
  })

  it('applies the configured floor instead of the default', async () => {
    measureWidth(600)
    const configured = await renderedCard(fenceFixture({ minFitScale: 0.5 }), boxSvg)
    expect(configured.card.dataset.fitMode).toBe('fit')
    cleanup()
    FakeResizeObserver.made.length = 0
    const standard = await renderedCard(fenceFixture(), boxSvg)
    expect(standard.card.dataset.fitMode).toBe('natural')
  })

  it('re-applies the rule to a new attempt svg on the remounted measure container', async () => {
    measureWidth(1200)
    const fixture = fenceFixture()
    const first = await renderedCard(fixture, wideSvg)
    expect(first.card.dataset.fitMode).toBe('natural')
    const firstObserver = FakeResizeObserver.made.at(-1)!
    fixture.channel.change({ revision: 2 } as ThemeSnapshot)
    await vi.waitFor(() => { expect(fixture.attempts).toHaveLength(2) })
    fixture.attempts[1]!.settle({ kind: 'rendered', svg: smallBoxSvg })
    await vi.waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
    const card = first.view.container.querySelector('[data-mermaid-card]') as HTMLElement
    // 1200 / 500 caps at 1: the new cached svg fits without any resize callback.
    expect(card.dataset.fitMode).toBe('fit')
    expect(firstObserver.disconnect).toHaveBeenCalled()
    expect(FakeResizeObserver.made.at(-1)).not.toBe(firstObserver)
    expect(fixture.attempts).toHaveLength(2)
  })

  it('keeps measurement attached across the source swap and publishes the cached scale', async () => {
    measureWidth(1200)
    const fixture = fenceFixture()
    const { card, measure } = await renderedCard(fixture, wideSvg)
    const observer = FakeResizeObserver.made.at(-1)!
    fireEvent.click(screen.getByRole('button', { name: t('source.toggle') }))
    // The container wraps both body modes: no detach, no second observation.
    expect(observer.disconnect).not.toHaveBeenCalled()
    expect(measure.querySelector('pre')).toBeTruthy()
    expect(card.dataset.fitScale).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: t('source.toggle') }))
    expect(FakeResizeObserver.made.at(-1)).toBe(observer)
    expect(card.dataset.fitMode).toBe('natural')
  })

  it('updates the published scale on resize while the source mode is shown', async () => {
    measureWidth(850)
    const fixture = fenceFixture()
    const { card } = await renderedCard(fixture, boxSvg)
    expect(card.dataset.fitScale).toBe('0.85')
    fireEvent.click(screen.getByRole('button', { name: t('source.toggle') }))
    measureWidth(900)
    act(() => { FakeResizeObserver.made.at(-1)!.fire() })
    expect(card.dataset.fitScale).toBe('0.9')
    fireEvent.click(screen.getByRole('button', { name: t('source.toggle') }))
    expect(card.dataset.fitScale).toBe('0.9')
  })

  it('publishes the cached scale after a source-mode remount on a theme revision', async () => {
    measureWidth(1200)
    const fixture = fenceFixture()
    const first = await renderedCard(fixture, wideSvg)
    fireEvent.click(screen.getByRole('button', { name: t('source.toggle') }))
    fixture.channel.change({ revision: 2 } as ThemeSnapshot)
    await vi.waitFor(() => { expect(fixture.attempts).toHaveLength(2) })
    fixture.attempts[1]!.settle({ kind: 'rendered', svg: wideSvg })
    await vi.waitFor(() => { expect(first.view.container.querySelector('pre')).toBeTruthy() })
    const card = first.view.container.querySelector('[data-mermaid-card]') as HTMLElement
    // Remounted in source mode: no svg in the container, scale served by the ref closure cache.
    expect(card.dataset.fitScale).toBe('1')
    expect(first.measure.querySelector('svg')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('source.toggle') }))
    expect(card.dataset.fitMode).toBe('natural')
  })

  it('reads the measure container width, not the card width', async () => {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return this.hasAttribute('data-mermaid-card') ? 1200 : 900
    })
    const { card, measure } = await renderedCard(fenceFixture(), boxSvg)
    expect(card.clientWidth).toBeGreaterThan(measure.clientWidth)
    expect(card.dataset.fitScale).toBe('0.9')
  })

  it('rewrites svg attributes on the source-to-diagram return', async () => {
    measureWidth(1200)
    const fixture = fenceFixture()
    const { card } = await renderedCard(fixture, wideSvg)
    fireEvent.click(screen.getByRole('button', { name: t('source.toggle') }))
    fireEvent.click(screen.getByRole('button', { name: t('source.toggle') }))
    await vi.waitFor(() => { expect(screen.getByRole('img').querySelector('svg')!.getAttribute('width')).toBe('1432.15625') })
    expect(card.dataset.fitMode).toBe('natural')
  })

  it('disconnects the observer on unmount', async () => {
    measureWidth(1200)
    const fixture = fenceFixture()
    const { view } = await renderedCard(fixture, wideSvg)
    const observer = FakeResizeObserver.made.at(-1)!
    view.unmount()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })
})
