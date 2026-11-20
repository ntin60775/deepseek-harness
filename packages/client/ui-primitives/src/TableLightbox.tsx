/** Fullscreen table preview: the rendered table on its own surface inside the shared lightbox chrome. */
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { LightboxShell, type LightboxShellLabels } from './LightboxShell.tsx'
import markdownCss from './markdown/MarkdownText.module.css'
import css from './TableLightbox.module.css'

/** Lightbox strings the owner resolves from its own locale namespace. */
export type TableLightboxLabels = LightboxShellLabels

/**
 * Present a wide table at the full viewport width inside the shared lightbox
 * chrome: a scrolling viewport centers smaller tables through auto margins and
 * keeps the start reachable when the table overflows. The table reuses the
 * Markdown table cell styles; the preview surface caps its width and height so
 * a very large table scrolls instead of painting past the stage. The modal
 * chrome (portal, mask, close control, Escape/Tab/focus lifetime) lives in
 * LightboxShell.
 * @param props.labels - dialog and close-control strings.
 * @param props.onClose - dismiss callback owned by the opener.
 * @param props.children - the rendered table element.
 * @returns the fullscreen table preview.
 */
export function TableLightbox({ labels, onClose, children }: {
  labels: TableLightboxLabels
  onClose: () => void
  children: ReactNode
}): ReactNode {
  return (
    <LightboxShell labels={labels} onClose={onClose}>
      <div className={css.viewport} tabIndex={0} aria-label={labels.dialog}>
        <div className={css.inner}>
          <div className={clsx(markdownCss.tableScroll, css.preview)}>{children}</div>
        </div>
      </div>
    </LightboxShell>
  )
}
