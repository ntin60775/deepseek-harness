/**
 * `ZaiSearchProvider` and `ZaiFetchProvider`: `ctx.web` backends over z.ai's
 * MCP servers (`web_search_prime`, `webReader`), which the GLM Coding Plan
 * meters as tool calls against the subscription. Search and fetch fail loud
 * when the credential is missing; only fetch falls back, to the free HTTP(S)
 * fetcher.
 * @module @local/dsh-web-search-zai/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebFetchProvider,
  WebFetchRequest,
  WebFetchResult,
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import { openMcpSession } from './mcp.ts'
import type { McpToolSession, OpenMcpSession } from './mcp.ts'

/** Stable id the search provider registers under. */
export const ZAI_SEARCH_PROVIDER_ID = 'zai'

/** Stable id the fetch provider registers under; its registry is separate from search's. */
export const ZAI_FETCH_PROVIDER_ID = 'zai'

/** Search MCP endpoint on the public z.ai deployment. */
export const ZAI_DEFAULT_SEARCH_URL = 'https://api.z.ai/api/mcp/web_search_prime/mcp'

/** Reader MCP endpoint on the public z.ai deployment. */
export const ZAI_DEFAULT_READER_URL = 'https://api.z.ai/api/mcp/web_reader/mcp'

/** Names of the two MCP tools this package calls. */
export const ZAI_SEARCH_TOOL = 'web_search_prime'

/** Reader tool name. */
export const ZAI_READER_TOOL = 'webReader'

/** Result-summary size the search tool accepts. */
export type ZaiContentSize = 'medium' | 'high'

/** Recency window the search tool accepts. */
export type ZaiRecency = 'oneDay' | 'oneWeek' | 'oneMonth' | 'oneYear' | 'noLimit'

/** Region hint the search tool accepts. */
export type ZaiLocation = 'cn' | 'us'

/** Resolved provider options; the plugin's `apply` supplies defaults from `Config`. */
export interface ZaiProviderOptions {
  /** Search MCP endpoint. */
  readonly searchURL: string
  /** Reader MCP endpoint. */
  readonly readerURL: string
  /** Per-call deadline in milliseconds. */
  readonly timeoutMs: number
  /** Resolve the API key for one call; `undefined` means the credential is unconfigured. */
  readonly resolveApiKey: () => Promise<string | undefined>
  /** Summary size requested from the search tool. */
  readonly contentSize: ZaiContentSize
  /** Recency window requested from the search tool. */
  readonly recency: ZaiRecency
  /** Region hint sent with every search. */
  readonly location: ZaiLocation
  /** Session opener; tests inject a fake, production uses the MCP client. */
  readonly openSession?: OpenMcpSession
  /** Free fetcher used when a z.ai read fails; absent disables the fallback. */
  readonly fetchFallback?: WebFetchProvider
}

/**
 * Decode the text a z.ai tool returns. The server encodes its JSON payload as a
 * JSON string inside the text block, so one decode can still be a string.
 * @param text - tool-result text.
 * @returns the decoded payload, still unvalidated.
 * @throws SyntaxError when the text is not JSON.
 */
export function decodeToolPayload(text: string): unknown {
  const first: unknown = JSON.parse(text)
  if (typeof first !== 'string') return first
  const second: unknown = JSON.parse(first)
  return second
}

/**
 * Map a decoded `web_search_prime` payload to the seam's result. Sources keep
 * the provider's order; a result without a link is dropped, and empty optional
 * fields are omitted. The MCP tool returns no generated answer and no
 * publication date.
 * @param payload - decoded tool payload.
 * @returns the normalized search result, untruncated (the seam applies `maxResults`).
 * @throws WebError `WEB_PROVIDER_ERROR` when the payload is not an array.
 */
export function mapSearchPayload(payload: unknown): WebSearchResult {
  if (!Array.isArray(payload)) {
    throw new WebError('z.ai web search returned an unexpected payload', 'WEB_PROVIDER_ERROR')
  }
  const sources: WebSearchSource[] = []
  for (const entry of payload) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const link = record.link
    if (typeof link !== 'string' || link.length === 0) continue
    const title = record.title
    const content = record.content
    sources.push({
      url: link,
      ...typeof title === 'string' && title.length > 0 ? { title } : {},
      ...typeof content === 'string' && content.length > 0 ? { snippet: content } : {},
    })
  }
  return { sources, truncated: false }
}

