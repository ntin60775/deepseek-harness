/**
 * Decoded payload shapes of the two z.ai MCP tools this fork uses:
 * `web_search_prime` returns a JSON-encoded array of results, and `webReader`
 * returns a JSON-encoded page object. Both arrive as text inside a tool result,
 * encoded twice, so only the decoded shapes live here.
 * @module @local/dsh-web-search-zai/types
 */

/** One result of `web_search_prime`, after decoding. */
export interface ZaiSearchItem {
  /** Result title, when the search engine extracted one. */
  readonly title?: string
  /** Destination URL; a result without one is dropped instead of inventing a source. */
  readonly link?: string
  /** Extracted page text used as the portable snippet. */
  readonly content?: string
  /** Provider citation tag (`ref_1`, …); the seam reads only URLs and titles. */
  readonly refer?: string
}

/** Decoded `webReader` page payload. */
export interface ZaiReaderPayload {
  /** Page title, when the reader extracted one. */
  readonly title?: string
  /** Final URL after redirects; the request URL applies when absent. */
  readonly url?: string
  /** Page body as markdown. */
  readonly content?: string
  /** Page description, when the reader extracted one. */
  readonly description?: string
}
