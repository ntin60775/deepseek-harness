/** Presentation projection and lightbox serialization of a sanitized diagram SVG. */

/** Parse the `viewBox` attribute into its four numbers; a missing or malformed box yields undefined. */
function viewBoxSize(svg: string): { width: number; height: number } | undefined {
  const box = /viewBox\s*=\s*["']\s*([\d.eE+-]+)[\s,]+([\d.eE+-]+)[\s,]+([\d.eE+-]+)[\s,]+([\d.eE+-]+)\s*["']/u.exec(svg)
  if (box === null) return undefined
  const width = Number(box[3])
  const height = Number(box[4])
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : undefined
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
  root.setAttribute('aria-hidden', 'true')
  root.removeAttribute('aria-labelledby')
  return new XMLSerializer().serializeToString(root)
}

/**
 * Serialize a sanitized SVG into a base64 data URL of its UTF-8 bytes with
 * explicit `width`/`height` from the viewBox, so the lightbox `<img>` fits the
 * viewport through its existing caps instead of collapsing to a default size.
 * @param svg - sanitized SVG text.
 * @returns the `data:image/svg+xml;base64,…` URL for `ImageLightbox`.
 */
export function svgToDataUrl(svg: string): string {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = document.documentElement
  const size = viewBoxSize(svg)
  if (size !== undefined) {
    root.setAttribute('width', String(size.width))
    root.setAttribute('height', String(size.height))
  }
  const text = new XMLSerializer().serializeToString(root)
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}
