import type { HTMLAttributes } from 'react'
import { LightboxShell, type LightboxShellLabels } from './LightboxShell.tsx'
import css from './ImageLightbox.module.css'

/** Lightbox strings the owner resolves from its own locale namespace. */
export type ImageLightboxLabels = LightboxShellLabels

/**
 * Document-level original-image preview opened by clicking a thumbnail.
 * The modal chrome (portal, mask, close control, Escape/Tab/focus lifetime)
 * lives in LightboxShell; this component owns the capped image as stage
 * content. Closes on Escape, backdrop press, or the close control, and
 * restores focus to the opener on unmount.
 *
 * @param props.src - the original image URL.
 * @param props.alt - the image's alt text.
 * @param props.labels - dialog and close-control strings.
 * @param props.contextMenuProps - optional original-image gesture bindings.
 * @param props.onClose - dismiss callback owned by the opener.
 * @returns the modal preview dialog.
 */
export function ImageLightbox({ src, alt, labels, onClose, contextMenuProps }: {
  src: string
  alt: string
  labels: ImageLightboxLabels
  onClose: () => void
  contextMenuProps?: Pick<HTMLAttributes<HTMLElement>, 'onContextMenu' | 'onKeyDown' | 'tabIndex'> | undefined
}) {
  return (
    <LightboxShell labels={labels} onClose={onClose}>
      <img className={css.image} src={src} alt={alt} {...contextMenuProps} />
    </LightboxShell>
  )
}
