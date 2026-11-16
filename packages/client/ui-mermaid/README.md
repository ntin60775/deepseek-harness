---
description: "Render settled mermaid chat fences as sanitized SVG diagram cards with a source toggle and a lightbox viewer."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-mermaid

## Summary

A ` ```mermaid ` fence in the chat transcript renders as an SVG diagram card instead of a code block. One card type serves every size and theme: the diagram is the default body, the source is one toggle away, and a lightbox shows the whole diagram fitted to the viewport. The package ships disabled; a deployment opts in by overriding the `ui-mermaid` row in its profile patch.

## Table of Contents

- [Use this package](#use-this-package)
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

While a reply streams, the fence stays a code block. Once it settles, the card loads the mermaid chunk lazily and renders the diagram in the active theme's colors; a theme change re-renders without a reload. The header carries the `mermaid` language label, a **Source** toggle (`aria-pressed`) that swaps the body to the highlighted source and back, a **Copy** action available in both body states, and a viewer button. Enter or Space on the focused diagram opens the viewer as well. The viewer is the shared `ImageLightbox` over a data URL of the serialized SVG with explicit dimensions from its viewBox: viewport-fit, no interactive zoom.

A parse failure, a rejected chunk import, or a render without visible text degrades to the code block with a compact notice; the source stays intact. The import is not retried inside a mount; remounting starts a new attempt.

Every SVG passes DOMPurify (default profile plus `FORBID_TAGS: ['foreignObject']`) before presentation, with `htmlLabels: false` globally. The card wrapper owns the accessible name (`role="img"` with a localized label); the inner svg is `aria-hidden`.

<a id="model-experience"></a>
## Model Experience

None, as this package only presents an existing fence event in the browser without adding model input, tools, or prompt text.

#### KV Cache effect

None; diagram rendering happens entirely in the browser and writes nothing to the Session log.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Embedded SVG icons (`<use>`) are unsupported: DOMPurify always cuts `use`, so a diagram with icons renders without them; a render left with no visible text degrades to the source with a notice.
- Other diagram languages (graphviz, plantuml, d2), export, editing, and rendering outside the chat transcript (session titles, tool cards, `.md` previews) are out of scope.
- The viewer is viewport-fit with the lightbox caps; there is no interactive zoom and no absolute 1:1 mode.
- Every diagram renders fitted to the column; a natural-width horizontal-scroll mode for wide diagrams is absent.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
