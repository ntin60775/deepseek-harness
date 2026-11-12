/**
 * Process-container stylesheet contract. jsdom has no layout, so these read the declarations that
 * keep the grouped-content material on the shell while scrolling, insets, and edge fades stay on
 * the group body, and that leave the title row height independent of disclosure state.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cssText = readFileSync(
  fileURLToPath(new URL('../src/client/chat/ChatGroupSeat.module.css', import.meta.url)),
  'utf8',
)

/** One CSS rule body by exact selector. */
function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`missing rule ${selector}`)
  const end = source.indexOf('}', start)
  return source.slice(start + selector.length + 2, end)
}

describe('process-container material', () => {
  it('draws the grouped-content surface with theme tokens only', () => {
    const shell = ruleBody(cssText, '.shell')
    expect(shell).toMatch(/border-radius: var\(--dsw-radius-lg\);/)
    const material = ruleBody(cssText, '.material')
    expect(material).toMatch(/background: var\(--dsw-alias-markdown-code-block\);/)
    const stroke = ruleBody(cssText, '.shell::after')
    expect(stroke).toMatch(/border: 0\.5px solid var\(--dsw-alias-border-l1\);/)
    expect(stroke).toMatch(/border-radius: inherit;/)
  })

  it('keeps the shell free of scrolling, containment, transforms, and layout padding', () => {
    const shell = ruleBody(cssText, '.shell')
    expect(shell).not.toMatch(/overflow|contain|transform|max-height|padding/)
    expect(ruleBody(cssText, '.shell::after')).toMatch(/pointer-events: none;/)
  })

  it('leaves the sole scrollport, its inset, and its edge fades on the body', () => {
    const body = ruleBody(cssText, '.body')
    expect(body).toMatch(/max-height: min\(400px, 50vh\);/)
    expect(body).toMatch(/overflow-y: auto;/)
    expect(body).toMatch(/padding: 8px 12px;/)
    expect(ruleBody(cssText, '.fadeTop')).toMatch(/mask-image:/)
    expect(ruleBody(cssText, '.fadeBottom')).toMatch(/mask-image:/)
  })

  it('keeps the plain title row height independent of disclosure state', () => {
    const title = ruleBody(cssText, '.title')
    expect(title).toMatch(/line-height: calc\(24px \+ var\(--dsh-content-font-delta, 0px\)\);/)
    expect(title).not.toMatch(/padding-bottom/)
    // Disclosure changes the chevron and aria-expanded only; an expanded title must add no box.
    const expanded = [...cssText.matchAll(/\.title\[aria-expanded="true"\][^{]*\{([^}]*)\}/g)]
    expect(expanded.every(([, declarations = '']) => !/(?:^|;)\s*(?:padding|height|line-height|margin)[\w-]*\s*:/.test(declarations))).toBe(true)
  })
})