/**
 * Map a decoded `webReader` payload to the seam's fetch result.
 * @param payload - decoded tool payload.
 * @returns the page text and the final URL when the reader reported one.
 * @throws WebError `WEB_PROVIDER_ERROR` when the payload is not an object or carries no content.
 */
export function mapReaderPayload(payload: unknown): { readonly content: string; readonly url?: string } {
  if (typeof payload !== 'object' || payload === null) {
    throw new WebError('z.ai reader returned an unexpected payload', 'WEB_PROVIDER_ERROR')
  }
  const record = payload as Record<string, unknown>
  const content = record.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new WebError('z.ai reader returned no page content', 'WEB_PROVIDER_ERROR')
  }
  const url = record.url
  return { content, ...typeof url === 'string' && url.length > 0 ? { url } : {} }
}

/** One cached connection attempt for a fixed endpoint. */
interface CachedSession {
  readonly apiKey: string
  readonly pending: Promise<McpToolSession>
}

/** Cache one MCP session per endpoint, reopening it when the credential changes. */
class McpSessionCache {
  private current: CachedSession | undefined
  private readonly open: OpenMcpSession
  private readonly url: string
  private readonly timeoutMs: number

  /**
   * @param open - session opener.
   * @param url - endpoint this cache serves.
   * @param timeoutMs - per-call deadline handed to the opener.
   */
  constructor(open: OpenMcpSession, url: string, timeoutMs: number) {
    this.open = open
    this.url = url
    this.timeoutMs = timeoutMs
  }

  /**
   * Return the session for this key, opening one when none exists or the key
   * changed. A failed attempt is dropped so the next call retries.
   * @param apiKey - credential the session must carry.
   * @returns the connected session.
   */
  async get(apiKey: string): Promise<McpToolSession> {
    const current = this.current
    if (current !== undefined && current.apiKey === apiKey) return await current.pending
    const pending = this.open(this.url, apiKey, this.timeoutMs)
    this.current = { apiKey, pending }
    pending.catch(() => {
      if (this.current?.pending === pending) this.current = undefined
    })
    if (current !== undefined) void closeQuietly(current.pending)
    return await pending
  }

  /** Drop the cached session so the next call reconnects. */
  invalidate(): void {
    const current = this.current
    this.current = undefined
    void closeQuietly(current?.pending)
  }

  /** Close the cached session, if any. */
  async dispose(): Promise<void> {
    const current = this.current
    this.current = undefined
    await closeQuietly(current?.pending)
  }
}

/** Close a session that may never have opened, ignoring its failure. */
async function closeQuietly(pending: Promise<McpToolSession> | undefined): Promise<void> {
  if (pending === undefined) return
  try {
    const session = await pending
    await session.close()
  } catch (error: unknown) {
    // A session that never opened owns no connection to close.
    void error
  }
}

/**
 * Resolve the API key for one operation, failing with the seam's
 * configured-but-unavailable code so a missing credential is distinguishable
 * from an outage.
 * @param resolve - the provider's credential lookup.
 * @returns the non-empty API key.
 * @throws WebError `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` when the credential is absent or blank.
 */
async function requireApiKey(resolve: () => Promise<string | undefined>): Promise<string> {
  const apiKey = await resolve()
  if (apiKey === undefined || apiKey.length === 0) {
    throw new WebError(
      'the z.ai credential is not configured; the zai provider under Settings → Models supplies ZAI_API_KEY',
      'WEB_PROVIDER_CONFIGURED_UNAVAILABLE',
    )
  }
  return apiKey
}

/**
 * Translate a transport failure into a seam error.
 * @param error - the caught failure; passed through when it is already a WebError.
 * @param signal - the caller's signal.
 * @returns the error to throw.
 */
