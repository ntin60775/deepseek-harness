/** Shared fixture runtime for the mermaid fence component specs. */
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi } from 'vitest'
import { en } from '../src/client/locales.ts'
import type { MermaidFenceLayerProps } from '../src/client/MermaidFenceLayer.tsx'
import { createMermaidMeasureFace } from '../src/client/measure.ts'
import type { MermaidAttempt, MermaidRenderResult } from '../src/client/render-controller.ts'
import { createMermaidThemeChannel, type MermaidThemeChannel } from '../src/client/theme-state.ts'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Controllable ResizeObserver stand-in: jsdom has no layout and no ResizeObserver. */
export class FakeResizeObserver implements ResizeObserver {
  static readonly made: FakeResizeObserver[] = []
  readonly observe = vi.fn()
  readonly unobserve = vi.fn()
  readonly disconnect = vi.fn()
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.made.push(this)
  }

  /** Deliver one coalesced callback, as the browser does per frame. */
  fire(): void {
    this.callback([], this)
  }
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver)

/** Locale seat stub over the package dictionary and the shared common vocabulary. */
export const t = makeTranslate(en, commonEn)

interface Vector { name: string; source: string; svg: string }
const vectors = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/sanitize-vectors.json'), 'utf8')) as Vector[]

/** Recorded production-form flowchart SVG the component specs render. */
export const diagramSvg = vectors.find(entry => entry.name === 'flowchart-html-label')!.svg
/** Recorded wide Cyrillic diagram for the viewer encoding path. */
export const wideSvg = vectors.find(entry => entry.name === 'wide-cyrillic')!.svg
/** Settled fence source matching the recorded flowchart vector. */
export const diagramCode = vectors.find(entry => entry.name === 'flowchart-html-label')!.source

/** One controllable attempt: the test settles its promise and observes cancellation. */
export interface StubAttempt extends MermaidAttempt {
  settle(result: MermaidRenderResult): void
  readonly cancelled: boolean
}

/** Create an attempt stub whose settlement the test drives. */
export function stubAttempt(): StubAttempt {
  let settle!: (result: MermaidRenderResult) => void
  const promise = new Promise<MermaidRenderResult>((resolve) => { settle = resolve })
  let cancelled = false
  return {
    promise,
    settle,
    cancel: () => { cancelled = true },
    get cancelled() { return cancelled },
  }
}

/** Props fixture with a live theme channel; each render attempt gets a fresh controllable stub. */
export function fenceFixture(options: { streaming?: boolean; code?: string; minFitScale?: number } = {}) {
  const channel: MermaidThemeChannel = createMermaidThemeChannel({ revision: 1 } as ThemeSnapshot)
  const attempts: StubAttempt[] = []
  const renderDiagram = (code: string): MermaidAttempt => {
    void code
    const attempt = stubAttempt()
    attempts.push(attempt)
    return attempt
  }
  const measure = createMermaidMeasureFace({ minFitScale: options.minFitScale ?? 0.85 })
  const props = {
    lang: 'mermaid',
    code: options.code ?? diagramCode,
    streaming: options.streaming ?? false,
    t,
    useMermaidTheme: bindSnapshotSelector(channel.source),
    renderDiagram,
    createDiagramRef: measure.createDiagramRef,
  } as MermaidFenceLayerProps
  return { props, channel, attempts }
}
