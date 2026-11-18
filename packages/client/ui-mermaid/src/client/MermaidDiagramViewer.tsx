/** Fullscreen diagram viewer: live sanitized SVG at the chat scale with catalog zoom. */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LightboxShell, ZoomControls } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DocumentZoomLabels, LightboxShellLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import { prepareViewerSvg } from './svg.ts'
import css from './MermaidDiagramViewer.module.css'

/** Props of the internal mermaid diagram viewer. */
export interface MermaidDiagramViewerProps {
  /** Sanitized settled diagram SVG of the card body. */
  svg: string
  /** Effective chat scale read from the card's `data-fit-scale` at the open gesture. */
  initialScale: number
  /** Accessible name of the diagram wrapper. */
  diagramLabel: string
  /** Accessible name of the scrolling viewport. */
  scrollLabel: string
  /** Dialog and close-control strings. */
  labels: LightboxShellLabels
  /** Zoom toolbar strings, including the percent formatter. */
  zoomLabels: DocumentZoomLabels
  /** Dismiss callback owned by the fence layer. */
  onClose: () => void
}

/** The viewer toolbar stays visible; activity reporting serves auto-hiding document renderers only. */
function ignoreActivity(): void {}

/**
 * Present the settled diagram as live vector SVG inside the shared lightbox
 * chrome: a scrolling viewport centers smaller diagrams through auto margins
 * and keeps the start reachable when the scaled diagram overflows. Zoom uses
 * the catalog ZoomControls with DOCUMENT_ZOOM semantics; the scale state is
 * local and starts at the chat scale, never recomputed from layout.
 * @param props - sanitized svg, initial chat scale, labels, and dismiss callback.
 * @returns the fullscreen diagram viewer.
 */
export function MermaidDiagramViewer(
  { svg, initialScale, diagramLabel, scrollLabel, labels, zoomLabels, onClose }: MermaidDiagramViewerProps,
): ReactNode {
  const [scale, setScale] = useState(initialScale)
  const html = useMemo(() => prepareViewerSvg(svg, scale), [svg, scale])
  return (
    <LightboxShell labels={labels} onClose={onClose}>
      <div className={css.viewport} tabIndex={0} aria-label={scrollLabel}>
        <div className={css.inner}>
          <div
            className={css.diagram}
            role="img"
            aria-label={diagramLabel}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
      <ZoomControls
        zoom={scale}
        labels={zoomLabels}
        visible
        className={css.toolbar}
        onZoom={setScale}
        onActiveChange={ignoreActivity}
      />
    </LightboxShell>
  )
}
