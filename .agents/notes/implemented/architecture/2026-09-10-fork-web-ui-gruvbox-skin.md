# Agent Note: fork Web UI skin, status band, and tool-row counts

Status: implemented

## Problem

The fork's Web GUI did not look like the operator's terminal, and the gap could not be closed from configuration. The shipped theme exposes light/dark/system plus a content font size; the reference the operator compares against is the `dark-gruvbox` theme of the omp coding agent — a 66-token palette whose visible decisions are a soft `#32302f` transcript surface, darker tool panels, yellow headings, purple inline code and orange list markers. None of those roles exist in the design platform, and the surfaces that carry them (markdown accents, the table grid, tool frames, a status band) have no token of their own.

Three further gaps were functional rather than cosmetic. A collapsed tool row showed no count of what it held, so the size of a read, a search or a shell run was invisible until expanded. The composer's statistics pills carried the turn, rate, total-token and cache figures but never the input/output split. And nothing tied the reasoning rows to the live thinking level, which the reference terminal colors from `thinkingOff` through `thinkingXhigh`.

## Decision

Two fork-local browser packages plus one narrow change in a shipped package.

**`packages/client/ui-theme-gruvbox`** stacks an alias-token layer through `ctx.theme.overrideTokens` and mounts one plugin-owned stylesheet. Every token is a `{ light, dark }` pair: the dark column is omp's palette verbatim, the light column is its gruvbox-light twin, because a single value goes illegible when the user switches scheme. The stylesheet carries only what tokens cannot reach, and every value in it is a theme token, so a future palette inherits the surfaces.

**`packages/client/ui-status-line`** adds context occupancy and the input/output split under the composer. It deliberately does **not** replace the shipped statistics pills: the pills stay mounted with their figures, their values and their click-to-open detail panels, and the plugin seats its own segments before them (slot order −1). The band's font follows `--dsh-content-font-size` at weight 500 — the operator asked for larger, slightly heavier text, and the scale has to track the user's own setting.

**`packages/client/ui-tool`** gains a trailing statistic on a collapsed row — a read window's file lines, a search's retained results, a shell run's output lines — with two new `tool.meta.*` keys in the conversation dictionaries. A diff row already carried `+A -R`; the new figures reuse that suffix slot and its styling.

### Seams this depends on

- **The dock anchor is `display: contents`.** The renderer publishes `[data-slot="<key>"]` for every slot with an inline `display: contents`, so a stylesheet cannot give the composer dock a box without overriding it (`display: flex !important`, scoped to that one slot). That override is what lets the plugin's segments and the shipped pills read as one surface; without it the pills painted their own band and the segments floated above it.
- **Two CSS-module naming schemes coexist.** Static client libraries bundled by the web shell emit `_name_hash` (e.g. `_markdown_1wejo_28`), while dynamic `lib/client.js` bundles emit `<hash>_name` (e.g. `iKwBNq_leading`). Substring selectors must therefore stop at the name (`[class*='_markdown']`), not at a trailing underscore; the trailing-underscore form silently matched nothing in the dynamic bundles, which is how the reasoning rules first shipped inert.
- **Thinking level is a projection, not a DOM fact.** `modelSelection` publishes the reasoning effort of the last request. The status-line plugin normalizes provider spellings (`x-high`, `med`, `none`) to a canonical level and publishes it as `data-reasoning-level` on the body; the skin paints the ladder. A page without the plugin keeps the shipped muted glyph.
- **Neutral borders are hairlines.** `ui-theme`'s elevation spec rejects any solid neutral-token border wider than `0.5px` under `packages/`; the first version of the skin used `1px` and the gate caught it.

### Mounting

Both packages are declared as dependencies of `packages/bundle/web-app` and inserted by the operator's `$DSH_HOME/profiles/web/cordis.patch.yml`, not by a row in the bundle patch. A client row is discovered only when the process starts: the live patch reload mounts host rows (a `tool-cordis` insert proved that) but a newly inserted client row never reaches the served client module graph, so `dsh --profile web --dump-config` shows the row in the composition while the running page has no module for it. That is why activating these packages needs one `dsh` restart rather than only a page reload.

## Alternatives considered

**Install a ready-made theme plugin from npm.** Several published packages register themes through the same `ctx.theme` extension point, and installing one would have taken minutes. They lost on two counts: none is a faithful gruvbox translation with the omp role mapping, and every one of them is third-party code executing in the page (some with a host half), which the operator did not ask to trust for a cosmetic result.

**Change the shipped `ui-theme` tokens instead of layering over them.** Editing `design-platform.css` would have made gruvbox the product's palette rather than one composition's skin, and would have put a fork-local look on every deployment of the package. The override layer keeps the shipped palette intact and disposable: stopping the plugin restores it exactly.

**Keep the shipped statistics pills hidden and reproduce their figures in the new band.** This was the first implementation and the operator rejected it: the pills own click-to-open detail panels, so hiding them removed access to the per-turn timing and token-usage breakdowns. The band now complements them instead.

**Force the band onto one line by dropping either the segments or the pills.** Fitting one line at chat-content width means giving up the context and input/output readings or the pills' detail panels. Both were kept and the band wraps; the width arithmetic is recorded in the package README.

## Consequences

The fork gains a look that matches the operator's terminal without touching upstream's palette, and the shipped pills keep every figure and panel they had. The costs are owned here: two fork-local packages to keep current across upstream merges, a `!important` override of the renderer's slot-anchor style, substring selectors coupled to CSS-module naming, and a two-line status band.

Not done, deliberately: no line-number gutter or intra-line word highlighting in the diff card (both need `DiffBlock` to parse hunk headers and diff words — a primitive change, not a skin); no model, mode, path, git or subagent segments (those figures live in services and Remote reads the band does not consume, and the pills keep the rest).

## Verification

`pnpm run test:gui` (375 files, 5340 tests), the two packages' focused specs, the client aggregate typecheck, `pnpm run doc-sync` (34 gates) and `pnpm run hygiene` (16 gates). Appearance was verified by screenshots of a throwaway copy of the harness home served on a second port and rendered on an Xvfb display, so the operator's desktop and session store were never touched: skin palette, tool frames by state, the row counters, the band with its detail panels opening on click, and the reasoning glyph at level `max`.
