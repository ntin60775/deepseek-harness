/** Checks CSS layout declarations that jsdom cannot measure. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(
  fileURLToPath(new URL('../src/client/QuestionComposer.module.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, ' ')

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function split(body: string | undefined): string[] {
  return (body ?? '').split(';').map(part => part.trim()).filter(Boolean)
}

function declarations(selector: string): string[] {
  const rule = new RegExp(`(?:^|\\})\\s*${escape(selector)}\\s*\\{([^{}]*)\\}`).exec(stylesheet)
  if (rule === null) throw new Error(`QuestionComposer.module.css has no \`${selector}\` rule`)
  return split(rule[1])
}

describe('QuestionComposer copy and scrollport layout', () => {
  it('keeps the question and choices in the card scrollport', () => {
    expect(declarations('.body')).toEqual(expect.arrayContaining([
      'min-height: 0',
      'overflow-y: auto',
    ]))
    expect(declarations('.questionTitle')).toContain('flex-shrink: 0')
  })

  it('draws long copy in full without a height budget or disclosure toggle', () => {
    // The card body owns the only scroll region; copy carries no clamp, fade, timeline, or expand control.
    const clamp = (selector: string): string[] => declarations(selector).filter(rule =>
      rule === 'overflow: hidden' || rule.startsWith('max-height')
      || rule.startsWith('scroll-timeline') || rule.startsWith('animation')
      || rule.startsWith('clip-path') || rule.startsWith('mask-'))
    expect(clamp('.titlePreview')).toEqual([])
    expect(clamp('.description')).toEqual([])
    expect(declarations('.questionTitle')).not.toContain('timeline-scope: --question-copy')
    expect(stylesheet).not.toMatch(/@keyframes (?:question|description)-clipped/)
    expect(stylesheet).not.toContain('copyToggle')
  })
})
