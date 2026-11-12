/** Reply card and final-answer bar materials, asserted against the stylesheet text (jsdom has no layout). */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/chat/AssistantMarkdown.module.css', import.meta.url)),
  'utf8',
)

/**
 * Declarations of one exact selector rule.
 * @param selector - selector text as written in the stylesheet.
 * @returns trimmed `property: value` declarations of the first matching rule.
 */
function declarations(selector: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = new RegExp(`(?:^|[{}])\\s*${escaped}\\s*\\{([^{}]*)\\}`).exec(text)
  if (rule === null) throw new Error(`no \`${selector}\` rule`)
  return (rule[1] ?? '').split(';').map(part => part.trim()).filter(Boolean)
}

describe('reply card material', () => {
  it('uses the elevated independent-content-card family for every reply card', () => {
    expect(declarations('.card')).toEqual(expect.arrayContaining([
      'background: var(--dsw-specific-input-major)',
      'border-radius: var(--dsw-radius-xl)',
      'border: 0',
      'box-shadow: var(--dsw-elevation-panel)',
    ]))
  })

  it('marks the final answer with the business-blue left bar on a compensated text axis', () => {
    expect(declarations('.finalAnswer')).toEqual(expect.arrayContaining([
      'border-left: 3.5px solid var(--dsw-alias-state-business-primary)',
      'padding-left: 12.5px',
    ]))
  })
})
