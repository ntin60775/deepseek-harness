// @vitest-environment jsdom
/** The lazy mermaid entry wires the global singleton config and sanitize. */
import { describe, expect, it, vi } from 'vitest'
import { renderMermaid } from '../src/client/mermaid-entry.ts'
import type { MermaidThemeVariables } from '../src/client/theme-variables.ts'

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn<(id: string, code: string) => Promise<{ svg: string }>>(),
}))
vi.mock('mermaid', () => ({ default: mermaid }))

const variables = { primaryColor: 'rgb(1, 2, 3)', fontSize: '13px', fontFamily: 'inherit' } as MermaidThemeVariables
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Label</text></svg>'

describe('mermaid entry', () => {
  it('initializes the strict htmlLabels-off base theme and sanitizes the output', async () => {
    mermaid.render.mockResolvedValueOnce({ svg })
    const result = await renderMermaid('dsh-mermaid-1', 'flowchart LR\n A-->B', variables)
    expect(mermaid.initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      htmlLabels: false,
      themeVariables: variables,
      suppressErrorRendering: true,
    })
    expect(mermaid.render).toHaveBeenCalledWith('dsh-mermaid-1', 'flowchart LR\n A-->B')
    expect(result).toContain('Label')
  })

  it('propagates a parse failure', async () => {
    mermaid.render.mockRejectedValueOnce(new Error('Parse error on line 2'))
    await expect(renderMermaid('dsh-mermaid-2', 'bad', variables)).rejects.toThrow('Parse error on line 2')
  })

  it('degrades a render without visible text', async () => {
    mermaid.render.mockResolvedValueOnce({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>text{}</style></svg>' })
    await expect(renderMermaid('dsh-mermaid-3', 'flowchart LR\n A[" "]-->B[" "]', variables)).rejects.toThrow('no visible text')
  })
})
