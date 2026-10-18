// @vitest-environment jsdom
/** Wiring spec: the skin stacks one alias-token layer over whatever theme is
 * active and mounts one plugin-owned stylesheet; both effects belong to the
 * plugin fiber, so disposal restores the shipped look. */
import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply, inject, LAYER } from '../src/client/index.ts'
import { GRUVBOX_TOKENS } from '../src/palette.ts'

// jsdom keeps one document across the file; each case starts from an empty head
// so a style tag another case mounted cannot be counted here.
beforeEach(() => { document.head.replaceChildren() })

/** Boot a context whose theme service records the layer it was handed. */
async function bench() {
  const ctx = new Context()
  const layerDispose = vi.fn()
  const overrideTokens = vi.fn((_source: string, _tokens: unknown) => layerDispose)
  ctx.provide('theme', { overrideTokens } as unknown as ThemeRuntime)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, overrideTokens, layerDispose }
}

/** Stylesheet tags this plugin owns right now. */
function ownTags(): HTMLStyleElement[] {
  return [...document.head.querySelectorAll('style')]
    .filter(tag => tag.dataset.plugin === LAYER)
}

describe('gruvbox skin apply', () => {
  it('stacks its token layer under one named source', async () => {
    const { fiber, overrideTokens } = await bench()
    expect(overrideTokens).toHaveBeenCalledTimes(1)
    expect(overrideTokens.mock.calls[0]![0]).toBe(LAYER)
    expect(overrideTokens.mock.calls[0]![1]).toBe(GRUVBOX_TOKENS)
    await fiber.dispose()
  })

  it('mounts one stylesheet and removes it with the fiber', async () => {
    const { fiber } = await bench()
    expect(ownTags()).toHaveLength(1)
    await fiber.dispose()
    expect(ownTags()).toHaveLength(0)
  })

  it('drops the token layer with the fiber', async () => {
    const { fiber, layerDispose } = await bench()
    await fiber.dispose()
    expect(layerDispose).toHaveBeenCalledTimes(1)
  })

  it('pairs every token with a value for both palettes', () => {
    const entries = Object.entries(GRUVBOX_TOKENS)
    expect(entries.length).toBeGreaterThan(80)
    for (const [name, modes] of entries) {
      expect(modes.light, name).toMatch(/\S/)
      expect(modes.dark, name).toMatch(/\S/)
    }
  })
})
