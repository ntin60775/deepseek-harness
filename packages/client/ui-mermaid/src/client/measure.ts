/**
 * Apply-owned measurement face for the diagram card body.
 *
 * Measurement rule:
 * 1. CSS never compares a diagram's viewBox width with the column through a
 *    threshold; the comparison is `resolveDiagramFit`, CSS only expresses the
 *    resolved mode.
 * 2. The measured value is pixel-based: `clientWidth` of the card's inner
 *    measure container, which equals the diagram's available content width.
 * 3. The owner is the card node: the measure container lives inside the card
 *    and wraps both body modes (diagram and source), `data-fit-mode` and
 *    `data-fit-scale` are published on the card, and the ref lifecycle belongs
 *    to the plugin apply, not the component.
 *
 * The measure container never scrolls — the horizontal scrollbar lives inside
 * the diagram wrapper — so its `clientWidth` is independent of the active
 * mode. Resize deliveries and childList mutations (mode swaps) re-apply the
 * rule; mermaid is never re-rendered on resize. In source mode the container
 * holds no svg: the scale is published from the viewBox cached by the ref
 * closure of this card instance, and root attributes are left untouched. The
 * first attach always commits the svg before the ref runs.
 */
import { resolveDiagramFit, type DiagramViewBox, type FitConfig } from './fit.ts'

/** Measurement face supplied by the plugin apply through the inject face. */
export interface MermaidMeasureFace {
  /** Create one element-ref lifecycle for each mounted diagram measure container. */
  createDiagramRef: () => (element: HTMLDivElement | null) => void
}

/**
 * Create the measurement face closing over the validated fit configuration.
 * @param config - fit-rule configuration from the plugin Config.
 * @returns the face whose ref callbacks own their observers' disposal and share one viewBox cache per card.
 */
export function createMermaidMeasureFace(config: FitConfig): MermaidMeasureFace {
  return {
    createDiagramRef: () => {
      let dispose: (() => void) | undefined
      const cache: { box?: DiagramViewBox } = {}
      return (element) => {
        dispose?.()
        dispose = element === null ? undefined : attach(element, config, cache)
      }
    },
  }
}

/** Attach the fit observer to one mounted measure container; returns its disposal. */
function attach(measure: HTMLDivElement, config: FitConfig, cache: { box?: DiagramViewBox }): () => void {
  const card = measure.closest('[data-mermaid-card]') as HTMLElement
  const apply = (): void => {
    // The container mounts in the rendered body state, whose sanitized svg is
    // committed before this ref runs (header-scroll.ts precedent); later
    // svg-less attaches are source-mode remounts served by the cache.
    const svg = measure.querySelector('svg')
    if (svg !== null) cache.box = { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height }
    const box = cache.box
    /* v8 ignore next -- unreachable: the first attach commits the svg before the ref, and every later svg-less attach has the cache */
    if (box === undefined) return
    const fit = resolveDiagramFit(box, measure.clientWidth, config)
    card.dataset.fitMode = fit.mode
    card.dataset.fitScale = String(fit.scale)
    if (svg === null) return
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
  // without debounce. A height-only delivery re-applies the same width and is
  // idempotent. A new attempt (theme change, re-settle) returns the body to
  // loading first, so the svg swap remounts this container and the ref
  // re-applies the rule on attach.
  const resize = new ResizeObserver(apply)
  resize.observe(measure)
  // Mode swaps reuse the inner div (both branches are divs) and replace its
  // subtree; when heights coincide no resize delivery arrives, so the subtree
  // childList observer re-applies the rule on svg mount.
  const children = new MutationObserver(apply)
  children.observe(measure, { childList: true, subtree: true })
  return () => { resize.disconnect(); children.disconnect() }
}
