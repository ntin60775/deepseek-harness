/**
 * Session recovery for Streamable HTTP: a server that restarted no longer
 * knows the client's `Mcp-Session-Id` and answers 404. The supervisor must
 * treat that as a lost session, start a new one, and serve later calls —
 * instead of failing every request until the host restarts.
 */
import { expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as McpClient from '../src/index.ts'
import { connectionStatusIn } from '../src/status.ts'
import { startSessionHttpMcpFixture } from './session-http-fixture.ts'

const signal = new AbortController().signal

/** One ping call through the registered bridge tool. */
async function callPing(ctx: Context, callId: string) {
  return executeToolFixture(ctx, {
    name: 'mcp__fixture__ping',
    arguments: {},
    callId: ToolCallId(callId),
    signal,
  })
}

it('starts a new session when an established one is answered with HTTP 404', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  const fixture = await startSessionHttpMcpFixture()
  onTestFinished(fixture.close)
  const fiber = await ctx.plugin(McpClient, McpClient.Config({
    transport: 'streamable-http',
    serverName: 'fixture',
    url: fixture.url,
    failOnStartupError: true,
    reconnect: { initialDelayMs: 10, maxDelayMs: 50 },
  }))
  expect(connectionStatusIn(fiber)!.current()).toMatchObject({ state: 'connected', toolCount: 1 })
  expect(fixture.sessions).toEqual(['session-1'])

  // The server forgot every session: the call fails once and nothing reaches the tool.
  fixture.restart()
  expect(await callPing(ctx, 'lost')).toMatchObject({ isError: true })
  expect(fixture.calls).toEqual([])

  // The supervisor starts a new session and serves the next call.
  await vi.waitFor(async () => {
    expect(await callPing(ctx, 'recovered')).toMatchObject({ isError: false })
  }, { timeout: 3_000, interval: 50 })
  expect(fixture.sessions).toEqual(['session-1', 'session-2'])
  expect(fixture.calls).toEqual(['ping'])
  expect(connectionStatusIn(fiber)!.current()).toMatchObject({ state: 'connected', toolCount: 1 })
})
