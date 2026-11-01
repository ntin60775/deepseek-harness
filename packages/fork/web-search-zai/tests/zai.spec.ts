import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime, { WebError } from '@deepseek-ai/dsh-web'
import type { WebFetchProvider } from '@deepseek-ai/dsh-web'
import {
  decodeToolPayload,
  mapReaderPayload,
  mapSearchPayload,
  ZaiFetchProvider,
  ZaiSearchProvider,
  ZAI_DEFAULT_READER_URL,
  ZAI_DEFAULT_SEARCH_URL,
} from '../src/provider.ts'
import type { McpToolOutcome, McpToolSession, OpenMcpSession } from '../src/mcp.ts'
import { apply } from '../src/index.ts'
import * as plugin from '../src/index.ts'
import { startZaiMcpFixture } from './fixture.ts'

const baseOptions = {
  searchURL: 'https://search.test/mcp',
  readerURL: 'https://reader.test/mcp',
  timeoutMs: 1_000,
  resolveApiKey: async () => 'zai-key',
  contentSize: 'medium' as const,
  recency: 'noLimit' as const,
  location: 'us' as const,
}

/** One recorded session-open call. */
interface RecordedOpen {
  readonly url: string
  readonly apiKey: string
  readonly timeoutMs: number
}

/** Wrap a session factory and record every open call. */
function recordingOpen(factory: () => Promise<McpToolSession>): { open: OpenMcpSession; opens: RecordedOpen[] } {
  const opens: RecordedOpen[] = []
  return {
    opens,
    open: async (url, apiKey, timeoutMs) => {
      opens.push({ url, apiKey, timeoutMs })
      return await factory()
    },
  }
}

/** A session whose tool calls are served by the given handler. */
function fakeSession(
  handler: (name: string, args: Record<string, unknown>) => McpToolOutcome | Promise<McpToolOutcome>,
): McpToolSession & { calls: Array<{ name: string; args: Record<string, unknown> }>; closed: boolean } {
  const session = {
    calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    closed: false,
    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolOutcome> {
      session.calls.push({ name, args })
      return await handler(name, args)
    },
    async close() {
      session.closed = true
    },
  }
  return session
}

/** A free fetcher that answers with a fixed body. */
function fakeFallback(): WebFetchProvider & { calls: number } {
  const state = {
    calls: 0,
    id: 'http',
    available: () => true,
    async fetch(request: { url: string }) {
      state.calls += 1
      return {
        url: request.url,
        statusCode: 200,
        body: { kind: 'text' as const, content: 'fallback body' },
        truncated: false,
      }
    },
  }
  return state
}

/** Encode a payload the way z.ai does: JSON text inside a JSON string. */
function encodePayload(payload: unknown): string {
  return JSON.stringify(JSON.stringify(payload))
}

const SEARCH_ITEMS = [{ title: 'Title', link: 'https://example.test/a', content: 'Snippet', refer: 'ref_1' }]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('tool payload decoding', () => {
  it('decodes the double-encoded payload z.ai returns', () => {
    expect(decodeToolPayload(encodePayload(SEARCH_ITEMS))).toEqual(SEARCH_ITEMS)
  })

  it('keeps a singly encoded payload as is', () => {
    expect(decodeToolPayload(JSON.stringify(SEARCH_ITEMS))).toEqual(SEARCH_ITEMS)
  })
})

describe('search payload mapping', () => {
  it('maps a full result', () => {
    expect(mapSearchPayload(SEARCH_ITEMS)).toEqual({
      sources: [{ url: 'https://example.test/a', title: 'Title', snippet: 'Snippet' }],
      truncated: false,
    })
  })

  it('drops entries without a usable link and omits empty fields', () => {
    expect(mapSearchPayload([
      null,
      'not an object',
      { title: 'No link' },
      { link: '' },
      { link: 'https://example.test/kept', title: '', content: '' },
    ]).sources).toEqual([{ url: 'https://example.test/kept' }])
  })

  it('rejects a payload that is not an array', () => {
    expect(() => mapSearchPayload({ results: [] }))
      .toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })
})