function classifyFailure(error: unknown, signal: AbortSignal | undefined): WebError {
  if (error instanceof WebError) return error
  if (signal?.aborted === true) return new WebError('z.ai MCP request aborted', 'WEB_ABORTED', { cause: error })
  return new WebError(`z.ai MCP request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
}

/** Search provider over the `web_search_prime` MCP tool. */
export class ZaiSearchProvider implements WebSearchProvider {
  readonly id = ZAI_SEARCH_PROVIDER_ID
  private readonly options: ZaiProviderOptions
  private readonly sessions: McpSessionCache

  /** @param options - resolved endpoints, limits, and credential lookup. */
  constructor(options: ZaiProviderOptions) {
    this.options = options
    this.sessions = new McpSessionCache(options.openSession ?? openMcpSession, options.searchURL, options.timeoutMs)
  }

  /** Local check only: a parseable endpoint. Credential presence is judged per call. */
  available(): boolean {
    return URL.canParse(this.options.searchURL)
  }

  /**
   * Run one search.
   * @param request - the query and optional result bound (the seam truncates).
   * @param signal - optional caller cancellation.
   * @returns the normalized result.
   */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const apiKey = await requireApiKey(this.options.resolveApiKey)
    const session = await this.sessions.get(apiKey)
    const args: Record<string, unknown> = {
      search_query: request.query,
      content_size: this.options.contentSize,
      search_recency_filter: this.options.recency,
      location: this.options.location,
    }
    let outcome
    try {
      outcome = await session.callTool(ZAI_SEARCH_TOOL, args, signal)
    } catch (error: unknown) {
      this.sessions.invalidate()
      throw classifyFailure(error, signal)
    }
    if (outcome.isError) {
      throw new WebError(`z.ai web search failed: ${outcome.text.length > 0 ? outcome.text : 'the tool reported an error'}`, 'WEB_PROVIDER_ERROR')
    }
    return mapSearchPayload(decodeToolPayload(outcome.text))
  }

  /** Close the cached MCP session. */
  async dispose(): Promise<void> {
    await this.sessions.dispose()
  }
}

/** Fetch provider over the `webReader` MCP tool, with the free HTTP fetcher as fallback. */
export class ZaiFetchProvider implements WebFetchProvider {
  readonly id = ZAI_FETCH_PROVIDER_ID
  private readonly options: ZaiProviderOptions
  private readonly sessions: McpSessionCache

  /** @param options - resolved endpoints, limits, credential lookup, and fallback. */
  constructor(options: ZaiProviderOptions) {
    this.options = options
    this.sessions = new McpSessionCache(options.openSession ?? openMcpSession, options.readerURL, options.timeoutMs)
  }

  /** Local check only: a parseable endpoint. Credential presence is judged per call. */
  available(): boolean {
    return URL.canParse(this.options.readerURL)
  }

  /**
   * Extract one page, falling back to the free fetcher when the paid path fails.
   * @param request - the URL to retrieve.
   * @param signal - optional caller cancellation.
   * @returns the extracted body as text.
   */
  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    try {
      return await this.read(request, signal)
    } catch (error: unknown) {
      const fallback = this.options.fetchFallback
      if (fallback !== undefined && canFallBack(error, signal)) return await fallback.fetch(request, signal)
      throw error
    }
  }

  /** Close the cached MCP session. */
  async dispose(): Promise<void> {
    await this.sessions.dispose()
  }

  /** The paid extraction path. */
  private async read(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const apiKey = await requireApiKey(this.options.resolveApiKey)
    const session = await this.sessions.get(apiKey)
    let outcome
    try {
      outcome = await session.callTool(ZAI_READER_TOOL, { url: request.url, return_format: 'markdown' }, signal)
    } catch (error: unknown) {
      this.sessions.invalidate()
      throw classifyFailure(error, signal)
    }
    if (outcome.isError) {
      throw new WebError(`z.ai reader failed: ${outcome.text.length > 0 ? outcome.text : 'the tool reported an error'}`, 'WEB_PROVIDER_ERROR')
    }
    const page = mapReaderPayload(decodeToolPayload(outcome.text))
    return {
      url: page.url ?? request.url,
      statusCode: 200,
      body: { kind: 'text', content: page.content },
      truncated: false,
    }
  }
}

/**
 * Whether a failed read may be retried against the free fetcher. Cancellation
 * never falls back — the caller asked to stop — and a missing credential is a
 * configuration error the fallback would hide.
 * @param error - the failure from the paid path.
 * @param signal - the caller's signal.
 * @returns true when the free fetcher should serve this request.
 */
function canFallBack(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted === true) return false
  if (!(error instanceof WebError)) return true
  return error.code !== 'WEB_ABORTED' && error.code !== 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE'
}
