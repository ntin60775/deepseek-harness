// @vitest-environment jsdom
/** Fence-level viewer replacement: live SVG at the published chat scale, no raster path. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { MermaidFenceLayer } from '../src/client/MermaidFenceLayer.tsx'
import { fenceFixture, measureWidth, t, wideSvg } from './harness.client.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const boxSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100"><text>node</text></svg>'

async function settledCard(svg: string, options: { createDiagramRef?: () => (element: HTMLDivElement | null) => void } = {}) {
  const fixture = fenceFixture()
  const props = options.createDiagramRef === undefined ? fixture.props : { ...fixture.props, createDiagramRef: options.createDiagramRef }
  const view = render(<MermaidFenceLayer {...props}><p>inner</p></MermaidFenceLayer>)
  fixture.attempts[0]!.settle({ kind: 'rendered', svg })
  await vi.waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
  return { ...view, fixture }
}

describe('fence viewer at the chat scale', () => {
  it('opens live vector SVG at natural scale from the header button', async () => {
    measureWidth(1200)
    await settledCard(wideSvg)
    fireEvent.click(screen.getByRole('button', { name: t('viewer.open') }))
    const dialog = await screen.findByRole('dialog', { name: t('viewer.dialog') })
    expect(dialog.querySelector('img')).toBeNull()
    const svg = dialog.querySelector('[role="img"] svg')!
    // Natural chat scale 1: viewer width equals the chat svg width attribute.
    expect(svg.getAttribute('width')).toBe('1432.15625')
    expect(svg.getAttribute('height')).toBe('63')
    // Zoom labels reach the catalog toolbar from the mermaid dictionaries.
    expect(screen.getByRole('toolbar', { name: t('zoomControls') })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('zoomIn') }))
    expect(screen.getByRole('button', { name: t('zoomMenu') }).textContent).toContain(t('zoomValue', { percent: 125 }))
    expect((dialog.querySelector('[role="img"] svg') as SVGSVGElement).getAttribute('width')).toBe('1790.1953125')
  })

  it('opens at the fitted chat scale, not above it, in a wide column', async () => {
    measureWidth(900)
    await settledCard(boxSvg)
    fireEvent.click(screen.getByRole('button', { name: t('viewer.open') }))
    const dialog = await screen.findByRole('dialog', { name: t('viewer.dialog') })
    const svg = dialog.querySelector('[role="img"] svg')!
    // Independent source: the injected column width; s0 = min(1, 900/1000).
    expect(svg.getAttribute('width')).toBe('900')
    expect(svg.getAttribute('height')).toBe('90')
  })

  it('opens with Enter on the focused wrapper at the published scale', async () => {
    measureWidth(850)
    await settledCard(boxSvg)
    fireEvent.keyDown(screen.getByRole('img'), { key: 'Enter' })
    const dialog = await screen.findByRole('dialog', { name: t('viewer.dialog') })
    expect(dialog.querySelector('[role="img"] svg')!.getAttribute('width')).toBe('850')
  })

  it('fails loud when the card never published a chat scale', async () => {
    measureWidth(900)
    await settledCard(boxSvg, { createDiagramRef: () => () => {} })
    // React rethrows handler errors asynchronously; the window error event carries them.
    const errors: string[] = []
    const onError = (event: ErrorEvent): void => { event.preventDefault(); errors.push(event.message) }
    window.addEventListener('error', onError)
    fireEvent.click(screen.getByRole('button', { name: t('viewer.open') }))
    await vi.waitFor(() => { expect(errors.join(' ')).toContain('data-fit-scale') })
    window.removeEventListener('error', onError)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the viewer when a theme revision starts a new attempt', async () => {
    measureWidth(1200)
    const { fixture } = await settledCard(wideSvg)
    fireEvent.click(screen.getByRole('button', { name: t('viewer.open') }))
    await screen.findByRole('dialog', { name: t('viewer.dialog') })
    fixture.channel.change({ revision: 2 } as ThemeSnapshot)
    await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    fixture.attempts[1]!.settle({ kind: 'rendered', svg: wideSvg })
    await vi.waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
    // Reopening starts at the chat scale again: zoom state did not survive.
    fireEvent.click(screen.getByRole('button', { name: t('viewer.open') }))
    const reopened = await screen.findByRole('dialog', { name: t('viewer.dialog') })
    expect(reopened.querySelector('[role="img"] svg')!.getAttribute('width')).toBe('1432.15625')
  })
})
