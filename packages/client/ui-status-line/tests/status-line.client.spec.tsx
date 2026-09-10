// @vitest-environment jsdom
/** Presentation spec: the band renders exactly the segments its projections
 * carry, formats each figure, and grades context occupancy by threshold. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StatusLine, type StatusLineProps } from '../src/client/StatusLine.tsx'
import { en } from '../src/client/locales.ts'
import { reasoningLevel } from '../src/client/reasoning-level.ts'

afterEach(cleanup)

/** Build props over a scripted projection table. */
function props(values: Record<string, unknown>): StatusLineProps {
  return {
    useProjection: (key: string) => values[key],
    t: (key: keyof typeof en) => en[key],
  } as unknown as StatusLineProps
}

/** One full projection set: half a 200K window, a fast step, and cache reads. */
const full = {
  contextPressure: { contextWindow: 200_000, projectedTokens: 100_000 },
  sessionStats: { turns: 3, steps: 21, decodeMs: 4_000, decodeTokens: 200, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0 },
  tokenUsage: {
    uncachedInputTokens: 8_000, outputTokens: 12_000, cacheReadTokens: 180_000, cacheWriteTokens: 20_000,
  },
}

describe('status line', () => {
  it('renders no band while every projection is absent', () => {
    const { container } = render(<StatusLine {...props({})} />)
    expect(container.firstChild).toBeNull()
  })

  it('carries context occupancy and the input/output split', () => {
    render(<StatusLine {...props(full)} />)
    const band = screen.getByRole('status')
    expect(band.getAttribute('aria-label')).toBe(en.line)
    expect(band.textContent).toContain('50.0%')
    expect(band.textContent).toContain('/200K')
    // 8 000 uncached + 180 000 cache read + 20 000 cache write.
    expect(band.textContent).toContain('208K')
    expect(band.textContent).toContain('12K')
    expect(screen.getByTitle(en.input)).toBeTruthy()
    expect(screen.getByTitle(en.output)).toBeTruthy()
  })

  it('leaves the shipped statistics row to the base UI', () => {
    const { container } = render(<StatusLine {...props(full)} />)
    // The band owns no rule that hides the pills; only its own row is rendered.
    expect(container.querySelectorAll('[data-composer-stats]')).toHaveLength(0)
    expect(container.querySelector('[data-status-line]')).not.toBeNull()
  })

  it('grades occupancy: neutral below half, warning to 90, error above', () => {
    const classOf = (tokens: number): string => {
      cleanup()
      render(<StatusLine {...props({ ...full, contextPressure: { contextWindow: 200_000, projectedTokens: tokens } })} />)
      return screen.getByTitle(en.context).className
    }

    expect(classOf(40_000)).toContain('dsh-status-line__context')
    expect(classOf(150_000)).toContain('dsh-status-line__warn')
    expect(classOf(190_000)).toContain('dsh-status-line__critical')
  })
})

describe('reasoning level', () => {
  it('normalizes the provider spellings and rejects an unknown one', () => {
    expect(reasoningLevel('x-high')).toBe('xhigh')
    expect(reasoningLevel('MED')).toBe('medium')
    expect(reasoningLevel('none')).toBe('off')
    expect(reasoningLevel(undefined)).toBeUndefined()
    expect(reasoningLevel('turbo')).toBeUndefined()
  })

  it('publishes the live level on the document and retracts it on unmount', () => {
    const { unmount } = render(
      <StatusLine
        {...props({
          ...full,
          modelSelection: { lastUsed: null, next: { provider: 'p', model: 'm', reasoningEffort: 'high' } },
        })}
      />,
    )
    expect(document.body.dataset.reasoningLevel).toBe('high')
    unmount()
    expect(document.body.dataset.reasoningLevel).toBeUndefined()
  })
})
