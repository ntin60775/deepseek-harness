// @vitest-environment jsdom
/** The four body states of a mermaid fence and the attempt retry policy. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MermaidFenceLayer } from '../src/client/MermaidFenceLayer.tsx'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { diagramSvg, fenceFixture, t } from './harness.client.ts'

afterEach(() => { cleanup() })

const inner = <p data-testid="inner-code">inner code block</p>

describe('mermaid fence body states', () => {
  it('passes the inner code block through unchanged while streaming', () => {
    const { props, attempts } = fenceFixture({ streaming: true })
    render(<MermaidFenceLayer {...props}>{inner}</MermaidFenceLayer>)
    expect(screen.getByTestId('inner-code')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(attempts).toHaveLength(0)
  })

  it('keeps the code block while the settled chunk loads', () => {
    const { props, attempts } = fenceFixture()
    render(<MermaidFenceLayer {...props}>{inner}</MermaidFenceLayer>)
    expect(screen.getByTestId('inner-code')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText(t('error.notice'))).toBeNull()
    expect(attempts).toHaveLength(1)
  })

  it('renders the sanitized diagram card once the attempt settles', async () => {
    const { props, attempts } = fenceFixture()
    const { container } = render(<MermaidFenceLayer {...props}>{inner}</MermaidFenceLayer>)
    attempts[0]!.settle({ kind: 'rendered', svg: diagramSvg })
    await vi.waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
    expect(screen.queryByTestId('inner-code')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('img').textContent).toContain('Start')
    expect(screen.getByRole('img').textContent).toContain('End')
    expect(screen.getByRole('button', { name: t('source.toggle') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('copy') })).toBeTruthy()
  })

  it('degrades to the code block with a notice on a failed render', async () => {
    const { props, attempts } = fenceFixture()
    render(<MermaidFenceLayer {...props}>{inner}</MermaidFenceLayer>)
    attempts[0]!.settle({ kind: 'failed' })
    await vi.waitFor(() => { expect(screen.getByText(t('error.notice'))).toBeTruthy() })
    expect(screen.getByTestId('inner-code')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(attempts).toHaveLength(1)
  })

  it('ignores a stale result without showing the notice', async () => {
    const { props, attempts } = fenceFixture()
    render(<MermaidFenceLayer {...props}>{inner}</MermaidFenceLayer>)
    attempts[0]!.settle({ kind: 'stale' })
    await Promise.resolve()
    expect(screen.getByTestId('inner-code')).toBeTruthy()
    expect(screen.queryByText(t('error.notice'))).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('starts a new attempt on remount after a failed import', async () => {
    const first = fenceFixture()
    const { unmount } = render(<MermaidFenceLayer {...first.props}>{inner}</MermaidFenceLayer>)
    first.attempts[0]!.settle({ kind: 'failed' })
    await vi.waitFor(() => { expect(screen.getByText(t('error.notice'))).toBeTruthy() })
    unmount()
    const second = fenceFixture()
    render(<MermaidFenceLayer {...second.props}>{inner}</MermaidFenceLayer>)
    expect(second.attempts).toHaveLength(1)
    second.attempts[0]!.settle({ kind: 'rendered', svg: diagramSvg })
    await vi.waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
  })

  it('cancels the attempt when the fence streams again and starts a fresh one on re-settle', async () => {
    const { props, attempts } = fenceFixture()
    const { rerender } = render(<MermaidFenceLayer {...props}>{inner}</MermaidFenceLayer>)
    expect(attempts[0]!.cancelled).toBe(false)
    rerender(<MermaidFenceLayer {...props} streaming>{inner}</MermaidFenceLayer>)
    expect(attempts[0]!.cancelled).toBe(true)
    rerender(<MermaidFenceLayer {...props}>{inner}</MermaidFenceLayer>)
    expect(attempts).toHaveLength(2)
    attempts[1]!.settle({ kind: 'rendered', svg: diagramSvg })
    await vi.waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
  })

  it('starts a new attempt when the theme revision moves', async () => {
    const { props, channel, attempts } = fenceFixture()
    render(<MermaidFenceLayer {...props}>{inner}</MermaidFenceLayer>)
    attempts[0]!.settle({ kind: 'rendered', svg: diagramSvg })
    await vi.waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
    channel.change({ revision: 2 } as ThemeSnapshot)
    await vi.waitFor(() => { expect(attempts).toHaveLength(2) })
    expect(attempts[0]!.cancelled).toBe(true)
    attempts[1]!.settle({ kind: 'rendered', svg: diagramSvg })
    await vi.waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
  })

  it('drops a result that arrives after unmount', async () => {
    const { props, attempts } = fenceFixture()
    const { unmount } = render(<MermaidFenceLayer {...props}>{inner}</MermaidFenceLayer>)
    unmount()
    expect(attempts[0]!.cancelled).toBe(true)
    attempts[0]!.settle({ kind: 'failed' })
    await Promise.resolve()
    expect(screen.queryByText(t('error.notice'))).toBeNull()
  })
})
