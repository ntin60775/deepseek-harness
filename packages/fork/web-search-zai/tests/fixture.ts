import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createMcpHandler, McpServer, type CallToolResult } from '@modelcontextprotocol/server'
import { toNodeHandler, type NodeIncomingMessageLike } from '@modelcontextprotocol/node'
import { z } from 'zod'

/** Running z.ai-shaped MCP fixture and the authorization headers it observed. */
export interface ZaiMcpFixture {
  /** Streamable HTTP endpoint all tools are served from. */
  readonly url: string
  /** Authorization header of every request, in order. */
  readonly authorization: Array<string | undefined>
  /** Stop the HTTP server and its handler. */
  readonly close: () => Promise<void>
}

/**
 * Start a local MCP endpoint exposing z.ai's two tool names with z.ai's
 * double-encoded JSON payloads.
 * @returns the running fixture.
 */
export async function startZaiMcpFixture(): Promise<ZaiMcpFixture> {
  const authorization: Array<string | undefined> = []
  const handler = createMcpHandler(() => {
    const mcp = new McpServer(
      { name: 'zai-fixture', version: '1.0.0' },
      { capabilities: { tools: {} } },
    )
    mcp.registerTool('web_search_prime', {
      description: 'Search the web.',
      inputSchema: z.object({
        search_query: z.string(),
        content_size: z.string().optional(),
        search_recency_filter: z.string().optional(),
        location: z.string().optional(),
      }),
    }, async ({ search_query }): Promise<CallToolResult> => {
      if (search_query === 'tool-error') {
        return { isError: true, content: [{ type: 'text', text: 'quota exhausted' }] }
      }
      if (search_query === 'tool-error-silent') {
        return { isError: true, content: [] }
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(JSON.stringify([
            { title: 'Title', link: 'https://example.test/a', content: 'Snippet', refer: 'ref_1' },
          ])),
        }],
      }
    })
    mcp.registerTool('webReader', {
      description: 'Read a page.',
      inputSchema: z.object({ url: z.string(), return_format: z.string().optional() }),
    }, async ({ url }): Promise<CallToolResult> => ({
      content: [{
        type: 'text',
        text: JSON.stringify(JSON.stringify({ title: 'Example', url, content: '# Body' })),
      }],
    }))
    return mcp
  })
  const handle = toNodeHandler(handler)
  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    authorization.push(request.headers.authorization)
    await handle(request as NodeIncomingMessageLike, response)
  }
  const server = createServer((request, response) => {
    handleRequest(request, response).catch((error: unknown) => {
      response.writeHead(500).end(String(error))
    })
  })
  const listening: PromiseWithResolvers<void> = Promise.withResolvers()
  server.listen(0, '127.0.0.1', listening.resolve)
  await listening.promise
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('MCP fixture has no TCP address')
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    authorization,
    close: async () => {
      await handler.close()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    },
  }
}
