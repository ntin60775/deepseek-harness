# Agent Note: The mermaid viewer opens the live diagram at the chat scale

Status: implemented

## Problem

The mermaid card's viewer serialized the rendered SVG into a `data:` URL and showed it as an image in the image lightbox, which fits its content to the viewport. A diagram then changed scale on open — the reader lost the size they had just been reading — and the raster `<img>` blurred vector output. The card already resolves a chat scale, the platform already owns a modal chrome on `useModalLayer`, and the catalog already owns a zoom control, so the viewer decision is where the diagram's scale and zoom state live, and which chrome owns the modal.

## Decision

The viewer shows the live sanitized SVG at the chat scale the card publishes and zooms it with the catalog control. `MermaidDiagramViewer` is an internal component of [ui-mermaid](../../../../packages/client/ui-mermaid/README.md#diagram-viewer); the fence layer mounts it in the `LightboxShell` chrome and hands it the card's `data-fit-scale` at the open gesture. The viewer never recomputes the scale: a missing published value throws instead of defaulting, and the scale state is local to the open viewer, starting at the chat scale. Explicit `width`/`height` follow `W·s` and `H·s` from the viewBox, and the inline `max-width`/`width` mermaid writes on the injected root are removed, because a scale above the chat scale would otherwise be a visual no-op.

`LightboxShell` in `ui-primitives` owns the modal chrome on the existing `useModalLayer`: body portal, dimming mask, close control carrying initial focus, Escape that yields to an open menu, Tab across every focusable control, and focus restore. `ImageLightbox` renders on the same shell with unchanged props and consumer behavior, so the image preview, message images, composer attachments, markdown preview, and stats consumers share one modal contract; `useModalLayer` itself does not change.

Zoom is the catalog `ZoomControls` with `DOCUMENT_ZOOM` semantics — additive 0.25 steps, clamp `[0.25, 4]`, fixed presets and the percentage menu — and no fitting row. The viewer mounts it at the stage's bottom edge, keeps the close control in the top-right corner, and places the diagram in a scroll viewport that centers a smaller diagram through auto margins and keeps the start reachable when the scaled diagram overflows on either axis, with no JavaScript measurement. A theme revision closes the viewer and restores focus to the card button when it is still connected; the next open starts again from the chat scale.

## Alternatives considered

- **Keep the `data:` URL image in the viewport-fit lightbox**: the lightbox caps fit the diagram to the viewport, so its scale carries no relation to the chat, and the raster blurs the vector output. Rejected at the [viewer plan gate](../../../../docs/plans/mermaid-viewer-scale-zoom.md).
- **Open the live SVG but fit it to the viewer viewport**: a live SVG fixes the raster blur and leaves the scale wrong; the operator requirement is that the diagram keeps its chat size and overflows into scrollbars.
- **A separate +/− stepper with multiplicative steps**: the catalog `ZoomControls` already owns steps, clamps, presets, and percentage display for document renderers; a second control would fork that semantics and its locales.
- **JavaScript-measured centering**: auto margins on the inner box center a smaller diagram and collapse to zero on the overflowing sides, so the scroll start stays reachable without measuring the stage.
- **Wheel zoom and drag pan**: not requested; the toolbar is the zoom surface, and reusing it keeps the viewer free of pointer gesture state.

## Consequences

The viewer is internal, so `ui-mermaid` gains no public export. The modal chrome now has one owner: a dialog-contract change lands for every preview surface at once, and image caps and `object-fit` stay in `ImageLightbox` CSS. A diagram wider than the stage at the opened scale overflows inside the viewer and scrolls instead of shrinking; zoom is per open and does not survive a theme revision, which closes the viewer. The viewer reads `data-fit-scale` only, so the fit rule keeps its single owner in the card.

Verification: viewer component specs (chat scale from the dataset, fail loud without it, catalog steps and clamps on the toolbar, theme revision closes the viewer), the viewer CSS-module style spec, [mermaid-fence.e2e.ts](../../../../apps/web/tests/mermaid-fence.e2e.ts) (live svg inside the dialog, no `data:` image), [mermaid-viewer.e2e.ts](../../../../apps/web/tests/mermaid-viewer.e2e.ts) (numeric chat-scale equality in both fit modes, catalog grid step, overflow extents with reachable edges, dialog ARIA golden), and the image-lightbox consumer pins (markdown-images, context-menus, file-upload-round).