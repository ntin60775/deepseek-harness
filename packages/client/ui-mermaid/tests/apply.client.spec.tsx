// @vitest-environment jsdom
/** Apply wiring: exact fence registration, initial theme read, theme/change re-render channel, fit config. */
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, Config, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { MermaidFenceLayer, type MermaidFenceInjected, type MermaidFenceLayerProps } from '../src/client/MermaidFenceLayer.tsx'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { t } from './harness.client.ts'

vi.mock('../src/client/mermaid-entry.ts', () => ({
  renderMermaid: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100"><text>ok</text></svg>'),
}))

interface Registration {
  options: { name: string; key?: string; id: string; locale?: string; inject?: () => MermaidFenceInjected }
  component: unknown
}

function mount(initialRevision: number, config?: Config) {
  const ctx = new Context()
  const registrations: Registration[] = []
  const localeRegister = vi.fn<(ns: string, dicts: Record<string, Record<string, string>>) => () => void>(() => () => {})
  ctx.provide('slots', {
    inject: (_name: string, factory: () => () => void) => factory(),
    register: (options: Registration['options'], component: unknown) => {
      registrations.push({ options, component })
      return () => {}
    },
  })
  ctx.provide('locale', { register: localeRegister })
  ctx.provide('theme', { getTheme: () => ({ revision: initialRevision }) as ThemeSnapshot })
  apply(ctx, config)
  return { ctx, registrations, localeRegister }
}

describe('ui-mermaid apply', () => {
  it('declares the slot, locale, and theme service injections', () => {
    expect(inject).toEqual(['slots', 'locale', 'theme'])
  })

  it('mounts an empty Host companion', () => {
    expect(() => { hostApply() }).not.toThrow()
  })

  it('registers the exact mermaid fence layer with its locale namespace', () => {
    const { ctx, registrations, localeRegister } = mount(5)
    expect(localeRegister).toHaveBeenCalledTimes(1)
    const [namespace, dictionaries] = localeRegister.mock.calls[0]!
    expect(namespace).toBe('mermaid')
    expect(Object.keys(dictionaries).sort()).toEqual(['de', 'en', 'es', 'fr', 'ja', 'pt', 'ru', 'zh'])
    expect(registrations).toHaveLength(1)
    const { options } = registrations[0]!
    expect(options.name).toBe('conversation.chat.markdown.fence')
    expect(options.key).toBe('mermaid')
    expect(options.id).toBe('@deepseek-ai/dsh-client-ui-mermaid/fence/mermaid')
    expect(options.locale).toBe('mermaid')
    expect('children' in options).toBe(false)
    void ctx.fiber.dispose()
  })

  it('seeds the theme channel from ctx.theme.getTheme() and follows theme/change', () => {
    const { ctx, registrations } = mount(5)
    const injected = registrations[0]!.options.inject!()
    expect(injected.hooks.mermaidTheme.getSnapshot().revision).toBe(5)
    ctx.emit('theme/change', { revision: 6 } as ThemeSnapshot)
    expect(injected.hooks.mermaidTheme.getSnapshot().revision).toBe(6)
    void ctx.fiber.dispose()
  })

  it('hands out controller attempts and discards them after dispose', async () => {
    const { ctx, registrations } = mount(1)
    const injected = registrations[0]!.options.inject!()
    const attempt = injected.renderDiagram('flowchart LR\n A-->B')
    const result = await attempt.promise
    expect(result.kind).toBe('rendered')
    await ctx.fiber.dispose()
    const late = injected.renderDiagram('flowchart LR\n A-->B')
    expect((await late.promise).kind).toBe('stale')
  })

  it('wires the validated minFitScale into the injected measurement face', async () => {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(600)
    try {
      const renderWith = async (config?: Config): Promise<HTMLElement> => {
        const { ctx, registrations } = mount(1, config)
        const injected = registrations[0]!.options.inject!()
        expect(typeof injected.createDiagramRef).toBe('function')
        const props = {
          lang: 'mermaid', code: 'flowchart LR\n A-->B', streaming: false, t,
          useMermaidTheme: bindSnapshotSelector(injected.hooks.mermaidTheme),
          renderDiagram: injected.renderDiagram,
          createDiagramRef: injected.createDiagramRef,
        } as MermaidFenceLayerProps
        const view = render(<MermaidFenceLayer {...props}><p>inner</p></MermaidFenceLayer>)
        await vi.waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
        const card = view.container.querySelector('[data-mermaid-card]') as HTMLElement
        await ctx.fiber.dispose()
        cleanup()
        return card
      }
      // 600 / 1000 = 0.6: natural under the default floor, fitted under 0.5.
      expect((await renderWith()).dataset.fitMode).toBe('natural')
      expect((await renderWith(Config({ minFitScale: 0.5 }))).dataset.fitMode).toBe('fit')
    } finally {
      vi.restoreAllMocks()
      cleanup()
    }
  })
})
