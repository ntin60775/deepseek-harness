/** Shared modal preview chrome: portal, dimming mask, close control, keyboard ownership. */
import type { ReactNode } from 'react'
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconCloseOutlineRegular } from './icons/index.tsx'
import { useModalLayer } from './useModalLayer.ts'
import css from './LightboxShell.module.css'

/** Lightbox strings the owner resolves from its own locale namespace. */
export interface LightboxShellLabels {
  /** Accessible name of the preview dialog. */
  dialog: string
  /** Accessible label of the close control. */
  close: string
}

/**
 * Document-level modal chrome shared by preview surfaces: a body-portal
 * backdrop whose stage box leaves the Windows caption unpainted, a dimming
 * mask that closes on press, and a close control carrying initial focus.
 * Keyboard ownership and focus lifetime come from useModalLayer: Escape
 * closes the top layer and yields to a focused menu, Tab cycles every
 * focusable inside the dialog, unmount restores the invoking focus. Escape
 * reaches other bubble listeners with defaultPrevented set; owners that
 * dismiss on Escape check that flag. The body portal keeps the fixed
 * backdrop out of transformed or filtered ancestors of the opener. The
 * stage content belongs to the consumer and renders after the close control.
 * @param props.labels - dialog and close-control strings.
 * @param props.onClose - dismiss callback owned by the opener.
 * @param props.children - consumer stage content.
 * @returns the modal preview chrome.
 */
export function LightboxShell({ labels, onClose, children }: {
  labels: LightboxShellLabels
  onClose: () => void
  children: ReactNode
}): ReactNode {
  const dialog = useRef<HTMLDivElement | null>(null)
  useModalLayer(dialog, true, onClose)
  return createPortal(
    <div
      ref={dialog}
      className={css.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialog}
    >
      <div className={css.stage}>
        <div className={css.mask} aria-hidden="true" onMouseDown={onClose} />
        <button type="button" className={css.close} data-modal-autofocus aria-label={labels.close} onClick={onClose}>
          <IconCloseOutlineRegular size={16} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}
