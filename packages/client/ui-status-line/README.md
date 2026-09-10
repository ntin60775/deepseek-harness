---
description: "OMP-style status band under the composer: context occupancy with thresholds, output rate, token totals, cache hit rate and turn counters."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-status-line

## Summary

`dsh-client-ui-status-line` completes the status band under the composer: context occupancy with capacity and threshold colors, and the input/output token split. Every figure comes from a Host-computed session projection, so paging, compaction and a reloaded page cannot change what it shows.

The plugin adds to the shipped statistics pills rather than replacing them: the pills keep their figures, their values and their click-to-open detail panels, and styling the dock wrapper the renderer publishes for every slot makes both contributions one surface.

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

Mount the plugin in a web composition that already mounts the conversation surface; the band appears under the composer once the session has figures to show. Nothing is configurable: the segment set is fixed, matching the reference terminal layout.

### What the band shows

| Segment | Source | Reading |
|---|---|---|
| `◫ 42.3%/200K` | `contextPressure` | occupancy of the reporting window, colored neutral below 50 %, warning to 90 %, error above |
| `↑ 208K` | `tokenUsage` | prompt-side input: uncached input plus both cache directions |
| `↓ 12K` | `tokenUsage` | output tokens |

### Alongside the shipped pills

The composer dock already carries the two statistics pills from the Chat domain — turns, steps, output rate, total tokens and cache hit, each opening its own detail panel on click. The plugin seats its segments before them (slot order −1) and leaves every pill untouched, so the base UI's figures and its click-to-open panels stay available; the plugin only flattens the pills' own chrome so both contributions sit in one band. Removing the plugin leaves the pills exactly as shipped.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Data

`StatusLine` receives the framework's session standard props, so `useProjection` addresses `tokenUsage`, `contextPressure` and `modelSelection` directly; no service is injected and no Remote call is made. Occupancy prefers `projectedTokens` (the last sample plus the surface movement since it) and falls back to `pressureTokens`. The live reasoning level from `modelSelection` is published as a `data-reasoning-level` attribute on the document for the skin to paint.

### Registration

`apply` registers the locale dictionaries, mounts one plugin-owned stylesheet, and contributes the band through `ctx.slots.inject('conversation.composer.dock', …)` at order 1, after the shipped pills. All three registrations are fiber effects.

### Copy

Visible tokens are glyphs and numbers; the accessible names live in the `status.line` locale namespace with both shipped dictionaries.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-chat](../ui-chat/README.md) — the statistics pills this band retires and the dialogs they open.
- [ui-conversation](../ui-conversation/README.md) — the composer dock and the context meter in the composer bar.
- [ui-theme-gruvbox](../ui-theme-gruvbox/README.md) — the skin whose tokens give the band its omp surface and colors.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package renders Host-computed projections for a human and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No model, mode, path, git or subagent segments.** Those figures live in services and Remote reads this version does not consume; the band carries what session projections already publish, and the shipped pills keep the rest.
- **The band's font scale is set by the stylesheet, not by a setting.** Size and weight follow `--dsh-content-font-size` with a fixed medium weight.
- **The band is not configurable.** Segment order, thresholds and the retirement of the shipped pills are fixed; a composition wanting another layout registers its own contribution.
- **Numbers are formatted without a locale.** K and M suffixes and the decimal separator are fixed; a localized number seat would replace the local helper.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Thresholds and the segment set follow the omp status line (`packages/coding-agent/src/modes/components/status-line/segments.ts`), reduced to the figures the dsh session projections publish today.

</details>

**Runtime invariant:** No companion is published because every figure this package shows is a read of a Host-computed session projection; its presentation spec covers the readings it derives and the attribute it publishes.
