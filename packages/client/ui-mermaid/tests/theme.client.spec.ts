// @vitest-environment jsdom
/** Theme mapping: pure function, token names, render-time reads, hooks publication. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { MERMAID_FONT_SIZE, MERMAID_THEME_TOKENS, mapThemeVariables, readThemeVariables } from '../src/client/theme-variables.ts'
import { createMermaidThemeChannel } from '../src/client/theme-state.ts'
import { createMermaidRenderController } from '../src/client/render-controller.ts'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'

vi.mock('../src/client/mermaid-entry.ts', () => ({
  renderMermaid: vi.fn(async (id: string) => `<svg xmlns="http://www.w3.org/2000/svg" id="${id}"><text>ok</text></svg>`),
}))

/** Independent literal table: the resolved values the mapping must produce. */
const LITERALS: Record<string, string> = {
  '--dsw-alias-bg-layer-1': 'rgb(250, 250, 252)',
  '--dsw-alias-bg-layer-2': 'rgb(245, 246, 250)',
  '--dsw-alias-bg-layer-3': 'rgb(240, 241, 246)',
  '--dsw-alias-label-primary': 'rgb(20, 22, 30)',
  '--dsw-alias-label-tertiary': 'rgb(110, 116, 130)',
  '--dsw-alias-border-l2': 'rgba(0, 0, 0, 0.1)',
  '--dsw-alias-border-l3': 'rgba(0, 0, 0, 0.12)',
}

const themeSnapshot = (revision: number): ThemeSnapshot => ({ revision } as ThemeSnapshot)

describe('mermaid theme mapping', () => {
  it('maps every semantic token to its mermaid variable with fixed metrics', () => {
    const variables = mapThemeVariables(token => LITERALS[token] ?? '')
    expect(variables.primaryColor).toBe(LITERALS['--dsw-alias-bg-layer-2'])
    expect(variables.primaryTextColor).toBe(LITERALS['--dsw-alias-label-primary'])
    expect(variables.primaryBorderColor).toBe(LITERALS['--dsw-alias-border-l3'])
    expect(variables.lineColor).toBe(LITERALS['--dsw-alias-label-tertiary'])
    expect(variables.secondaryColor).toBe(LITERALS['--dsw-alias-bg-layer-3'])
    expect(variables.tertiaryColor).toBe(LITERALS['--dsw-alias-bg-layer-1'])
    expect(variables.background).toBe(LITERALS['--dsw-alias-bg-layer-1'])
    expect(variables.mainBkg).toBe(LITERALS['--dsw-alias-bg-layer-2'])
    expect(variables.nodeBorder).toBe(LITERALS['--dsw-alias-border-l3'])
    expect(variables.clusterBkg).toBe(LITERALS['--dsw-alias-bg-layer-2'])
    expect(variables.clusterBorder).toBe(LITERALS['--dsw-alias-border-l2'])
    expect(variables.titleColor).toBe(LITERALS['--dsw-alias-label-primary'])
    expect(variables.edgeLabelBackground).toBe(LITERALS['--dsw-alias-bg-layer-1'])
    expect(variables.textColor).toBe(LITERALS['--dsw-alias-label-primary'])
    expect(variables.fontSize).toBe(MERMAID_FONT_SIZE)
    expect(variables.fontSize).toBe('13px')
    expect(variables.fontFamily).toBe('inherit')
  })

  it('names only tokens the theme stylesheet defines', () => {
    const sheet = readFileSync(join(import.meta.dirname, '../../ui-theme/src/styles/design-platform.css'), 'utf8')
    for (const token of Object.values(MERMAID_THEME_TOKENS)) {
      expect(sheet).toContain(`${token}:`)
    }
  })

  it('reads literal alias values from a style fixture at render time', () => {
    const root = document.body
    for (const [token, value] of Object.entries(LITERALS)) root.style.setProperty(token, value)
    const variables = readThemeVariables(getComputedStyle(root))
    expect(variables.primaryColor).toBe(LITERALS['--dsw-alias-bg-layer-2'])
    expect(variables.lineColor).toBe(LITERALS['--dsw-alias-label-tertiary'])
    for (const token of Object.keys(LITERALS)) root.style.removeProperty(token)
  })
})

describe('mermaid theme channel', () => {
  it('starts from the initial theme snapshot and keeps source and snapshot identities', () => {
    const channel = createMermaidThemeChannel(themeSnapshot(7))
    const initial = channel.source.getSnapshot()
    expect(initial.revision).toBe(7)
    expect(initial.variables).toBeUndefined()
    expect(channel.source.getSnapshot()).toBe(initial)
    const listener = vi.fn()
    const unsubscribe = channel.source.subscribe(listener)
    channel.publishVariables(mapThemeVariables(token => LITERALS[token] ?? ''))
    expect(listener).toHaveBeenCalledTimes(1)
    const published = channel.source.getSnapshot()
    expect(published.revision).toBe(7)
    expect(published.variables?.primaryColor).toBe(LITERALS['--dsw-alias-bg-layer-2'])
    expect(channel.source.getSnapshot()).toBe(published)
    channel.change(themeSnapshot(8))
    expect(channel.source.getSnapshot().revision).toBe(8)
    expect(channel.source.getSnapshot().variables).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    channel.change(themeSnapshot(9))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('publishes resolved variables per render and re-resolves after a theme change', async () => {
    const root = document.body
    for (const [token, value] of Object.entries(LITERALS)) root.style.setProperty(token, value)
    const channel = createMermaidThemeChannel(themeSnapshot(1))
    const controller = createMermaidRenderController({
      resolveVariables: () => readThemeVariables(getComputedStyle(root)),
      publishVariables: (variables) => { channel.publishVariables(variables) },
    })
    const first = await controller.attempt('flowchart LR\n A-->B').promise
    expect(first.kind).toBe('rendered')
    expect(channel.source.getSnapshot().variables?.primaryColor).toBe(LITERALS['--dsw-alias-bg-layer-2'])
    const darker = { ...LITERALS, '--dsw-alias-bg-layer-2': 'rgb(30, 32, 40)' }
    for (const [token, value] of Object.entries(darker)) root.style.setProperty(token, value)
    channel.change(themeSnapshot(2))
    controller.themeChanged()
    const second = await controller.attempt('flowchart LR\n A-->B').promise
    expect(second.kind).toBe('rendered')
    expect(channel.source.getSnapshot().variables?.primaryColor).toBe('rgb(30, 32, 40)')
    for (const token of Object.keys(LITERALS)) root.style.removeProperty(token)
    controller.dispose()
  })
})
