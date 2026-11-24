/**
 * Sessionful Streamable HTTP MCP fixture: unlike the stateless fixture in
 * `http-fixture.ts`, this one issues an `Mcp-Session-Id` at `initialize` and
 * rejects requests that carry an unknown id with HTTP 404 — the response the
 * MCP Streamable HTTP specification assigns to an unrecognized session.
 * `restart()` forgets every session, imitating a server process restart.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

/** Running sessionful fixture and the tool calls it served. */
export interface SessionHttpFixture {
  url: string
  /** Tool calls that reached the server, in order. */
  calls: string[]
  /** Sessions issued so far, in order. */
  sessions: string[]
  /** Forget every session: the next request carrying an old id is answered with 404. */
  restart: () => void
  close: () => Promise<void>
}

interface JsonRpcMessage {
  id?: unknown
  method?: string
  params?: { name?: string }
}

function json(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(JSON.stringify(body))
}

function sessionNotFound(response: ServerResponse, id: unknown): void {
  json(response, 404, { jsonrpc: '2.0', id, error: { code: -32600, message: 'Session not found' } })
}

const METHOD_NOT_FOUND = { code: -32601, message: 'Method not found' }

/** Start a sessionful MCP endpoint serving one `ping` tool. */
export async function startSessionHttpMcpFixture(): Promise<SessionHttpFixture> {
  const calls: string[] = []
  const sessions: string[] = []
  let known = new Set<string>()
  let nextId = 0

  const serve = (request: IncomingMessage, response: ServerResponse, body: string): void => {
    const message = body === '' ? {} : JSON.parse(body) as JsonRpcMessage
    const sessionId = request.headers['mcp-session-id']
    if (request.method !== 'POST') {
      if (typeof sessionId !== 'string' || !known.has(sessionId)) {
        sessionNotFound(response, message.id)
        return
      }
      if (request.method === 'DELETE') {
        known.delete(sessionId)
        response.writeHead(200).end()
        return
      }
      // The client opens an SSE stream for server-initiated messages; this fixture has none.
      response.writeHead(405).end()
      return
    }
    if (message.method === 'server/discover') {
      // No 2026-era endpoint here: the client falls back to the 2025 initialize handshake.
      json(response, 200, { jsonrpc: '2.0', id: message.id, error: METHOD_NOT_FOUND })
      return
    }
    if (message.method === 'initialize') {
      const id = `session-${++nextId}`
      known.add(id)
      sessions.push(id)
      json(response, 200, {
        jsonrpc: '2.0',
        id: message.id,
        result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'session-fixture', version: '1.0.0' } },
      }, { 'mcp-session-id': id })
      return
    }
    if (typeof sessionId !== 'string' || !known.has(sessionId)) {
      sessionNotFound(response, message.id)
      return
    }
    switch (message.method) {
      case 'notifications/initialized':
        response.writeHead(202).end()
        return
      case 'tools/list':
        json(response, 200, {
          jsonrpc: '2.0',
          id: message.id,
          result: { tools: [{ name: 'ping', description: 'Replies pong.', inputSchema: { type: 'object' } }] },
        })
        return
      case 'tools/call': {
        const name = message.params?.name
        if (name !== undefined) calls.push(name)
        json(response, 200, { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'pong' }] } })
        return
      }
      default:
        json(response, 200, { jsonrpc: '2.0', id: message.id, error: METHOD_NOT_FOUND })
    }
  }

  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
    request.on('end', () => {
      try {
        serve(request, response, body)
      } catch (error) {
        response.writeHead(500).end(String(error))
      }
    })
  })
  const listening: PromiseWithResolvers<void> = Promise.withResolvers()
  server.listen(0, '127.0.0.1', listening.resolve)
  await listening.promise
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Sessionful HTTP fixture has no TCP address')
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    calls,
    sessions,
    restart: () => { known = new Set() },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    },
  }
}
