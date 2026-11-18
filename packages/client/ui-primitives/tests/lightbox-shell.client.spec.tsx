// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { LightboxShell } from '../src/LightboxShell.tsx'

afterEach(cleanup)

const labels = { dialog: '预览', close: '关闭预览' }

describe('LightboxShell', () => {
  it('focuses the close control over consumer content and cycles Tab across both', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const view = render(
      <LightboxShell labels={labels} onClose={vi.fn()}>
        <button type="button">content</button>
      </LightboxShell>,
    )
    const close = view.getByRole('button', { name: '关闭预览' })
    const content = view.getByRole('button', { name: 'content' })
    expect(document.activeElement).toBe(close)
    // jsdom performs no native Tab traversal; the layer owns the edge wraps.
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(content)
    fireEvent.keyDown(content, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('closes on Escape, close press, and mask press but not on content press', () => {
    const onClose = vi.fn()
    const view = render(
      <LightboxShell labels={labels} onClose={onClose}>
        <button type="button">content</button>
      </LightboxShell>,
    )
    fireEvent.mouseDown(view.getByRole('button', { name: 'content' }))
    expect(onClose).not.toHaveBeenCalled()
    const mask = view.getByRole('dialog').querySelector('[aria-hidden="true"]') as HTMLElement
    fireEvent.mouseDown(mask)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(view.getByRole('button', { name: '关闭预览' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(view.getByRole('button', { name: '关闭预览' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('prevents Escape default without stopping propagation, like the shared modal contract', () => {
    const view = render(
      <LightboxShell labels={labels} onClose={vi.fn()}>
        <button type="button">content</button>
      </LightboxShell>,
    )
    let prevented = false
    const probe = (event: KeyboardEvent): void => { prevented = event.defaultPrevented }
    // A window probe observes stopPropagation; a document probe could not.
    window.addEventListener('keydown', probe)
    try {
      fireEvent.keyDown(view.getByRole('button', { name: '关闭预览' }), { key: 'Escape' })
    } finally { window.removeEventListener('keydown', probe) }
    expect(prevented).toBe(true)
  })
})