describe('reader payload mapping', () => {
  it('maps content and the reported URL', () => {
    expect(mapReaderPayload({ url: 'https://example.test/final', content: '# Body' }))
      .toEqual({ content: '# Body', url: 'https://example.test/final' })
  })

  it('omits a missing URL', () => {
    expect(mapReaderPayload({ content: 'body' })).toEqual({ content: 'body' })
  })

  it('rejects a payload that is not an object', () => {
    expect(() => mapReaderPayload('body'))
      .toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('rejects a payload without content', () => {
    expect(() => mapReaderPayload({ content: '' }))
      .toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })
})

describe('ZaiSearchProvider', () => {
  it('opens the search endpoint and sends every configured search argument', async () => {
    const session = fakeSession(() => ({ isError: false, text: encodePayload(SEARCH_ITEMS) }))
    const { open, opens } = recordingOpen(async () => session)
    await expect(new ZaiSearchProvider({ ...baseOptions, openSession: open }).search({ query: 'q' }))
      .resolves.toEqual({
        sources: [{ url: 'https://example.test/a', title: 'Title', snippet: 'Snippet' }],
        truncated: false,
      })
    expect(opens).toEqual([{ url: baseOptions.searchURL, apiKey: 'zai-key', timeoutMs: 1_000 }])
    expect(session.calls[0]).toEqual({
      name: 'web_search_prime',
      args: {
        search_query: 'q',
        content_size: 'medium',
        search_recency_filter: 'noLimit',
        location: 'us',
      },
    })
  })

  it('reuses one session across calls with the same credential', async () => {
    const session = fakeSession(() => ({ isError: false, text: encodePayload(SEARCH_ITEMS) }))
    const { open, opens } = recordingOpen(async () => session)
    const provider = new ZaiSearchProvider({ ...baseOptions, openSession: open })
    await provider.search({ query: 'first' })
    await provider.search({ query: 'second' })
    expect(opens).toHaveLength(1)
    await provider.dispose()
    expect(session.closed).toBe(true)
  })

  it('reopens when the credential changes and closes the previous session', async () => {
    const first = fakeSession(() => ({ isError: false, text: encodePayload([]) }))
    const second = fakeSession(() => ({ isError: false, text: encodePayload([]) }))
    const sessions = [first, second]
    const { open, opens } = recordingOpen(async () => sessions.shift() ?? second)
    let key = 'key-1'
    const provider = new ZaiSearchProvider({ ...baseOptions, resolveApiKey: async () => key, openSession: open })
    await provider.search({ query: 'a' })
    key = 'key-2'
    await provider.search({ query: 'b' })
    expect(opens.map(entry => entry.apiKey)).toEqual(['key-1', 'key-2'])
    await vi.waitFor(() => { expect(first.closed).toBe(true) })
  })

  it('does not clear a newer session when an older attempt fails late', async () => {
    const firstAttempt: PromiseWithResolvers<McpToolSession> = Promise.withResolvers()
    const session = fakeSession(() => ({ isError: false, text: encodePayload([]) }))
    let attempt = 0
    const { open } = recordingOpen(async () => {
      attempt += 1
      return attempt === 1 ? await firstAttempt.promise : session
    })
    let key = 'key-1'
    const provider = new ZaiSearchProvider({ ...baseOptions, resolveApiKey: async () => key, openSession: open })
    const firstSearch = provider.search({ query: 'a' })
    key = 'key-2'
    await expect(provider.search({ query: 'b' })).resolves.toEqual({ sources: [], truncated: false })
    firstAttempt.reject(new Error('late failure'))
    await expect(firstSearch).rejects.toThrow('late failure')
    await expect(provider.search({ query: 'c' })).resolves.toEqual({ sources: [], truncated: false })
    expect(attempt).toBe(2)
  })

  it('fails with the configured-unavailable code when the credential is missing', async () => {
    const { open } = recordingOpen(async () => fakeSession(() => ({ isError: false, text: encodePayload([]) })))
    await expect(new ZaiSearchProvider({ ...baseOptions, resolveApiKey: async () => undefined, openSession: open }).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' }))
    await expect(new ZaiSearchProvider({ ...baseOptions, resolveApiKey: async () => '', openSession: open }).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' }))
  })

  it('reports a tool failure with its text and without one', async () => {
    const failing = fakeSession(() => ({ isError: true, text: 'quota exhausted' }))
    const { open } = recordingOpen(async () => failing)
    await expect(new ZaiSearchProvider({ ...baseOptions, openSession: open }).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ message: 'z.ai web search failed: quota exhausted' }))
    const silent = fakeSession(() => ({ isError: true, text: '' }))
    const second = recordingOpen(async () => silent)
    await expect(new ZaiSearchProvider({ ...baseOptions, openSession: second.open }).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ message: 'z.ai web search failed: the tool reported an error' }))
  })

  it('maps a tool-call abort to WEB_ABORTED and reconnects on the next call', async () => {
    const controller = new AbortController()
    const session = fakeSession(() => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    const { open, opens } = recordingOpen(async () => session)
    const provider = new ZaiSearchProvider({ ...baseOptions, openSession: open })
    await expect(provider.search({ query: 'q' }, controller.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
    await expect(provider.search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    expect(opens).toHaveLength(2)
  })

  it('passes an already-classified WebError through unchanged', async () => {
    const session = fakeSession(() => { throw new WebError('already classified', 'WEB_PROVIDER_ERROR') })
    const { open } = recordingOpen(async () => session)
    await expect(new ZaiSearchProvider({ ...baseOptions, openSession: open }).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ message: 'already classified' }))
  })

  it('maps a transport failure to WEB_PROVIDER_ERROR', async () => {
    const session = fakeSession(() => { throw new Error('socket closed') })
    const { open } = recordingOpen(async () => session)
    await expect(new ZaiSearchProvider({ ...baseOptions, openSession: open }).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'z.ai MCP request failed: Error: socket closed' }))
  })

  it('drops a failed connection attempt so the next call retries', async () => {
    const session = fakeSession(() => ({ isError: false, text: encodePayload([]) }))
    let attempt = 0
    const { open, opens } = recordingOpen(async () => {
      attempt += 1
      if (attempt === 1) throw new Error('connect failed')
      return session
    })
    const provider = new ZaiSearchProvider({ ...baseOptions, openSession: open })
    await expect(provider.search({ query: 'q' })).rejects.toThrow('connect failed')
    await expect(provider.search({ query: 'q' })).resolves.toEqual({ sources: [], truncated: false })
    expect(opens).toHaveLength(2)
  })

  it('reports availability from the endpoint only', () => {
    expect(new ZaiSearchProvider(baseOptions).available()).toBe(true)
    expect(new ZaiSearchProvider({ ...baseOptions, searchURL: 'not a url' }).available()).toBe(false)
  })

  it('ignores a close failure while disposing', async () => {
    const session = fakeSession(() => ({ isError: false, text: encodePayload([]) }))
    session.close = async () => { throw new Error('close failed') }
    const { open } = recordingOpen(async () => session)
    const provider = new ZaiSearchProvider({ ...baseOptions, openSession: open })
    await provider.search({ query: 'q' })
    await expect(provider.dispose()).resolves.toBeUndefined()
  })

  it('disposes without a session', async () => {
    await expect(new ZaiSearchProvider(baseOptions).dispose()).resolves.toBeUndefined()
  })

  it('uses the public endpoints by default', () => {
    expect(ZAI_DEFAULT_SEARCH_URL).toBe('https://api.z.ai/api/mcp/web_search_prime/mcp')
    expect(ZAI_DEFAULT_READER_URL).toBe('https://api.z.ai/api/mcp/web_reader/mcp')
  })
})

