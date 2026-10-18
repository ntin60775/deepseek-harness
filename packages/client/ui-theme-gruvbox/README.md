---
description: "OMP gruvbox skin for the dsh web client: an alias-token palette layer plus the markdown, table, tool-frame and status-band surfaces the token layer cannot reach."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-theme-gruvbox

## Summary

`dsh-client-ui-theme-gruvbox` restyles the Web GUI in the gruvbox palette of the omp coding agent's `dark-gruvbox` theme. It contributes two effects and no new UI: an alias-token override layer over the active built-in theme through `ctx.theme.overrideTokens`, and one stylesheet for the surfaces tokens cannot reach — markdown accents, the table grid, tool-call frames. Both effects belong to the plugin fiber, so removing the plugin restores the shipped look exactly. The plugin adds no settings surface, no slots, and nothing model-facing: selecting light, dark or system stays with `ui-theme`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin in a web composition that already mounts `@deepseek-ai/dsh-client-ui-theme`; the skin then applies to the running page immediately. Nothing else is required — the Appearance preference, the content font size, and third-party theme registration keep working unchanged, because the skin stacks a layer over the theme the user selected instead of replacing the registry.

The palette is fixed. The dark column is omp's `dark-gruvbox` verbatim; the light column is its gruvbox-light twin, so switching the Appearance preference never leaves a value illegible.

### What changes

| Area | Effect |
|---|---|
| Surfaces | transcript on the terminal soft background `#32302f`, panels one step up, code blocks and tool bodies on `#1d2021`, sidebar on `#282828` |
| Text | primary `#ebdbb2` (9.6:1 on the base surface), secondary `#d5c4a1`, tertiary `#bdae93`, captions `#928374`, dimmed `#7c6f64` |
| Accent | omp's orange `#fe8019` for the brand fill, the send circle, the input caret and list markers |
| Markdown | headings yellow, inline code purple, tables drawn as the full `boxSharp` grid with a bold header |
| Tool calls | frame colored by state — accent while running, muted on success, error red on failure |
| Composer status | the stats row becomes a band on the code-block surface with per-group icon colors |
| Typography | JetBrains Mono everywhere, markdown prose and tables at weight 500, table text at the body size |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Token layer

`src/palette.ts` holds one `[name, light, dark]` row per token and folds them into the `ThemeTokenOverrides` map `ctx.theme.overrideTokens` accepts. The rows cover every alias the shipped design platform publishes plus the `--shiki-*` syntax variables; the font rows rebind `--dsw-font-family` and `--ds-font-family-code` to the kitty terminal family and raise the markdown prose, table and table-header font shorthands to 500/500/700.

### Stylesheet

`src/styles/gruvbox.css` is imported with `?inline` and mounted as one `<style>` tag under the plugin's own effect. Its selectors are the markup's published hooks, not class names invented here:

- `[class*="_markdown_"]` and `[class*="_tableScroll_"]` match the CSS-module names `MarkdownText.module.css` emits; the built names keep the source name (`._markdown_1wejo_28`), so a substring selector lands on the markdown surface without reaching the settings headings.
- `[data-tool][data-state]` is ToolRow's published row state: `running`, `ok`, `error`, `stopped`.
- `[data-composer-stats]` is the stats row under the composer.

Every value in the sheet is a theme token, so both palettes follow.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-theme](../ui-theme/README.md) — the token stylesheets this skin layers over, and the Appearance rows it leaves alone.
- [ui-layout](../ui-layout/README.md) — the presenter that applies each resolved theme snapshot to the document.
- [Web styling](../../../docs/web-styling.md) — the repository's styling rules and token ownership.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side presentation layer: it registers no tool, no prompt section, and no session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The palette is not configurable.** Deployment-varying choices are absent by design: the skin exists to reproduce one measured look, and a composition wanting another palette registers its own layer through `ctx.theme`.
- **Surface selectors ride CSS-module names.** `[class*="_markdown_"]` is stable while the module keeps its source file name; renaming `MarkdownText.module.css` silently detaches the markdown accents. A published data attribute on the markdown surface would remove that coupling.
- **The light column is untested against a real light session.** It is a straight gruvbox-light translation of the same role table.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The measured reference is the omp repository's `packages/coding-agent/src/modes/theme/defaults/dark-gruvbox.json` plus a captured omp TUI frame: transcript base `#32302f` (the kitty background), tool surfaces `#1d2021`, body text `#d5c4a1`, headings `#fabd2f`, inline code `#d3869b`, list markers `#fe8019`.

</details>

**Runtime invariant:** No companion is published because this package owns no independently observable relationship: the token layer and the stylesheet are two effects of one fiber, and the package's apply spec covers their registration and disposal directly.
