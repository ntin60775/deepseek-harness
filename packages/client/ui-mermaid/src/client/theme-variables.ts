/** Pure mapping from semantic theme tokens to mermaid `themeVariables`. */

/** Semantic `--dsw-*` token behind each mapped mermaid theme variable. */
export const MERMAID_THEME_TOKENS = {
  primaryColor: '--dsw-alias-bg-layer-2',
  primaryTextColor: '--dsw-alias-label-primary',
  primaryBorderColor: '--dsw-alias-border-l3',
  lineColor: '--dsw-alias-label-tertiary',
  secondaryColor: '--dsw-alias-bg-layer-3',
  tertiaryColor: '--dsw-alias-bg-layer-1',
  background: '--dsw-alias-bg-layer-1',
  mainBkg: '--dsw-alias-bg-layer-2',
  nodeBorder: '--dsw-alias-border-l3',
  clusterBkg: '--dsw-alias-bg-layer-2',
  clusterBorder: '--dsw-alias-border-l2',
  titleColor: '--dsw-alias-label-primary',
  edgeLabelBackground: '--dsw-alias-bg-layer-1',
  textColor: '--dsw-alias-label-primary',
} as const

/** Mermaid theme variable names this package maps from theme tokens. */
export type MermaidThemeVariableKey = keyof typeof MERMAID_THEME_TOKENS

/** Resolved mermaid theme variables: mapped tokens plus fixed design metrics. */
export type MermaidThemeVariables = { readonly [K in MermaidThemeVariableKey]: string } & {
  /** Fixed diagram base font size; theme-independent design constant. */
  readonly fontSize: string
  /** Diagram text inherits the card's font stack. */
  readonly fontFamily: string
}

/** Fixed diagram base font size (floor 11px at the 0.85 fit threshold). */
export const MERMAID_FONT_SIZE = '13px'

/**
 * Map resolved token values into mermaid theme variables.
 * @param read - resolved CSS value of one `--dsw-*` token.
 * @returns the immutable variable set handed to `mermaid.initialize`.
 */
export function mapThemeVariables(read: (token: string) => string): MermaidThemeVariables {
  const mapped = Object.fromEntries(Object.entries(MERMAID_THEME_TOKENS)
    .map(([key, token]) => [key, read(token)])) as { [K in MermaidThemeVariableKey]: string }
  return { ...mapped, fontSize: MERMAID_FONT_SIZE, fontFamily: 'inherit' }
}

/**
 * Read the mapped tokens from a computed style, as the render operation's
 * async step does after the theme presenter has written the active sheet.
 * @param style - computed style carrying the resolved alias values.
 * @returns the resolved variable set.
 */
export function readThemeVariables(style: CSSStyleDeclaration): MermaidThemeVariables {
  return mapThemeVariables(token => style.getPropertyValue(token).trim())
}
