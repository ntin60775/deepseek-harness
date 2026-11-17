# Agent Note: Mermaid fences render as one fitted diagram card

Status: implemented

## Problem

A ` ```mermaid ` fence in the chat transcript rendered as a code block, so a diagram the model produced had to be read as source. Diagram widths range from small flowcharts to sequence diagrams thousands of pixels wide, and themes vary (light, dark, custom). Mermaid is a heavy browser library with a global singleton database, and its SVG output can carry live HTML. A render design must choose size handling, measurement ownership, viewer semantics, and sanitization without turning the transcript into a zoo of card modes.

## Decision

One card type serves every size and theme (mode A): the diagram is the default body, the source is one toggle away, and a lightbox shows the whole diagram. [ui-mermaid](../../../../packages/client/ui-mermaid/README.md) registers the `mermaid` key of the [fence hoc slot](../architecture/2026-11-05-markdown-fence-hoc-slot.md); the package ships disabled and a deployment opts in through its profile patch row.

The fit rule is the pure function `resolveDiagramFit(viewBox, injectedWidth, config)` ([fit.ts](../../../../packages/client/ui-mermaid/src/client/fit.ts)): `fit = min(1, measureWidth / W)` with `W×H` from `viewBox.baseVal`. Below `minFitScale` the diagram keeps its natural size and the card body scrolls horizontally; at or above it the diagram fits the column; equality resolves to fitted. `minFitScale` is client Config `(0, 1]`, default 0.85 (11px / 13px ≈ 0.846 rounded up), validated fails loud at load. The diagram base font is fixed at 13px in every theme, so the floor keeps scaled text at or above 11px.

Measurement is pixel-based: `clientWidth` of the card's inner non-scrolling measure container, injected by an apply-owned ref-callback face ([measure.ts](../../../../packages/client/ui-mermaid/src/client/measure.ts), precedent `ui-plugin-manager/header-scroll.ts`). A ResizeObserver without debounce applies the threshold in its callback; a mode switch rewrites the cached svg's root attributes, and mermaid never re-renders on resize. CSS expresses the resolved mode through `data-fit-mode` and never compares a diagram's viewBox width with the column (domain-expert sign-off recorded in [ticket 02](../../../../tickets/mermaid-fence-render/02-theme-and-fit.md)).

The viewer is the shared `ImageLightbox` over a data URL of the serialized SVG with explicit width/height from its viewBox: viewport-fit with the lightbox caps, no absolute 1:1 and no interactive zoom. The card's natural branch is the only 1:1 presentation.

Every SVG passes DOMPurify (default profile plus `FORBID_TAGS: ['foreignObject']`, `htmlLabels: false` globally) before presentation; a render left with no visible text degrades like a parse error to the code block with a notice. No custom SVG-tree walk exists.

Mermaid lives in one lazy self-contained chunk `client.mermaid-entry.js` behind the controller's `import()`, with a license banner covering the private mermaid tree. The render controller, theme channel, and measure face are apply-owned instances because mermaid's database is a global singleton; one attempt lifecycle serves each card.

## Alternatives considered

- **Per-size card types (variants B/C/D) and the A+C hybrid**: rejected at the plan gate — one card type keeps the transcript predictable; size is expressed by the fit mode, not by a different card.
- **A height criterion for «large»**: rejected; width alone decides, height is never constrained.
- **CSS threshold comparison (container/media queries)**: CSS cannot read a specific diagram's viewBox width; the comparison is pixel-based and owned by the card node.
- **Debounced resize or mermaid re-render on resize**: the observer coalesces per frame; re-rendering would reset scroll and re-enter the global renderer. A mode switch is attributes from the cached SVG.
- **Absolute 1:1 viewer or interactive zoom**: viewport-fit covers the viewing need; zoom adds a mode without a current consumer.
- **A bundle-size gate**: a one-off before/after measurement lives in the [ticket proofs](../../../../tickets/mermaid-fence-render/proofs/03-bundle-sizes.md); no new gate is built.

## Consequences

Wide diagrams scroll inside the card instead of shrinking below readability; the floor is honest because body padding sits outside the measure container, so the measured width equals the diagram's content width. Embedded SVG icons (`<use>`) are unsupported — DOMPurify always cuts `use` — and a render without visible text degrades to source with a notice. The startup bundle carries no mermaid; the lazy chunk is about 3.4 MB raw (0.9 MB gzip) and loads on the first settled fence. A theme change re-renders without reload while metrics stay theme-independent. `minFitScale` is client Config: the config-catalog scanner reads host entries only, so the package README owns its documentation (precedent `ui-context-menu`).

Verification: component specs (fit boundaries 0.84/0.85/0.86, Config fails loud, ResizeObserver substitution, measure face, sanitize fixture vectors, controller lifecycle, theme metrics), [mermaid-fence.e2e.ts](../../../../apps/web/tests/mermaid-fence.e2e.ts) (ARIA golden plus non-golden fit/scroll, narrow-column, and resize-survival assertions), and the package bundle-split spec.