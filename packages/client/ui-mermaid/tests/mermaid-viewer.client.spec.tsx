// @vitest-environment jsdom
/** Viewer unit: catalog zoom semantics, vector sizing, chrome contract, accessible name. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MermaidDiagramViewer } from '../src/client/MermaidDiagramViewer.tsx'
import { diagramSvg } from './harness.client.ts'

afterEach(cleanup)

const labels = { dialog: 'Diagram viewer', close: 'Close' }
const zoomLabels = {
  controls: 'Zoom controls',
  menu: 'Zoom level',
  out: 'Zoom out',
  into: 'Zoom in',
  value: (percent: number) => `${percent}%`,
}


function viewer(initialScale: number, onClose = vi.fn()) {
  const view = render(
    <MermaidDiagramViewer
      svg={diagramSvg}
      initialScale={initialScale}
      diagramLabel="Mermaid diagram"
      scrollLabel="Diagram scroll region"
      labels={labels}
      zoomLabels={zoomLabels}
      onClose={onClose}
    />,
  )
  const svg = screen.getByRole('dialog').querySelector('[role="img"] svg') as SVGSVGElement
  return { ...view, svg, onClose }
}

describe('MermaidDiagramViewer', () => {
  it('sizes the live svg at the initial chat scale without mermaid inline caps', () => {
    const { svg } = viewer(0.85)
    expect(svg.getAttribute('width')).toBe('298.76171875')
    expect(svg.getAttribute('height')).toBe('53.55')
    expect(svg.style.maxWidth).toBe('')
    expect(screen.getByRole('dialog').querySelector('img')).toBeNull()
  })

  it('steps zoom by the catalog additive step and clamps at the catalog bounds', () => {
    viewer(1)
    const width = (): string | null => (screen.getByRole('dialog').querySelector('[role="img"] svg') as SVGSVGElement).getAttribute('width')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    // The zoom re-injects the svg node; read the live one after each step.
    expect(width()).toBe('439.35546875')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(width()).toBe('351.484375')
    cleanup()
    viewer(4)
    expect(screen.getByRole('button', { name: 'Zoom in' }).hasAttribute('disabled')).toBe(true)
    cleanup()
    viewer(0.25)
    expect(screen.getByRole('button', { name: 'Zoom out' }).hasAttribute('disabled')).toBe(true)
  })

  it('names the dialog and the diagram wrapper and closes on Escape', () => {
    const onClose = vi.fn()
    viewer(1, onClose)
    expect(screen.getByRole('dialog', { name: 'Diagram viewer' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Mermaid diagram' })).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: 'Zoom controls' })).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
