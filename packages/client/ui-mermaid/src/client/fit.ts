/** Pure column-fit rule for the diagram card body. */

/** Diagram intrinsic size in pixels, read from the root svg's `viewBox.baseVal`. */
export interface DiagramViewBox {
  /** Intrinsic diagram width W. */
  width: number
  /** Intrinsic diagram height H. */
  height: number
}

/** Fit-rule configuration the measurement face closes over. */
export interface FitConfig {
  /** Column-fit scale floor in (0, 1]; a diagram scaled below it keeps its natural size. */
  minFitScale: number
}

/** Presentation mode of one diagram card body. */
export type DiagramFit =
  | { readonly mode: 'fit' }
  | { readonly mode: 'natural'; readonly width: number; readonly height: number }

/**
 * Resolve the presentation mode from the measured column width.
 * `fit = min(1, measuredWidth / W)`; below `minFitScale` the diagram keeps its
 * natural W×H and the card body scrolls horizontally, at or above it the
 * diagram fits the column. Equality resolves to the fitted mode.
 * @param viewBox - intrinsic W×H from `viewBox.baseVal`.
 * @param measuredWidth - pixel width injected by the measurement face.
 * @param config - validated fit-rule configuration.
 * @returns the fitted mode, or the natural mode with its explicit pixel size.
 */
export function resolveDiagramFit(viewBox: DiagramViewBox, measuredWidth: number, config: FitConfig): DiagramFit {
  const fit = Math.min(1, measuredWidth / viewBox.width)
  if (fit < config.minFitScale) return { mode: 'natural', width: viewBox.width, height: viewBox.height }
  return { mode: 'fit' }
}
