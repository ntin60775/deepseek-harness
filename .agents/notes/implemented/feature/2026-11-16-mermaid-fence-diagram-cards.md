# Agent Note: Mermaid fences render as one fitted diagram card

Status: implemented

## Problem

A ` ```mermaid ` fence in the chat transcript rendered as a code block, so a diagram the model produced had to be read as source. Diagram widths range from small flowcharts to sequence diagrams thousands of pixels wide, and themes vary (light, dark, custom). Mermaid is a heavy browser library with a global singleton database, and its SVG output can carry live HTML. A render design must choose size handling, measurement ownership, viewer semantics, and sanitization without adding a card mode per size.

## Decision

One card type serves every size and theme: the diagram is the default body, the source is one toggle away, and a fullscreen viewer shows the diagram at the chat scale with catalog zoom. [ui-mermaid](../../../../packages/client/ui-mermaid/README.md) registers the `mermaid` key of the [fence hoc slot](../architecture/2026-11-05-markdown-fence-hoc-slot.md); the package ships disabled and a deployment opts in through its profile patch row. The [package README](../../../../packages/client/ui-mermaid/README.md#fit-rule-and-configuration) owns the formula, configuration, and copy details.

Size handling is a resolved mode, not a CSS comparison: the pure function `resolveDiagramFit(viewBox, measuredWidth, config)` ([fit.ts](../../../../packages/client/ui-mermaid/src/client/fit.ts)) returns natural size plus horizontal card scroll below `minFitScale`, and column fit at or above it; equality resolves to fitted. `minFitScale` is client Config `(0, 1]`, default 0.85 (11px / 13px ≈ 0.846 rounded up), validated fails loud at load. The diagram base font is fixed at 13px in every theme, so the floor keeps scaled text at or above 11px. CSS expresses the resolved mode through `data-fit-mode` and never compares a diagram's viewBox width with the column.

Measurement is pixel-based and apply-owned: `clientWidth` of the card's inner non-scrolling measure container arrives through a ref-callback face ([measure.ts](../../../../packages/client/ui-mermaid/src/client/measure.ts), precedent `ui-plugin-manager/header-scroll.ts`), so the component creates no machinery. A ResizeObserver without debounce applies the threshold in its callback; a mode switch rewrites the cached svg's root attributes, and mermaid never re-renders on resize.

The viewer shows the same live diagram at the chat scale with catalog zoom; [the viewer decision](2026-11-19-mermaid-viewer-chat-scale.md) owns its scale, zoom, and chrome rules.

DOMPurify is the only sanitizer (default profile plus `FORBID_TAGS: ['foreignObject']`); the post-sanitize check reads the tree for the non-empty-text invariant but never filters it, and a render left with no visible text degrades like a parse error to the code block with a notice. Mermaid renders with `htmlLabels: false` globally.

Mermaid lives in one lazy self-contained chunk `client.mermaid-entry.js` behind the controller's `import()`. Its license banner credits the installed dependency closure of mermaid — every package whose code the chunk embeds — and the bundle-split spec pins that coverage against the chunk's sourcemap. The render controller, theme channel, and measure face are apply-owned instances because mermaid's database is a global singleton; one attempt lifecycle serves each card.

## Alternatives considered

- **Per-size card types and a fitted-plus-natural hybrid**: rejected at the [plan gate](../../../../docs/plans/mermaid-fence-render.md) — one card type keeps the transcript predictable; size is expressed by the fit mode, not by a different card.
- **A height criterion for «large»**: rejected; width alone decides, height is never constrained.
- **CSS threshold comparison (container/media queries)**: CSS cannot read a specific diagram's viewBox width; the comparison is pixel-based and owned by the card node.
- **Debounced resize or mermaid re-render on resize**: the observer coalesces per frame; re-rendering would reset scroll and re-enter the global renderer. A mode switch is attributes from the cached SVG.
- **A bundle-size gate**: a one-off before/after measurement lives in the [ticket proofs](../../../../tickets/mermaid-fence-render/proofs/03-bundle-sizes.md); no new gate is built.
- **A fixed license-root list for the banner**: the original seven-root list missed most of the embedded tree; the installed dependency closure is the exact disclosure set, and the notices generator discloses the same closure for every distributed browser input.

## Consequences

Wide diagrams scroll inside the card instead of shrinking below readability; the floor holds because body padding sits outside the measure container, so the measured width equals the diagram's content width. Embedded SVG icons (`<use>`) are unsupported — DOMPurify always cuts `use` — and a render without visible text degrades to source with a notice. The startup bundle carries no mermaid; the lazy chunk loads on the first settled fence and carries every embedded package's license text. A theme change re-renders without reload while metrics stay theme-independent. `minFitScale` is client Config: the config-catalog scanner reads host entries only, so the package README owns its documentation (precedent `ui-context-menu`).

Verification: component specs (fit boundaries 0.84/0.85/0.86, Config fails loud, ResizeObserver substitution, measure face, sanitize fixture vectors, controller lifecycle, theme metrics), [mermaid-fence.e2e.ts](../../../../apps/web/tests/mermaid-fence.e2e.ts) (ARIA golden plus non-golden fit/scroll, narrow-column, and resize-survival assertions), and the package bundle-split spec (chunk form plus banner coverage).