describe('ZaiFetchProvider', () => {
  it('returns the extracted page as text', async () => {
    const session = fakeSession(() => ({
      isError: false,
      text: encodePayload({ title: 'Example', url: 'https://example.test/final', content: '# Body' }),
    }))
    const { open, opens } = recordingOpen(async () => session)
    await expect(new ZaiFetchProvider({ ...baseOptions, openSession: open }).fetch({ url: 'https://example.test' }))
      .resolves.toEqual({
        url: 'https://example.test/final',
        statusCode: 200,
        body: { kind: 'text', content: '# Body' },
        truncated: false,
      })
    expect(opens[0]?.url).toBe(baseOptions.readerURL)
    expect(session.calls[0]).toEqual({
      name: 'webReader',
      args: { url: 'https://example.test', return_format: 'markdown' },
    })
  })

  it('keeps the request URL when the reader reports none', async () => {
    const session = fakeSession(() => ({ isError: false, text: encodePayload({ content: 'body' }) }))
    const { open } = recordingOpen(async () => session)
    await expect(new ZaiFetchProvider({ ...baseOptions, openSession: open }).fetch({ url: 'https://example.test' }))
      .resolves.toMatchObject({ url: 'https://example.test' })
  })

  it('falls back to the free fetcher when the reader fails', async () => {
    const session = fakeSession(() => ({ isError: true, text: 'crawl quota' }))
    const { open } = recordingOpen(async () => session)
    const free = fakeFallback()
    await expect(new ZaiFetchProvider({ ...baseOptions, openSession: open, fetchFallback: free }).fetch({ url: 'https://example.test' }))
      .resolves.toMatchObject({ body: { kind: 'text', content: 'fallback body' } })
    expect(free.calls).toBe(1)
  })

  it('falls back when the reader returns no content', async () => {
    const session = fakeSession(() => ({ isError: false, text: encodePayload({ url: 'https://example.test' }) }))
    const { open } = recordingOpen(async () => session)
    const free = fakeFallback()
    await expect(new ZaiFetchProvider({ ...baseOptions, openSession: open, fetchFallback: free }).fetch({ url: 'https://example.test' }))
      .resolves.toMatchObject({ body: { kind: 'text', content: 'fallback body' } })
  })

  it('surfaces the paid failure when no fallback is configured', async () => {
    const session = fakeSession(() => ({ isError: true, text: '' }))
    const { open } = recordingOpen(async () => session)
    await expect(new ZaiFetchProvider({ ...baseOptions, openSession: open }).fetch({ url: 'https://example.test' }))
      .rejects.toThrow(expect.objectContaining({
        code: 'WEB_PROVIDER_ERROR',
        message: 'z.ai reader failed: the tool reported an error',
      }))
  })

  it('does not fall back on cancellation', async () => {
    const controller = new AbortController()
    const session = fakeSession(() => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    const { open } = recordingOpen(async () => session)
    const free = fakeFallback()
    await expect(new ZaiFetchProvider({ ...baseOptions, openSession: open, fetchFallback: free })
      .fetch({ url: 'https://example.test' }, controller.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
    expect(free.calls).toBe(0)
  })

  it('does not fall back when the credential is missing', async () => {
    const free = fakeFallback()
    const { open } = recordingOpen(async () => fakeSession(() => ({ isError: false, text: '' })))
    await expect(new ZaiFetchProvider({ ...baseOptions, resolveApiKey: async () => undefined, openSession: open, fetchFallback: free })
      .fetch({ url: 'https://example.test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' }))
    expect(free.calls).toBe(0)
  })

  it('falls back when the credential lookup itself fails', async () => {
    const free = fakeFallback()
    const { open } = recordingOpen(async () => fakeSession(() => ({ isError: false, text: '' })))
    await expect(new ZaiFetchProvider({
      ...baseOptions,
      resolveApiKey: async () => { throw new TypeError('credential store unavailable') },
      openSession: open,
      fetchFallback: free,
    }).fetch({ url: 'https://example.test' }))
      .resolves.toMatchObject({ body: { kind: 'text', content: 'fallback body' } })
    expect(free.calls).toBe(1)
  })

  it('reports availability from the endpoint only', () => {
    expect(new ZaiFetchProvider(baseOptions).available()).toBe(true)
    expect(new ZaiFetchProvider({ ...baseOptions, readerURL: 'not a url' }).available()).toBe(false)
  })

  it('closes its session when disposed', async () => {
    const session = fakeSession(() => ({ isError: false, text: encodePayload({ content: 'body' }) }))
    const { open } = recordingOpen(async () => session)
    const provider = new ZaiFetchProvider({ ...baseOptions, openSession: open })
    await provider.fetch({ url: 'https://example.test' })
    await provider.dispose()
    expect(session.closed).toBe(true)
  })
})

describe('web-search-zai plugin registration', () => {
  it('serves search and fetch through the seam and unregisters on dispose', async () => {
    const fixture = await startZaiMcpFixture()
    try {
      const ctx = new Context()
      ctx.provide('credentials', { resolve: async () => ({ value: 'test-key', source: 'test' }) } as never)
      await ctx.plugin(WebRuntime, { searchProvider: 'zai', fetchProvider: 'zai' })
      const fiber = await ctx.plugin(plugin, {
        searchURL: fixture.url,
        readerURL: fixture.url,
        timeoutMs: 10_000,
      })
      await expect(ctx.web.search({ query: 'q' })).resolves.toEqual({
        sources: [{ url: 'https://example.test/a', title: 'Title', snippet: 'Snippet' }],
        truncated: false,
      })
      await expect(ctx.web.fetch({ url: 'https://example.test' })).resolves.toMatchObject({
        body: { kind: 'text', content: '# Body' },
      })
      await fiber.dispose()
      await expect(ctx.web.search({ query: 'q' }))
        .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
      await expect(ctx.web.fetch({ url: 'https://example.test' }))
        .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
    } finally {
      await fixture.close()
    }
  })

  it('mounts without the fetch fallback when it is disabled', async () => {
    const ctx = new Context()
    ctx.provide('credentials', { resolve: async () => ({ value: 'test-key', source: 'test' }) } as never)
    await ctx.plugin(WebRuntime, { searchProvider: 'zai', fetchProvider: 'zai' })
    const fiber = await ctx.plugin(plugin, { fetchFallback: false })
    await fiber.dispose()
  })

  it('rejects endpoints that cannot be reached at load', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: 'zai', fetchProvider: 'zai' })
    expect(() => { apply(ctx, { searchURL: 'not a url' }) }).toThrow(/searchURL/)
    expect(() => { apply(ctx, { searchURL: ZAI_DEFAULT_SEARCH_URL, readerURL: 'not a url' }) }).toThrow(/readerURL/)
  })
})
