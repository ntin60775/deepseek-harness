/** Mermaid fence card: diagram by default, source on toggle, fullscreen viewer. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { CodeBlock, IconFullscreenOutlineRegular, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HocShare, HostObservable, InjectFace, PropsLocale, PropsRuntime, SlotMap } from '@deepseek-ai/dsh-client-ui-slots'
import type { MermaidAttempt } from './render-controller.ts'
import type { MermaidMeasureFace } from './measure.ts'
import { MermaidDiagramViewer } from './MermaidDiagramViewer.tsx'
import { prepareDiagramSvg } from './svg.ts'
import type { MermaidThemeState } from './theme-state.ts'
import css from './MermaidFenceLayer.module.css'

/** Inject face supplied by the plugin apply: theme channel, render attempts, and the measurement face. */
export interface MermaidFenceInjected extends MermaidMeasureFace {
  hooks: { mermaidTheme: HostObservable<MermaidThemeState> }
  /** Start one serialized render attempt for a settled fence source. */
  renderDiagram: (code: string) => MermaidAttempt
}

/** Props of the mermaid fence layer: the fence, the inner content, and the inject face. */
export type MermaidFenceLayerProps = PropsRuntime<'conversation.chat.markdown.fence'>
  & HocShare<SlotMap['conversation.chat.markdown.fence']>
  & PropsLocale<'mermaid'>
  & InjectFace<MermaidFenceInjected>

/** Body state of a settled fence while the render attempt runs or after it settles. */
type BodyState = { kind: 'loading' } | { kind: 'rendered'; svg: string } | { kind: 'failed' }

/** Post-copy confirmation window, matching the code block's copied feedback. */
const COPIED_WINDOW_MS = 1000

/**
 * Render a settled `mermaid` fence as a sanitized SVG card; while the document
 * streams or the library chunk loads, the inner code block stays visible. A
 * parse failure, a rejected import, or a render without visible text degrades
 * to the code block with a compact notice. The card header toggles the source,
 * copies it in both body states, and opens the fullscreen viewer; Enter/Space on
 * the focused diagram wrapper opens the viewer as well. The apply-owned
 * measurement face publishes the card's fit mode from the measure container's
 * pixel width; the component only attaches its ref.
 * @param props - the fence, the inner code block, locale, and the inject face.
 * @returns the fence presentation for its current state.
 */
export function MermaidFenceLayer(
  { lang, code, streaming, children, t, useMermaidTheme, renderDiagram, createDiagramRef }: MermaidFenceLayerProps,
): ReactNode {
  const revision = useMermaidTheme(state => state.revision)
  const [body, setBody] = useState<BodyState>({ kind: 'loading' })
  const [showSource, setShowSource] = useState(false)
  const [viewer, setViewer] = useState<{ scale: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const [diagramRef] = useState(createDiagramRef)
  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (streaming) return
    // A new attempt (theme revision or re-settle) closes the viewer: the card
    // body returns to the code block and the zoom state must not survive it.
    setViewer(null)
    setBody({ kind: 'loading' })
    const attempt = renderDiagram(code)
    let active = true
    void attempt.promise.then((result) => {
      if (!active) return
      if (result.kind === 'rendered') setBody({ kind: 'rendered', svg: result.svg })
      else if (result.kind === 'failed') setBody({ kind: 'failed' })
      // A stale result belongs to a superseded attempt; the newer one owns the body.
    })
    return () => { active = false; attempt.cancel() }
  }, [code, streaming, revision, renderDiagram])

  const onCopy = useCallback(() => {
    if (copied) return
    void writeClipboard(code).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, COPIED_WINDOW_MS)
    })
  }, [code, copied])

  // The open gesture reads the apply-published chat scale; the viewer never
  // recomputes it, and a missing publication is a broken invariant, not a default.
  const openViewer = useCallback(() => {
    const published = cardRef.current?.dataset.fitScale
    if (published === undefined) throw new Error('mermaid card missing data-fit-scale')
    setViewer({ scale: Number(published) })
  }, [])
  const onDiagramKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openViewer()
  }, [openViewer])

  if (streaming) return children
  if (body.kind === 'loading') return children
  if (body.kind === 'failed') {
    return (
      <div className={css.degraded}>
        {children}
        <p className={css.notice}>{t('error.notice')}</p>
      </div>
    )
  }
  return (
    <div ref={cardRef} className={css.card} data-mermaid-card>
      <div className={css.banner}>
        <span className={css.infostring}>{lang}</span>
        <div className={css.spacer} />
        <div className={css.actions}>
          <button type="button" className={css.textButton} aria-pressed={showSource} onClick={() => { setShowSource(value => !value) }}>
            {t('source.toggle')}
          </button>
          <button type="button" className={css.textButton} onClick={onCopy}>
            {copied ? t('copied') : t('copy')}
          </button>
          <button type="button" className={css.iconButton} aria-label={t('viewer.open')} onClick={openViewer}>
            <IconFullscreenOutlineRegular size={14} />
          </button>
        </div>
      </div>
      <div className={css.body}>
        <div ref={diagramRef}>
          {showSource
            ? (
              <div className={css.sourceFlush}>
                <CodeBlock code={code} lang="mermaid" showHeader={false} copyLabel={t('copy')} copiedLabel={t('copied')} />
              </div>
            )
            : (
              <div
                className={css.diagram}
                role="img"
                aria-label={t('diagram.label')}
                tabIndex={0}
                onKeyDown={onDiagramKeyDown}
                dangerouslySetInnerHTML={{ __html: prepareDiagramSvg(body.svg) }}
              />
            )}
        </div>
      </div>
      {viewer !== null && (
        <MermaidDiagramViewer
          svg={body.svg}
          initialScale={viewer.scale}
          diagramLabel={t('diagram.label')}
          scrollLabel={t('viewer.scroll')}
          labels={{ dialog: t('viewer.dialog'), close: t('viewer.close') }}
          zoomLabels={{
            controls: t('zoomControls'),
            menu: t('zoomMenu'),
            out: t('zoomOut'),
            into: t('zoomIn'),
            value: percent => t('zoomValue', { percent }),
          }}
          onClose={() => { setViewer(null) }}
        />
      )}
    </div>
  )
}
