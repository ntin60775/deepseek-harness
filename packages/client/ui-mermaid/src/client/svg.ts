/** Presentation projection of a sanitized diagram SVG for the card and the viewer. */

/** Parse the root svg's `viewBox` attribute; a missing or malformed box yields undefined. */
function viewBoxSize(root: Element): { width: number; height: number } | undefined {
  const value = root.getAttribute('viewBox')
  if (value === null) return undefined
  const parts = value.trim().split(/[\s,]+/u).map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) return undefined
  const [, , width, height] = parts as [number, number, number, number]
  return width > 0 && height > 0 ? { width, height } : undefined
}

/** Hide the inner svg from the accessibility tree; the wrapping role="img" owns the name. */
function project(root: Element): void {
  root.setAttribute('aria-hidden', 'true')
  root.removeAttribute('aria-labelledby')
}

/**
 * Project a sanitized SVG for the inline card body: the wrapper owns the
 * accessible name, so the inner svg is hidden from the accessibility tree and
 * mermaid's own `aria-labelledby` (accTitle) reference is removed.
 * @param svg - sanitized SVG text.
 * @returns the SVG text inserted into the `role="img"` wrapper.
 */
export function prepareDiagramSvg(svg: string): string {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = document.documentElement
  project(root)
  return new XMLSerializer().serializeToString(root)
}

/**
 * Project a sanitized SVG for the fullscreen viewer at an explicit scale:
 * mermaid's inline `max-width`/`width` are removed so zoom above 1 grows the
 * diagram, and explicit `width`/`height` carry W·scale / H·scale. The wrapper
 * owns the accessible name as in the card body.
 * @param svg - sanitized SVG text.
 * @param scale - effective diagram scale relative to its intrinsic viewBox size.
 * @returns the SVG text inserted into the viewer's `role="img"` wrapper.
 * @throws Error when the svg carries no usable viewBox; mermaid output always has one,
 * so the arm guards a broken invariant rather than a reachable input.
 */
export function prepareViewerSvg(svg: string, scale: number): string {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = document.documentElement
  const size = viewBoxSize(root)
  if (size === undefined) throw new Error('mermaid diagram svg lacks a usable viewBox')
  project(root)
  root.style.removeProperty('max-width')
  root.style.removeProperty('width')
  root.setAttribute('width', String(size.width * scale))
  root.setAttribute('height', String(size.height * scale))
  return new XMLSerializer().serializeToString(root)
}
