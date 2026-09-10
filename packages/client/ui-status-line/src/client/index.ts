/**
 * Browser half of the status band: locale dictionaries, the band's stylesheet,
 * and one contribution to the composer dock.
 *
 * The contribution goes through `slots.inject` so it follows the slot's
 * declaration rather than assuming load order, and everything it registers
 * belongs to this plugin's fiber.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: the ctx.locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the SlotRegistry Context merge and the conversation.composer.dock declaration.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { StatusLine } from './StatusLine.tsx'
import { en, NS, zh, type StatusLineKey } from './locales.ts'
import statusLineCss from '../styles/status-line.css?inline'

/** Slot this feature occupies inside the composer dock. */
export const SLOT = 'conversation.composer.dock'

/** Contribution id inside that slot. */
export const ID = 'status-line'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The status band's accessible names. */
    'status.line': StatusLineKey
  }
}

/** The slot registry and the locale dictionaries are hard dependencies. */
export const inject = ['slots', 'locale']

/**
 * Register the dictionaries, mount the stylesheet, and contribute the band.
 * @param ctx - Browser plugin context carrying the slot registry and locale.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-status-line: dictionaries')
  if (typeof document !== 'undefined') {
    ctx.effect(() => {
      const tag = document.createElement('style')
      tag.dataset.plugin = '@deepseek-ai/dsh-client-ui-status-line'
      tag.textContent = statusLineCss
      document.head.append(tag)
      return () => { tag.remove() }
    }, 'ui-status-line: stylesheet')
  }
  // Order -1 seats these segments before the shipped statistics pills, so one
  // band reads left to right: context and the token split, then the pills.
  ctx.slots.inject(SLOT, () => ctx.slots.register(
    { name: SLOT, id: ID, order: -1, locale: NS },
    StatusLine,
  ))
}
