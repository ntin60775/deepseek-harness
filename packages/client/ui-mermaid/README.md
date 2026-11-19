---
description: "Render settled mermaid chat fences as sanitized SVG diagram cards with a source toggle and a fullscreen viewer at the chat scale."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-mermaid

## Summary

A ` ```mermaid ` fence in the chat transcript renders as an SVG diagram card instead of a code block. One card type serves every size and theme: the diagram is the default body, the source is one toggle away, and a fullscreen viewer shows the diagram at the chat scale with catalog zoom and scrollbars when it overflows. Wide diagrams keep their natural size with horizontal scroll inside the card. The package ships disabled; a deployment opts in by overriding the `ui-mermaid` row in its profile patch.

## Table of Contents

- [Use this package](#use-this-package)
- [Fit rule and configuration](#fit-rule-and-configuration)
- [Diagram viewer](#diagram-viewer)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Enable the shipped row in a profile patch:

```yaml
- id: ui-mermaid
  disabled: false
```

While a reply streams, the fence stays a code block. Once it settles, the card loads the mermaid chunk lazily and renders the diagram in the active theme's colors; a theme change re-renders without a reload. The header carries the `mermaid` language label, a **Source** toggle (`aria-pressed`) that swaps the body to the highlighted source and back, a **Copy** action available in both body states, and a viewer button. Enter or Space on the focused diagram opens the viewer as well.

A parse failure, a rejected chunk import, or a render without visible text degrades to the code block with a compact notice; the source stays intact. The import is not retried inside a mount; remounting starts a new attempt.

Every SVG passes DOMPurify (default profile plus `FORBID_TAGS: ['foreignObject']`) before presentation, with `htmlLabels: false` globally. The card wrapper owns the accessible name (`role="img"` with a localized label); the inner svg is `aria-hidden`.

<a id="fit-rule-and-configuration"></a>
### Fit rule and configuration

`fit = min(1, measureWidth / W)` with `W×H` read from the rendered svg's `viewBox.baseVal`. Below `minFitScale` the diagram keeps its natural `W×H` and the card body scrolls horizontally; at or above it the diagram fits the column (`width="100%"` plus mermaid's `max-width`). Equality resolves to the fitted mode. Height is never constrained.

```yaml
- id: ui-mermaid
  disabled: false
  config:
    minFitScale: 0.85
```

`minFitScale` accepts `(0, 1]`, defaults to `0.85` (11px / 13px ≈ 0.846 rounded up), and fails loud at load outside the range. The diagram base font is fixed at 13px in every theme; the floor keeps scaled text at or above 11px because the measured width equals the diagram's available content width.

<a id="diagram-viewer"></a>
### Diagram viewer

The viewer mounts the shared `LightboxShell` chrome from `ui-primitives` around the live sanitized SVG, so the diagram stays vector at every zoom. It opens at the scale the card publishes through `data-fit-scale` and never recomputes it; a missing published scale fails the open instead of defaulting. Width and height follow `W×s` and `H×s` from the viewBox, and mermaid's inline `max-width` and `width` on the injected root are removed, so a zoom above the chat scale grows the diagram past its card width.

The toolbar is the catalog `ZoomControls` with `DOCUMENT_ZOOM` semantics: each step lands on the next 0.25 grid node, the scale clamps to `[0.25, 4]`, and the control carries the fixed presets and the percentage menu, with no fitting row. It sits at the stage's bottom edge over the scroll viewport, and the close control stays in the stage's top-right corner. The scroll viewport centers a diagram smaller than itself through auto margins and keeps the start reachable when the scaled diagram overflows on either axis.

The wrapper carries `role="img"` with the diagram label and the inner svg stays `aria-hidden`; the scroll viewport and the toolbar carry their own accessible names. Closing returns focus to the control that opened the viewer. A theme revision closes the viewer while the card re-renders, so that opener is gone and focus falls back to the document; the next open starts again from the chat scale.

<a id="model-experience"></a>
## Model Experience

None, as this package only presents an existing fence event in the browser without adding model input, tools, or prompt text.

#### KV Cache effect

None; diagram rendering happens entirely in the browser and writes nothing to the Session log.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Embedded SVG icons (`<use>`) are unsupported: DOMPurify always cuts `use`, so a diagram with icons renders without them; a render left with no visible text degrades to the source with a notice.
- Other diagram languages (graphviz, plantuml, d2), export, editing, and rendering outside the chat transcript (session titles, tool cards, `.md` previews) are out of scope.
- The viewer zooms only through the toolbar: wheel zoom, drag pan, and a fitting row are not offered.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Measurement rule (domain-expert sign-off recorded in the ticket 02 execution report): CSS never compares a diagram's viewBox width with the column through a threshold — the comparison is `resolveDiagramFit`, CSS only expresses the resolved mode through `data-fit-mode` (`fit` | `natural`) on the card. The measured value is pixel-based: `clientWidth` of the card's inner non-scrolling measure container, independent of the active mode (the scrollbar lives inside the diagram wrapper, body padding lives outside the measure container). The ref-callback lifecycle belongs to the plugin apply ([measure.ts](src/client/measure.ts), precedent `ui-plugin-manager/header-scroll.ts`); a ResizeObserver without debounce applies the threshold in its callback, and a mode switch rewrites the cached svg's root attributes without re-rendering mermaid.

</details>
