/**
 * Browser half: register the `mermaid` layer of Chat's language-keyed fence
 * slot. The layer replaces the code block for settled fences with a sanitized
 * SVG card; streaming fences pass the inner code block through. The render
 * controller, the theme channel, and the measurement face are instances owned
 * by this apply, shared by every card through the registration's inject face.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import z from '@deepseek-ai/schemastery'
import type { FitConfig } from './fit.ts'
import { MermaidFenceLayer, type MermaidFenceInjected } from './MermaidFenceLayer.tsx'
import { createMermaidMeasureFace } from './measure.ts'
import { createMermaidRenderController } from './render-controller.ts'
import { createMermaidThemeChannel } from './theme-state.ts'
import { readThemeVariables } from './theme-variables.ts'
import { en, zh, ja, es, fr, de, ru, pt } from './locales.ts'

export type { MermaidFenceInjected, MermaidFenceLayerProps } from './MermaidFenceLayer.tsx'
export type { MermaidKey } from './locales.ts'

/** This package's copy namespace. */
const NS = 'mermaid'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Diagram card, source toggle, copy, viewer, and failure notice copy. */
    mermaid: import('./locales.ts').MermaidKey
  }
}

/** Services the fence layer reads: the slot registry, copy, and the theme runtime. */
export const inject = ['slots', 'locale', 'theme']

/** Fit-rule configuration of the diagram card. */
export type Config = FitConfig

/** Validated fit rule; misconfiguration fails loud at load. Default 0.85 (11px / 13px ≈ 0.846 rounded up). */
export const Config: z<{ minFitScale?: number }, Config> = z.object({
  minFitScale: z.transform(z.number().max(1), (value) => {
    // The transform resolver invokes the callback without options; the empty
    // options keep the ValidationError path prefix at the schema root.
    if (value <= 0) throw new z.ValidationError(`expected minFitScale > 0 but got ${value}`, {})
    return value
  }).default(0.85),
})

/**
 * Mount the mermaid fence layer with its owned render controller, theme
 * channel, and measurement face.
 * @param ctx - Client plugin context.
 * @param config - validated fit-rule configuration.
 */
export function apply(ctx: Context, config: Config = Config({})): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-mermaid: dictionaries')
  const theme = createMermaidThemeChannel(ctx.theme.getTheme())
  const controller = createMermaidRenderController({
    // The theme presenter writes the alias tokens onto body (light and dark sheets).
    resolveVariables: () => readThemeVariables(getComputedStyle(document.body)),
    publishVariables: (variables) => { theme.publishVariables(variables) },
  })
  ctx.on('theme/change', (snapshot) => {
    theme.change(snapshot)
    controller.themeChanged()
  })
  ctx.effect(() => () => { controller.dispose() }, 'ui-mermaid: render controller lifetime')
  const measure = createMermaidMeasureFace({ minFitScale: config.minFitScale })
  const injected: MermaidFenceInjected = {
    hooks: { mermaidTheme: theme.source },
    renderDiagram: code => controller.attempt(code),
    createDiagramRef: measure.createDiagramRef,
  }
  ctx.slots.inject('conversation.chat.markdown.fence', () => ctx.slots.register({
    name: 'conversation.chat.markdown.fence', key: 'mermaid', id: '@deepseek-ai/dsh-client-ui-mermaid/fence/mermaid',
    locale: NS, inject: () => injected,
  }, MermaidFenceLayer))
}
