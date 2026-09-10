/**
 * The OMP gruvbox alias-token layer.
 *
 * Values come from the `dark-gruvbox` theme of the omp coding agent: the dark
 * column is omp's own palette, the light column is its gruvbox-light twin so
 * switching the Appearance preference stays legible. The transcript sits on
 * the terminal soft background `#32302f`, tool surfaces sit below it on
 * `#1d2021`, and the accent is omp's orange `#fe8019`.
 *
 * The typed light/dark pair is required by `ThemeRuntime.overrideTokens`: one
 * value cannot stay legible across both palettes.
 */
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Gruvbox light values (roles the dark column also needs a counterpart for). */
const L = {
  bg0: '#fbf1c7',
  bg1: '#ebdbb2',
  bg2: '#d5c4a1',
  bg3: '#bdae93',
  bg4: '#a89984',
  gray: '#928374',
  fg1: '#3c3836',
  fg2: '#504945',
  fg3: '#665c54',
  red: '#cc241d',
  green: '#98971a',
  yellow: '#d79921',
  blue: '#458588',
  purple: '#b16286',
  aqua: '#689d6a',
  orange: '#d65d0e',
} as const

/** Gruvbox dark values, exactly as the omp `dark-gruvbox` theme resolves them. */
const D = {
  soft: '#32302f',
  bg0: '#282828',
  bg0h: '#1d2021',
  bg1: '#3c3836',
  bg2: '#504945',
  bg3: '#665c54',
  bg4: '#7c6f64',
  gray: '#928374',
  fg1: '#ebdbb2',
  fg2: '#d5c4a1',
  fg3: '#bdae93',
  fg4: '#a89984',
  red: '#fb4934',
  green: '#b8bb26',
  yellow: '#fabd2f',
  blue: '#83a598',
  purple: '#d3869b',
  aqua: '#8ec07c',
  orange: '#fe8019',
} as const

/** Terminal font of the kitty configuration this skin matches; the UI keeps it too. */
const MONO = "'JetBrainsMono Nerd Font Mono', 'JetBrains Mono', 'SF Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, monospace"

/** Markdown prose at omp's Medium weight (the installed family has that face). */
const BASE_FONT = '500 var(--dsh-content-font-size, 14px)/calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)'

/** Table body: the prose size, one weight step above the shipped 400. */
const TABLE_FONT = BASE_FONT

/** Table header: omp draws it bold. */
const TABLE_HEAD_FONT = '700 var(--dsh-content-font-size, 14px)/calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)'

/**
 * Alias tokens this skin rebinds, as `[name, light, dark]` rows. Every name is
 * a `--dsw-*` custom property the theme layer applies to the document; the
 * shiki entries are the syntax palette's own variables.
 */
