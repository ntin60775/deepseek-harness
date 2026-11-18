// @vitest-environment jsdom
/** Viewer scale projection and the inline accessibility projection. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareDiagramSvg, prepareViewerSvg } from '../src/client/svg.ts'

interface Vector { name: string; source: string; svg: string }
const vectors = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/sanitize-vectors.json'), 'utf8')) as Vector[]
const wide = vectors.find(entry => entry.name === 'wide-cyrillic')!

describe('diagram SVG projection', () => {
  it('hides the inner svg from accessibility and drops the mermaid name reference', () => {
    const synthetic = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" aria-labelledby="t1" role="graphics-document"><title id="t1">accTitle</title><text>Label</text></svg>'
    const prepared = prepareDiagramSvg(synthetic)
    const root = new DOMParser().parseFromString(prepared, 'image/svg+xml').documentElement
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.getAttribute('aria-labelledby')).toBeNull()
    expect(root.textContent).toContain('Label')
  })
})

describe('viewer scale projection', () => {
  it('sizes the root at W·scale / H·scale and keeps the recorded labels', () => {
    const prepared = prepareViewerSvg(wide.svg, 1)
    const root = new DOMParser().parseFromString(prepared, 'image/svg+xml').documentElement
    expect(root.textContent).toContain('Запрос')
    // Mermaid wraps long labels into separate tspans.
    expect(root.textContent).toContain('Лог')
    expect(root.textContent).toContain('сессии')
    // Independent literals measured from the recorded fixture's viewBox.
    expect(root.getAttribute('width')).toBe('1432.15625')
    expect(root.getAttribute('height')).toBe('63')
    expect(root.getAttribute('viewBox')).toBe('0 0 1432.15625 63')
    expect(root.getAttribute('aria-hidden')).toBe('true')
    const doubled = new DOMParser().parseFromString(prepareViewerSvg(wide.svg, 2), 'image/svg+xml').documentElement
    expect(doubled.getAttribute('width')).toBe('2864.3125')
    expect(doubled.getAttribute('height')).toBe('126')
  })

  it('removes mermaid inline max-width and width so zoom above 1 grows the diagram', () => {
    const mermaidForm = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width: 1000px;" viewBox="0 0 1000 100"><text>node</text></svg>'
    const root = new DOMParser().parseFromString(prepareViewerSvg(mermaidForm, 1.5), 'image/svg+xml').documentElement
    expect(root.style.maxWidth).toBe('')
    expect(root.style.width).toBe('')
    expect(root.getAttribute('width')).toBe('1500')
    expect(root.getAttribute('height')).toBe('150')
  })

  it('round-trips a Cyrillic label through the projection', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><text>Привет, диаграмма</text></svg>'
    const root = new DOMParser().parseFromString(prepareViewerSvg(svg, 1), 'image/svg+xml').documentElement
    expect(root.textContent).toContain('Привет, диаграмма')
    expect(root.getAttribute('width')).toBe('120')
    expect(root.getAttribute('height')).toBe('40')
  })

  it('fails loud without a usable viewBox', () => {
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg"><text>No box</text></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 nope 40"><text>Bad box</text></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 40"><text>Zero box</text></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="s" viewBox="0 0 10 10"/><text>Child box only</text></svg>',
    ]) {
      expect(() => prepareViewerSvg(svg, 1)).toThrow('usable viewBox')
    }
  })
})
