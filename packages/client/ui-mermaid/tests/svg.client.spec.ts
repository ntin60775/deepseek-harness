// @vitest-environment jsdom
/** Lightbox data URL encoding and the inline accessibility projection. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareDiagramSvg, svgToDataUrl } from '../src/client/svg.ts'

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

describe('lightbox data URL', () => {
  it('serializes base64 of UTF-8 bytes with explicit viewBox dimensions', () => {
    const url = svgToDataUrl(wide.svg)
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true)
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(url.slice('data:image/svg+xml;base64,'.length)), char => char.charCodeAt(0)))
    expect(decoded).toContain('Запрос')
    // Mermaid wraps long labels into separate tspans.
    expect(decoded).toContain('Лог')
    expect(decoded).toContain('сессии')
    const root = new DOMParser().parseFromString(decoded, 'image/svg+xml').documentElement
    // Independent literals measured from the recorded fixture's viewBox.
    expect(root.getAttribute('width')).toBe('1432.15625')
    expect(root.getAttribute('height')).toBe('63')
    expect(root.getAttribute('viewBox')).toBe('0 0 1432.15625 63')
  })

  it('round-trips a Cyrillic label through the base64 encoding', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><text>Привет, диаграмма</text></svg>'
    const url = svgToDataUrl(svg)
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(url.slice('data:image/svg+xml;base64,'.length)), char => char.charCodeAt(0)))
    expect(decoded).toContain('Привет, диаграмма')
    const root = new DOMParser().parseFromString(decoded, 'image/svg+xml').documentElement
    expect(root.getAttribute('width')).toBe('120')
    expect(root.getAttribute('height')).toBe('40')
  })

  it('leaves dimensions unset without a usable viewBox', () => {
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg"><text>No box</text></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 nope 40"><text>Bad box</text></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 40"><text>Zero box</text></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="s" viewBox="0 0 10 10"/><text>Child box only</text></svg>',
    ]) {
      const url = svgToDataUrl(svg)
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(url.slice('data:image/svg+xml;base64,'.length)), char => char.charCodeAt(0)))
      const root = new DOMParser().parseFromString(decoded, 'image/svg+xml').documentElement
      expect(root.getAttribute('width')).toBeNull()
      expect(root.getAttribute('height')).toBeNull()
    }
  })
})
