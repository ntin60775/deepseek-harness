// @vitest-environment jsdom
/** Card header: source swap, copy in both states, viewer open, focus, keyboard. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MermaidFenceLayer } from '../src/client/MermaidFenceLayer.tsx'
import { diagramCode, diagramSvg, fenceFixture, t, wideSvg } from './harness.client.ts'

afterEach(() => { cleanup() })

const inner = <p data-testid="inner-code">inner code block</p>

async function renderedCard(svg: string = diagramSvg) {
  const fixture = fenceFixture()
  const view = render(<MermaidFenceLayer {...fixture.props}>{inner}</MermaidFenceLayer>)
  fixture.attempts[0]!.settle({ kind: 'rendered', svg })
  await vi.waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
  return { ...view, fixture }
}

describe('mermaid card header and viewer', () => {
  it('swaps the body to the headerless source block and back, tracking aria-pressed', async () => {
    const { container } = await renderedCard()
    const toggle = screen.getByRole('button', { name: t('source.toggle') })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('img')).toBeNull()
    const pre = container.querySelector('pre')
    expect(pre?.textContent).toContain('flowchart LR')
    expect(pre?.textContent).toContain('Start <b>bold</b>')
    // The card owns the toolbar: the swapped CodeBlock draws no header of its own.
    expect(container.querySelectorAll('[class*="banner"]').length).toBe(1)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it('copies the exact source in the diagram state and in the source state', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await renderedCard()
    fireEvent.click(screen.getByRole('button', { name: t('copy') }))
    await vi.waitFor(() => { expect(writeText).toHaveBeenCalledWith(diagramCode) })
    await vi.waitFor(() => { expect(screen.getByRole('button', { name: t('copied') })).toBeTruthy() })
    // The copied confirmation window closes before the second copy gesture.
    await vi.waitFor(() => { expect(screen.getByRole('button', { name: t('copy') })).toBeTruthy() }, { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: t('source.toggle') }))
    writeText.mockClear()
    fireEvent.click(screen.getByRole('button', { name: t('copy') }))
    await vi.waitFor(() => { expect(writeText).toHaveBeenCalledWith(diagramCode) })
  })

  it('opens the chat-scale viewer from the header button and closes on Escape with focus restore', async () => {
    await renderedCard(wideSvg)
    const wrapper = screen.getByRole('img')
    wrapper.focus()
    fireEvent.click(screen.getByRole('button', { name: t('viewer.open') }))
    const dialog = await screen.findByRole('dialog', { name: t('viewer.dialog') })
    // The viewer holds live vector SVG at the chat scale, not a raster data URL.
    expect(dialog.querySelector('img')).toBeNull()
    const viewerWrapper = dialog.querySelector('[role="img"]') as HTMLElement
    expect(viewerWrapper.getAttribute('aria-label')).toBe(t('diagram.label'))
    expect(viewerWrapper.querySelector('svg')).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(document.activeElement).toBe(wrapper)
  })

  it('opens the viewer with Enter and Space on the focused wrapper', async () => {
    await renderedCard()
    const wrapper = screen.getByRole('img')
    wrapper.focus()
    fireEvent.keyDown(wrapper, { key: 'Enter' })
    expect(await screen.findByRole('dialog', { name: t('viewer.dialog') })).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    fireEvent.keyDown(wrapper, { key: ' ' })
    expect(await screen.findByRole('dialog', { name: t('viewer.dialog') })).toBeTruthy()
  })

  it('ignores other keys on the wrapper', async () => {
    await renderedCard()
    fireEvent.keyDown(screen.getByRole('img'), { key: 'a' })
    await Promise.resolve()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('copies once per confirmation window and keeps the idle label when the host refuses', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await renderedCard()
    const copy = screen.getByRole('button', { name: t('copy') })
    fireEvent.click(copy)
    await vi.waitFor(() => { expect(screen.getByRole('button', { name: t('copied') })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: t('copied') }))
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledTimes(1)
    writeText.mockRejectedValueOnce(new Error('denied'))
    await vi.waitFor(() => { expect(screen.getByRole('button', { name: t('copy') })).toBeTruthy() }, { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: t('copy') }))
    await Promise.resolve()
    expect(screen.queryByRole('button', { name: t('copied') })).toBeNull()
  })
})

describe('mermaid card accessibility projection', () => {
  it('names the wrapper and hides the inner svg from the accessibility tree', async () => {
    const { container } = await renderedCard()
    const wrapper = screen.getByRole('img', { name: t('diagram.label') })
    expect(wrapper.getAttribute('tabindex')).toBe('0')
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('aria-labelledby')).toBeNull()
    // Exactly one img role reaches the accessibility tree: the wrapper.
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })
})
