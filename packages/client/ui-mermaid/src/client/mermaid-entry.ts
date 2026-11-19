/** Lazy mermaid entry: the only module that imports mermaid and its DOMPurify copy. */
import mermaid from 'mermaid'
import { sanitizeMermaidSvg } from './sanitize.ts'
import type { MermaidThemeVariables } from './theme-variables.ts'

/**
 * Render one diagram with the global mermaid singleton. The caller serializes
 * attempts across cards because mermaid keeps one diagram database and one
 * mutable config; each call re-initializes that config for its own attempt.
 * @param id - unique render id; mermaid removes stale elements by id.
 * @param code - settled mermaid fence source.
 * @param variables - theme variables resolved at this attempt's async step.
 * @returns the sanitized SVG text.
 * @throws Error on a parse failure or when sanitize finds no visible text.
 */
export async function renderMermaid(id: string, code: string, variables: MermaidThemeVariables): Promise<string> {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    htmlLabels: false,
    themeVariables: variables,
    // A failed parse stays a card-level notice: without this, mermaid inserts its
    // own "Syntax error" diagram into the document body, one per failed fence.
    suppressErrorRendering: true,
  })
  const { svg } = await mermaid.render(id, code)
  return sanitizeMermaidSvg(svg)
}
