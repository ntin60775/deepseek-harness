/**
 * Browser half of the OMP gruvbox skin.
 *
 * The plugin contributes two effects and owns nothing else: an alias-token
 * override layer stacked over whichever built-in theme is active, and one
 * plugin-owned stylesheet for the surfaces the token layer cannot reach
 * (markdown accents, the table grid, tool frames, the composer status band).
 * Both effects belong to this plugin's fiber, so unloading the plugin — or
 * reloading it through HMR — restores the shipped look exactly.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ui-theme Context merge that publishes ctx.theme.
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { GRUVBOX_TOKENS } from '../palette.ts'
import gruvboxCss from '../styles/gruvbox.css?inline'

/** Layer identity registered with the theme registry; one layer per source. */
export const LAYER = '@deepseek-ai/dsh-client-ui-theme-gruvbox'

/** The theme registry is a hard dependency: a skin without tokens is a bug, not a no-op. */
export const inject = ['theme']

/**
 * Stack the gruvbox token layer and mount the skin's stylesheet.
 * @param ctx - Browser plugin context carrying the theme registry.
 */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.theme.overrideTokens(LAYER, GRUVBOX_TOKENS),
    'ui-theme-gruvbox: alias token layer',
  )
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = LAYER
    tag.textContent = gruvboxCss
    document.head.append(tag)
    return () => { tag.remove() }
  }, 'ui-theme-gruvbox: surface stylesheet')
}
