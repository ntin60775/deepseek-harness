import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openMcpSession } from '../src/mcp.ts'
import type { McpToolSession } from '../src/mcp.ts'
import { startZaiMcpFixture } from './fixture.ts'
import type { ZaiMcpFixture } from './fixture.ts'

let fixture: ZaiMcpFixture
let session: McpToolSession

beforeAll(async () => {
  fixture = await startZaiMcpFixture()
  session = await openMcpSession(fixture.url, 'test-key', 5_000)
})

afterAll(async () => {
  await session.close()
  await fixture.close()
})

describe('openMcpSession', () => {
  it('sends the API key as a bearer authorization header', () => {
    expect(fixture.authorization).toContain('Bearer test-key')
  })

  it('returns the decoded tool text for a successful call', async () => {
    const outcome = await session.callTool('web_search_prime', { search_query: 'q' })
    expect(outcome.isError).toBe(false)
    const decoded: unknown = JSON.parse(outcome.text)
    expect(typeof decoded).toBe('string')
  })

  it('forwards a caller signal to the tool call', async () => {
    const controller = new AbortController()
    await expect(session.callTool('web_search_prime', { search_query: 'q' }, controller.signal))
      .resolves.toMatchObject({ isError: false })
  })

  it('reports a tool-level failure with its text', async () => {
    await expect(session.callTool('web_search_prime', { search_query: 'tool-error' }))
      .resolves.toEqual({ isError: true, text: 'quota exhausted' })
  })

  it('reports a tool-level failure without any text blocks', async () => {
    await expect(session.callTool('web_search_prime', { search_query: 'tool-error-silent' }))
      .resolves.toEqual({ isError: true, text: '' })
  })
})
