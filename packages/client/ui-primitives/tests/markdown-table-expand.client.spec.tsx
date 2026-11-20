// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { MarkdownLabels } from '../src/index.ts'
import { MarkdownText } from './markdown-test-components.tsx'
import { markdownLabels as defaultMarkdownLabels } from './labels.client.ts'

afterEach(cleanup)

const tableLabels = { expand: 'Expand table', dialog: 'Table preview', close: 'Close table preview' }
const labels: MarkdownLabels = { ...defaultMarkdownLabels, table: tableLabels }
const wide = '| C1 | C2 | C3 | C4 |\n| --- | --- | --- | --- |\n| a | b | c | d |'
const narrow = '| C1 | C2 |\n| --- | --- |\n| a | b |'

it('opens a wide table in the shared lightbox and restores focus to the expand control', () => {
  render(<MarkdownText text={wide} labels={labels} />)
  const trigger = screen.getByRole('button', { name: 'Expand table' })
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Table preview' })
  expect(dialog.querySelector('table')?.textContent).toContain('a')
  expect(dialog.querySelector('table')?.textContent).toContain('d')
  fireEvent.keyDown(window, { key: 'Tab' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close table preview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close table preview' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it('closes the table preview on Escape', () => {
  render(<MarkdownText text={wide} labels={labels} />)
  fireEvent.click(screen.getByRole('button', { name: 'Expand table' }))
  expect(screen.getByRole('dialog', { name: 'Table preview' })).toBeTruthy()
  fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('offers no expand control for narrow tables, missing labels, or streaming documents', () => {
  const { rerender } = render(<MarkdownText text={narrow} labels={labels} />)
  expect(screen.queryByRole('button', { name: 'Expand table' })).toBeNull()
  rerender(<MarkdownText text={wide} />)
  expect(screen.queryByRole('button', { name: 'Expand table' })).toBeNull()
  rerender(<MarkdownText text={wide} labels={labels} streaming />)
  expect(screen.queryByRole('button', { name: 'Expand table' })).toBeNull()
  rerender(<MarkdownText text={wide} labels={labels} />)
  expect(screen.getByRole('button', { name: 'Expand table' })).toBeTruthy()
})

it('keeps the wide table inside a scrolling block wrapper without labels', () => {
  const { container } = render(<MarkdownText text={wide} />)
  const table = container.querySelector('table')!
  const wrapper = table.parentElement!
  expect(wrapper.className).toContain('md-table-wide')
  expect(wrapper.querySelector('button')).toBeNull()
  expect(table.childElementCount).toBe(2)
})