const ROWS: readonly (readonly [string, string, string])[] = [
  ['--dsw-alias-bg-base', L.bg0, D.soft],
  ['--dsw-alias-bg-layer-1', L.bg1, D.bg1],
  ['--dsw-alias-bg-layer-2', L.bg2, D.bg2],
  ['--dsw-alias-bg-layer-3', L.bg3, D.bg3],
  ['--dsw-alias-bg-module-platform', L.bg1, D.bg1],
  ['--dsw-alias-bg-multi-select', L.bg2, D.bg2],
  ['--dsw-alias-bg-overlay', L.bg0, D.bg2],
  ['--dsw-alias-bg-skeleton', 'rgba(60, 56, 54, 0.12)', 'rgba(235, 219, 178, 0.08)'],
  ['--dsw-alias-border-inverted', 'rgba(60, 56, 54, 0.10)', 'rgba(235, 219, 178, 0.10)'],
  ['--dsw-alias-border-inverted2', 'rgba(60, 56, 54, 0.14)', 'rgba(235, 219, 178, 0.14)'],
  ['--dsw-alias-border-l1', 'rgba(60, 56, 54, 0.14)', 'rgba(235, 219, 178, 0.10)'],
  ['--dsw-alias-border-l2-darkmode-thin', 'rgba(60, 56, 54, 0.18)', 'rgba(235, 219, 178, 0.14)'],
  ['--dsw-alias-border-l2', L.bg2, D.bg2],
  ['--dsw-alias-border-l3', L.bg4, D.bg3],
  ['--dsw-alias-border-l4', D.bg4, D.bg4],
  ['--dsw-alias-brand-primary', L.orange, D.orange],
  ['--dsw-alias-brand-primary-invert', L.bg0, D.soft],
  ['--dsw-alias-brand-primary-new-colorprimary-new-color', L.orange, D.orange],
  ['--dsw-alias-button-primary-dimmed', L.bg3, D.bg2],
  ['--dsw-alias-button-primary-hover', '#af3a03', '#fea44d'],
  ['--dsw-alias-button-contrast-fill', L.fg1, D.fg1],
  ['--dsw-alias-button-elevated-fill', L.bg1, D.bg1],
  ['--dsw-alias-button-floating-fill', L.bg1, D.bg1],
  ['--dsw-alias-button-floating-hover', L.bg2, D.bg2],
  ['--dsw-alias-button-ghost-active-border', L.bg3, D.bg2],
  ['--dsw-alias-button-ghost-active-fill', L.bg2, D.bg1],
  ['--dsw-alias-button-ghost-active-hover', L.bg3, D.bg2],
  ['--dsw-alias-button-info-fill', L.orange, D.orange],
  ['--dsw-alias-button-info-hover', '#af3a03', '#fea44d'],
  ['--dsw-alias-button-tool-bar-fill', 'rgba(213, 196, 161, 0.45)', 'rgba(102, 92, 84, 0.5)'],
  ['--dsw-alias-button-tool-bar-fill-invisible', 'rgba(251, 241, 199, 0.36)', 'rgba(50, 48, 47, 0.36)'],
  ['--dsw-alias-button-tool-bar-hover', 'rgba(213, 196, 161, 0.65)', 'rgba(102, 92, 84, 0.72)'],
  ['--dsw-alias-state-business-primary', L.orange, D.orange],
  ['--dsw-alias-state-business-tertiary', 'rgba(214, 93, 14, 0.25)', 'rgba(254, 128, 25, 0.25)'],
  ['--dsw-alias-interactive-bg-active', 'rgba(60, 56, 54, 0.14)', 'rgba(235, 219, 178, 0.14)'],
  ['--dsw-alias-interactive-bg-hover', 'rgba(60, 56, 54, 0.08)', 'rgba(235, 219, 178, 0.08)'],
  ['--dsw-alias-interactive-bg-hover-accent', 'rgba(214, 93, 14, 0.14)', 'rgba(254, 128, 25, 0.16)'],
  ['--dsw-alias-interactive-bg-hover-danger', 'rgba(204, 36, 29, 0.12)', 'rgba(251, 73, 52, 0.15)'],
  ['--dsw-alias-interactive-bg-hover-solid', L.bg2, D.bg2],
  // Text ladder: one gruvbox step above the shipped dark values, which keeps
  // 9.6:1 against the raised #32302f surface (the shipped #d5c4a1 pair on that
  // background is 7.65:1).
  ['--dsw-alias-label-primary', L.fg1, D.fg1],
  ['--dsw-alias-label-primary-bluish', L.fg1, D.fg1],
  ['--dsw-alias-label-primary-dimmed', L.fg2, D.fg2],
  ['--dsw-alias-label-primary-foreground', L.bg0, D.bg0],
  ['--dsw-alias-label-primary-inverted', L.bg0, D.bg0],
  ['--dsw-alias-label-secondary', L.fg2, D.fg2],
  ['--dsw-alias-label-tertiary', L.fg3, D.fg3],
  ['--dsw-alias-label-caption', L.gray, D.gray],
  ['--dsw-alias-label-dimmed', L.bg4, D.bg4],
  ['--dsw-alias-link', L.blue, D.aqua],
  ['--dsw-alias-markdown-citation', L.bg1, D.bg1],
  ['--dsw-alias-markdown-code-block', L.bg1, D.bg0h],
  ['--dsw-alias-markdown-code-block-banner', L.bg2, D.bg0],
  ['--dsw-alias-markdown-code-segment-selected', L.bg3, D.bg1],
  ['--dsw-alias-markdown-code-segment-unselected', L.bg1, D.bg0h],
  ['--dsw-alias-markdown-inline-code', L.bg1, D.bg0],
  ['--dsw-alias-markdown-placeholder', L.bg2, D.bg2],
  ['--dsw-alias-markdown-tag', L.bg2, D.bg2],
  ['--dsw-alias-state-error-primary', L.red, D.red],
  ['--dsw-alias-state-error-secondary', L.red, D.red],
  ['--dsw-alias-state-success-primary', L.green, D.green],
  ['--dsw-alias-state-success-secondary', L.green, D.green],
  ['--dsw-alias-state-success-tertiary', 'rgba(152, 151, 26, 0.22)', 'rgba(184, 187, 38, 0.22)'],
  ['--dsw-alias-state-warn-label', L.yellow, D.yellow],
  ['--dsw-alias-state-warn-primary', L.yellow, D.yellow],
  ['--dsw-alias-state-warn-secondary', L.yellow, D.yellow],
  ['--dsw-alias-state-warn-tertiary', 'rgba(215, 153, 33, 0.22)', 'rgba(250, 189, 47, 0.22)'],
  ['--dsw-alias-toast-bg', L.bg2, D.bg1],
  ['--dsw-alias-tooltip-bg', L.bg2, D.bg1],
  ['--dsw-specific-bubble', L.bg1, D.bg0h],
  ['--dsw-specific-bubble-highlight', L.bg2, D.bg0],
  ['--dsw-specific-input-major', L.bg1, D.bg1],
  ['--dsw-specific-login-input', L.bg0, D.soft],
  ['--dsw-specific-selector', L.bg2, D.bg1],
  ['--dsw-specific-sidebar-fill', L.bg1, D.bg0],
  ['--dsw-specific-sidebar-nav-item-active', L.bg3, D.bg1],
  ['--dsw-specific-sidebar-nav-item-active-accent', L.bg4, D.bg2],
  ['--dsw-specific-sidebar-nav-item-hover', L.bg2, D.soft],
  ['--dsw-specific-tip', L.bg2, D.bg1],
  ['--dsw-alias-scrollbar-bg-l1', L.bg2, D.bg1],
  ['--dsw-alias-scrollbar-bg-l2', L.bg3, D.bg2],
  ['--dsw-alias-scrollbar-hover-l1', L.bg3, D.bg2],
  ['--dsw-alias-scrollbar-hover-l2', L.bg4, D.bg3],
  ['--shiki-token-constant', L.purple, D.purple],
  ['--shiki-token-string', L.green, D.green],
  ['--shiki-token-comment', L.gray, D.gray],
  ['--shiki-token-keyword', L.red, D.red],
  ['--shiki-token-parameter', L.orange, D.orange],
  ['--shiki-token-function', L.yellow, D.yellow],
  ['--shiki-token-string-expression', L.aqua, D.aqua],
  ['--shiki-token-punctuation', L.fg2, D.fg2],
  ['--shiki-token-link', L.blue, D.aqua],
  ['--dsw-font-family', MONO, MONO],
  ['--ds-font-family-code', MONO, MONO],
  ['--dsw-font-markdown-base', BASE_FONT, BASE_FONT],
  ['--dsw-font-markdown-table', TABLE_FONT, TABLE_FONT],
  ['--dsw-font-markdown-table-head', TABLE_HEAD_FONT, TABLE_HEAD_FONT],
]

/** The token layer this skin stacks over whatever theme the user selected. */
export const GRUVBOX_TOKENS: ThemeTokenOverrides = Object.fromEntries(
  ROWS.map(([name, light, dark]) => [name, { light, dark }]),
)
