// @vitest-environment jsdom
/** Sanitize regression on the committed Chromium-recorded mermaid vectors. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sanitizeMermaidSvg } from '../src/client/sanitize.ts'

interface Vector { name: string; source: string; svg: string }
const vectors = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/sanitize-vectors.json'), 'utf8')) as Vector[]
const vector = (name: string): Vector => {
  const found = vectors.find(entry => entry.name === name)
  if (found === undefined) throw new Error(`missing fixture vector ${name}`)
  return found
}

/** Visible text of an SVG string: text nodes outside stylesheet elements. */
function visibleText(svg: string): string {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement.cloneNode(true) as Element
  for (const style of root.querySelectorAll('style')) style.remove()
  return (root.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Root attributes the sanitize configuration must preserve when present. */
const PRESERVED_ROOT_ATTRIBUTES = ['viewBox', 'role', 'aria-label', 'class', 'style']

describe('mermaid SVG sanitize on recorded vectors', () => {
  const production = vectors.filter(entry => entry.name !== 'empty-text' && entry.name !== 'flowchart-html-label-live')

  it.each(production.map(entry => [entry.name, entry] as const))('%s keeps visible text and root attributes', (_name, entry) => {
    const clean = sanitizeMermaidSvg(entry.svg)
    expect(clean).not.toMatch(/<foreignobject/iu)
    expect(clean).not.toMatch(/<script/iu)
    expect(clean).not.toMatch(/<use\b/iu)
    expect(clean).not.toMatch(/<(div|p|span|b|img|iframe)\b/iu)
    expect(visibleText(clean)).toBe(visibleText(entry.svg))
    expect(visibleText(clean)).not.toBe('')
    const before = new DOMParser().parseFromString(entry.svg, 'image/svg+xml').documentElement
    const after = new DOMParser().parseFromString(clean, 'image/svg+xml').documentElement
    for (const attribute of PRESERVED_ROOT_ATTRIBUTES) {
      const value = before.getAttribute(attribute)
      if (value !== null) expect(after.getAttribute(attribute)).toBe(value)
    }
    // marker-* attributes ride on descendant elements; every raw one survives.
    for (const match of entry.svg.matchAll(/(marker-[a-z]+)="([^"]*)"/gu)) {
      expect(clean).toContain(`${match[1]}="${match[2]}"`)
    }
  })

  it('cuts the live foreignObject HTML-label form down to the degradation path', () => {
    const live = vector('flowchart-html-label-live')
    expect(live.svg).toMatch(/<foreignObject/iu)
    expect(live.svg).toMatch(/<b>bold<\/b>/u)
    expect(() => sanitizeMermaidSvg(live.svg)).toThrow('no visible text')
  })

  it('cuts foreignObject even when visible SVG text survives beside it', () => {
    const mixed = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><text>Visible label</text><foreignObject width="50" height="20"><div xmlns="http://www.w3.org/1999/xhtml"><b>html</b></div></foreignObject></svg>'
    const clean = sanitizeMermaidSvg(mixed)
    expect(clean).not.toMatch(/<foreignobject/iu)
    expect(clean).not.toMatch(/<div\b/iu)
    expect(clean).toContain('Visible label')
  })

  it('degrades a render whose text is only whitespace', () => {
    expect(() => sanitizeMermaidSvg(vector('empty-text').svg)).toThrow('no visible text')
  })

  it('keeps the default profile: role survives, and use is always cut', () => {
    const role = vector('flowchart-html-label')
    const clean = sanitizeMermaidSvg(role.svg)
    expect(clean).toContain('role="graphics-document document"')
    const synthetic = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" role="graphics-document"><use href="#icon"/><text>Label</text></svg>'
    const cut = sanitizeMermaidSvg(synthetic)
    expect(cut).not.toMatch(/<use\b/iu)
    expect(cut).toContain('Label')
  })

  it('strips javascript hrefs and event handlers from click vectors', () => {
    for (const name of ['click-href-javascript', 'click-call']) {
      const clean = sanitizeMermaidSvg(vector(name).svg)
      expect(clean).not.toMatch(/javascript:/u)
      expect(clean).not.toMatch(/on(?:click|error|load)\s*=/iu)
    }
  })
})
