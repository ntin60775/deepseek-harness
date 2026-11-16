/**
 * Apply-owned measurement face for the diagram card body.
 *
 * Measurement rule (domain-expert sign-off recorded in ticket 02):
 * 1. CSS never compares a diagram's viewBox width with the column through a
 *    threshold; the comparison is `resolveDiagramFit`, CSS only expresses the
 *    resolved mode.
 * 2. The measured value is pixel-based: `clientWidth` of the card's inner
 *    measure container.
 * 3. The owner is the card node: the measure container lives inside the card,
 *    `data-fit-mode` is published on the card, and the ref lifecycle belongs
 *    to the plugin apply, not the component.
 *
 * The measure container never scrolls — the horizontal scrollbar lives inside
 * the diagram wrapper — so its `clientWidth` is independent of the active
 * mode. Mode switches rewrite the cached svg's root attributes; mermaid is
 * never re-rendered on resize.
 */
import { resolveDiagramFit, type FitConfig } from './fit.ts'

/** Measurement face supplied by the plugin apply through the inject face. */
export interface MermaidMeasureFace {
  /** Create one element-ref lifecycle for each mounted diagram measure container. */
  createDiagramRef: () => (element: HTMLDivElement | null) => void
}

/**
 * Create the measurement face closing over the validated fit configuration.
 * @param config - fit-rule configuration from the plugin Config.
 * @returns the face whose ref callbacks own their observers' disposal.
 */
export function createMermaidMeasureFace(config: FitConfig): MermaidMeasureFace {
  return {
    createDiagramRef: () => {
      let dispose: (() => void) | undefined
      return (element) => {
        dispose?.()
        dispose = element === null ? undefined : attach(element, config)
      }
    },
  }
}

/** Attach the fit observers to one mounted measure container; returns their disposal. */
function attach(measure: HTMLDivElement, config: FitConfig): () => void {
  const card = measure.parentElement as HTMLElement
  const apply = (): void => {
    const svg = measure.querySelector('svg')
    if (svg === null) return
    const box = svg.viewBox.baseVal
    const fit = resolveDiagramFit({ width: box.width, height: box.height }, measure.clientWidth, config)
    card.dataset.fitMode = fit.mode
    if (fit.mode === 'natural') {
      svg.setAttribute('width', String(fit.width))
      svg.setAttribute('height', String(fit.height))
    } else {
      svg.setAttribute('width', '100%')
      svg.removeAttribute('height')
    }
  }
  apply()
  // ResizeObserver coalesces per frame; the threshold applies in the callback
  // without debounce. A new attempt (theme change, re-settle) returns the body
  // to loading first, so the svg swap remounts this container and the ref
  // re-applies the rule to the cached svg on attach.
  const resize = new ResizeObserver(apply)
  resize.observe(measure)
  return () => { resize.disconnect() }
}
