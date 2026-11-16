/** DOMPurify sanitize of mermaid SVG output before any presentation. */
import DOMPurify from 'dompurify'

/**
 * Sanitize one rendered mermaid SVG with the single allowed configuration:
 * DOMPurify's default profile (keeps `role`, unlike the svg profile) plus
 * `FORBID_TAGS: ['foreignObject']`. `<use>` is always cut by DOMPurify, so
 * embedded SVG icons are unsupported. The sanitized root keeps `viewBox`,
 * `role`, `aria-label`, `class`, `style`, and `marker-*` attributes.
 * @param svg - raw SVG text emitted by `mermaid.render`.
 * @returns the sanitized SVG text.
 * @throws Error when no visible text node survives outside stylesheet,
 * title, desc, and metadata elements: the caller degrades to the source code block with a notice, the
 * same path as a parse failure.
 */
export function sanitizeMermaidSvg(svg: string): string {
  const clean = DOMPurify.sanitize(svg, { FORBID_TAGS: ['foreignObject'] })
  const document = new DOMParser().parseFromString(clean, 'image/svg+xml')
  const visible = document.documentElement.cloneNode(true) as Element
  // Only rendered label text counts: stylesheet text and accTitle/metadata
  // prose must not satisfy the invariant for a diagram with no visible labels.
  for (const hidden of visible.querySelectorAll('style, title, desc, metadata')) hidden.remove()
  if (visible.textContent.trim() === '') {
    throw new Error('mermaid render produced no visible text')
  }
  return clean
}
