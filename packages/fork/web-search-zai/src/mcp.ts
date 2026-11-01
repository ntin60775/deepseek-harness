/**
 * Thin adapter over the official MCP client used to reach z.ai's Streamable
 * HTTP servers. The adapter owns exactly one concern: turning `tools/call` into
 * the tool-result text the providers map, with the API key travelling as an
 * authorization header.
 * @module @local/dsh-web-search-zai/mcp
 */

import { Client } from '@modelcontextprotocol/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

/** One tool outcome, reduced to what the providers consume. */
export interface McpToolOutcome {
  /** `true` when the server reported a tool-level failure (the call itself succeeded). */
  readonly isError: boolean
  /** Concatenated text blocks; empty when the tool returned none. */
  readonly text: string
}

/** One connected MCP session. */
export interface McpToolSession {
  /**
   * Call one tool.
   * @param name - exact server-side tool name.
   * @param args - tool arguments.
   * @param signal - optional caller cancellation.
   * @returns the reduced tool outcome.
   */
  callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpToolOutcome>
  /** Close the session and its transport. */
  close(): Promise<void>
}

/** Opens one session against a Streamable HTTP MCP endpoint. */
export type OpenMcpSession = (url: string, apiKey: string, timeoutMs: number) => Promise<McpToolSession>

/**
 * Open a session with the official MCP client. The client negotiates the
 * protocol revision and owns the `Mcp-Session-Id`, so the providers never parse
 * SSE or manage session state themselves.
 * @param url - Streamable HTTP endpoint.
 * @param apiKey - bearer credential for the endpoint.
 * @param timeoutMs - per-call deadline passed to every `tools/call`.
 * @returns the connected session.
 */
export const openMcpSession: OpenMcpSession = async (url, apiKey, timeoutMs) => {
  const client = new Client(
    { name: 'dsh-web-search-zai', version: '0.0.1' },
    { capabilities: {} },
  )
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { authorization: `Bearer ${apiKey}` } },
  })
  await client.connect(transport)
  return {
    async callTool(name, args, signal) {
      const result = await client.callTool(
        { name, arguments: args },
        { timeout: timeoutMs, ...signal === undefined ? {} : { signal } },
      )
      return {
        isError: result.isError === true,
        text: result.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n'),
      }
    },
    close: async () => { await client.close() },
  }
}
