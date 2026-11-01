/**
 * z.ai-backed `ctx.web` providers for this fork: search through the
 * `web_search_prime` MCP tool and fetch through `webReader`, so both spend GLM
 * Coding Plan credits instead of per-call API charges. Fetch falls back to the
 * free HTTP(S) fetcher; search does not, because a second backend would hide the
 * subscription route the profile pinned.
 * @module @local/dsh-web-search-zai
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-web'
import { DEFAULT_USER_AGENT, HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http'
import {
  ZaiFetchProvider,
  ZaiSearchProvider,
  ZAI_DEFAULT_READER_URL,
  ZAI_DEFAULT_SEARCH_URL,
} from './provider.ts'
import type { ZaiContentSize, ZaiLocation, ZaiRecency } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-zai'

/** The services this provider contributes to. */
export const inject = ['web', 'credentials']

/** Plugin config; every field has a default. */
export interface Config {
  /** Credential reference holding the z.ai API key. */
  apiKeyRef?: string
  /** Search MCP endpoint. */
  searchURL?: string
  /** Reader MCP endpoint. */
  readerURL?: string
  /** Per-call deadline in milliseconds. */
  timeoutMs?: number
  /** Summary size requested from the search tool. */
  contentSize?: ZaiContentSize
  /** Recency window requested from the search tool. */
  recency?: ZaiRecency
  /** Region hint sent with every search. */
  location?: ZaiLocation
  /** Fall back to the free HTTP(S) fetcher when a z.ai read fails. */
  fetchFallback?: boolean
  /** Fallback fetcher response byte cap. */
  fallbackMaxResponseBytes?: number
  /** Fallback fetcher decoded character cap. */
  fallbackMaxBodyChars?: number
  /** Fallback fetcher deadline in milliseconds. */
  fallbackTimeoutMs?: number
  /** Fallback fetcher same-origin redirect cap. */
  fallbackMaxRedirects?: number
}

export const Config: z<Config> = z.object({
  apiKeyRef: z.string().default('ZAI_API_KEY'),
  searchURL: z.string().default(ZAI_DEFAULT_SEARCH_URL),
  readerURL: z.string().default(ZAI_DEFAULT_READER_URL),
  timeoutMs: z.number().step(1).min(1).default(30_000),
  contentSize: z.union(['medium', 'high'] as const).default('medium'),
  recency: z.union(['oneDay', 'oneWeek', 'oneMonth', 'oneYear', 'noLimit'] as const).default('noLimit'),
  location: z.union(['cn', 'us'] as const).default('us'),
  fetchFallback: z.boolean().default(true),
  fallbackMaxResponseBytes: z.number().step(1).min(1).default(5_000_000),
  fallbackMaxBodyChars: z.number().step(1).min(1).default(100_000),
  fallbackTimeoutMs: z.number().step(1).min(1).default(30_000),
  fallbackMaxRedirects: z.number().step(1).min(0).default(5),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/**
 * Register both providers on `ctx.web`. The bundle patch pins both capabilities
 * to this backend, so a missing credential fails the tool call loudly instead of
 * silently selecting another provider.
 * @param ctx - the plugin context, with `web` and `credentials` injected.
 * @param config - plugin config; schemastery has filled every default.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  assertEndpoint('searchURL', resolved.searchURL)
  assertEndpoint('readerURL', resolved.readerURL)
  const ref = credentialRef(resolved.apiKeyRef)
  const options = {
    searchURL: resolved.searchURL,
    readerURL: resolved.readerURL,
    timeoutMs: resolved.timeoutMs,
    resolveApiKey: async () => (await ctx.credentials.resolve(ref))?.value,
    contentSize: resolved.contentSize,
    recency: resolved.recency,
    location: resolved.location,
  }
  const search = new ZaiSearchProvider(options)
  const fallback = resolved.fetchFallback
    ? new HttpFetchProvider({
      maxResponseBytes: resolved.fallbackMaxResponseBytes,
      maxBodyChars: resolved.fallbackMaxBodyChars,
      timeoutMs: resolved.fallbackTimeoutMs,
      maxRedirects: resolved.fallbackMaxRedirects,
      userAgent: DEFAULT_USER_AGENT,
    })
    : undefined
  const fetch = new ZaiFetchProvider({
    ...options,
    ...fallback === undefined ? {} : { fetchFallback: fallback },
  })
  ctx.web.registerSearchProvider(search)
  ctx.web.registerFetchProvider(fetch)
  ctx.effect(function* () {
    yield () => {
      void search.dispose()
      void fetch.dispose()
    }
  }, 'web-search-zai.sessions')
}

/**
 * Reject an endpoint that no request could reach, at load rather than on the
 * first tool call.
 * @param field - config field name for the error message.
 * @param url - the configured endpoint.
 * @throws Error naming the field and the rejected value.
 */
function assertEndpoint(field: string, url: string): void {
  if (!URL.canParse(url)) throw new Error(`web-search-zai: ${field} "${url}" is not an absolute URL`)
}
