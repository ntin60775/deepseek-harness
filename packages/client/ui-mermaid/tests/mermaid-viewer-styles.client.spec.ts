// @vitest-environment jsdom
/** Viewer CSS contract: scrolling viewport, safe centering, toolbar inset (jsdom applies no layout). */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(import.meta.dirname, '../src/client/MermaidDiagramViewer.module.css'), 'utf8')

describe('mermaid viewer stylesheet', () => {
  it('scrolls the viewport and centers smaller diagrams with auto margins', () => {
    const viewport = css.slice(css.indexOf('.viewport {'), css.indexOf('.inner {'))
    expect(viewport).toContain('overflow: auto;')
    expect(viewport).toContain('display: flex;')
    const inner = css.slice(css.indexOf('.inner {'), css.indexOf('.diagram svg {'))
    // Auto margins collapse to zero on overflowing sides, keeping the scroll start reachable.
    expect(inner).toContain('margin: auto;')
  })

  it('overrides only the toolbar inset, leaving centering to the catalog primitive', () => {
    const toolbar = css.slice(css.indexOf('.toolbar {'))
    expect(toolbar).toContain('bottom: 20px;')
    expect(toolbar).not.toContain('position:')
    expect(toolbar).not.toContain('transform:')
  })
})
