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
 * @throws Error when no visible text node survives outside stylesheet
 * elements: the caller degrades to the source code block with a notice, the
 * same path as a parse failure.
 */
export function sanitizeMermaidSvg(svg: string): string {
  const clean = DOMPurify.sanitize(svg, { FORBID_TAGS: ['foreignObject'] })
  const document = new DOMParser().parseFromString(clean, 'image/svg+xml')
  const visible = document.documentElement.cloneNode(true) as Element
  for (const style of visible.querySelectorAll('style')) style.remove()
  if (visible.textContent.trim() === '') {
    throw new Error('mermaid render produced no visible text')
  }
  return clean
}
