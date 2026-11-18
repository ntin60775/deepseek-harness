// @vitest-environment jsdom

import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ImageLightbox } from '../src/ImageLightbox.tsx'
import { Menu } from '../src/Menu.tsx'

afterEach(cleanup)

const labels = { dialog: '原图预览', close: '关闭原图预览' }

describe('ImageLightbox', () => {
  it('focuses its close control, closes by button and Escape, and restores focus', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const onClose = vi.fn()
    const view = render(<ImageLightbox src="blob:original" alt="原图" labels={labels} onClose={onClose} />)
    const close = view.getByRole('button', { name: '关闭原图预览' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(close, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('cycles Tab between the close control and a focusable image', () => {
    const view = render(
      <ImageLightbox src="blob:original" alt="原图" labels={labels} onClose={vi.fn()} contextMenuProps={{ tabIndex: 0 }} />,
    )
    const close = view.getByRole('button', { name: '关闭原图预览' })
    const image = view.getByRole('img')
    expect(document.activeElement).toBe(close)
    // jsdom performs no native Tab traversal; the layer owns the edge wraps.
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(image)
    fireEvent.keyDown(image, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
  })

  it('tolerates a focus owner it cannot restore (opener detached before close)', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const view = render(<ImageLightbox src="blob:original" alt="原图" labels={labels} onClose={vi.fn()} />)
    opener.remove()
    view.unmount()
    expect(document.activeElement).toBe(document.body)
  })

  it('closes on a mask press but not on a press over the image', () => {
    const onClose = vi.fn()
    const view = render(<ImageLightbox src="blob:original" alt="原图" labels={labels} onClose={onClose} />)
    fireEvent.mouseDown(view.getByRole('img'))
    expect(onClose).not.toHaveBeenCalled()
    const mask = view.getByRole('dialog').querySelector('[aria-hidden="true"]') as HTMLElement
    fireEvent.mouseDown(mask)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

/** Owner-controlled menu that closes itself on Escape, as product callers do. */
function DismissingMenu({ onDismissed }: { onDismissed: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <Menu
      open={open}
      autoFocus
      portal
      anchor={null}
      anchorPoint={{ x: 20, y: 20 }}
      items={[{ id: 'copy', label: 'Copy image' }]}
      onClose={() => { setOpen(false); onDismissed() }}
    />
  )
}

it('leaves Escape to an open context menu before closing the image', () => {
  const onClose = vi.fn()
  const onDismissed = vi.fn()
  const view = render(
    <>
      <ImageLightbox src="blob:original" alt="Image" labels={labels} onClose={onClose} />
      <DismissingMenu onDismissed={onDismissed} />
    </>,
  )
  const item = view.getByRole('menuitem', { name: 'Copy image' })
  fireEvent.keyDown(item, { key: 'Escape' })
  expect(onDismissed).toHaveBeenCalledTimes(1)
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.keyDown(view.getByRole('button', { name: '关闭原图预览' }), { key: 'Escape' })
  expect(onClose).toHaveBeenCalledOnce()
})
