/**
 * Session Controller permanent deletion: a cold stored Session loses its log
 * before the registry forgets it and clients hear `api-session/removed`; a
 * live Agent — or a writer another process holds — refuses as `session/live`
 * with the activity the workspace providers report.
 */
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Agent, AgentHandle, CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import { SessionAlreadyOwnedError } from '@deepseek-ai/dsh-session-persistence'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type {} from '@deepseek-ai/dsh-workspace'
import type { SessionDeleteRequest } from '../src/types.ts'
import { createSessionTestRemote } from './test-remote.ts'

const sid = (id: string): SessionId => id as SessionId

function request(id: string): SessionDeleteRequest {
  return { sessionId: sid(id) }
}

async function harness() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  // A minimal store-backed factory: a Session Controller create yields a
  // tracked Agent handle, so deletion can exercise the Host-owned close path.
  ctx.agents.setFactory({
    createAgent: async (ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle> => {
      const session = ctx.sessions.create(options.sessionId, {
        ...options.meta === undefined ? {} : { meta: options.meta },
      })
      const agent = { id: session.id, session, status: 'idle', ctx: ownerCtx } as Agent
      const detach = ctx.agents.enter(agent)
      await ctx.agents.announce(agent, 'startup')
      return { agent, dispose: async () => { detach() } }
    },
    resume: () => Promise.reject(new Error('resume is not used by this fixture')),
  })
  ctx.provide('typertGateway', { getPendingRemoteEvents: () => [] } as never)
  const persistence = {
    delete: vi.fn<SessionPersistence['delete']>(async () => true),
    list: async () => [],
    stat: async () => undefined,
    create: async () => { throw new Error('unused') },
    open: async () => { throw new Error('unused') },
    flush: async () => {},
  }
  ctx.provide('sessionPersistence', persistence as never)
  const workspaceRegistry = {
    forgetSession: vi.fn(async () => {}),
    list: () => [],
    get: () => undefined,
    archivedSessionIds: [],
    pinnedSessionIds: [],
  }
  ctx.provide('workspaceRegistry', workspaceRegistry as never)
  const removed: SessionId[] = []
  ctx.on('api-session/removed', (sessionId) => { removed.push(sessionId) })
  const remote = await createSessionTestRemote(ctx, {
    defaultModelSelection: () => ({ provider: 'fixture', model: 'fixture-model' }),
    cwd: '/tmp',
  })
  return { ctx, persistence, workspaceRegistry, removed, remote }
}

describe('session.delete', () => {
  it('removes the stored log, then the registry trace, and tells clients the id is gone', async () => {
    const h = await harness()
    const response = await h.remote.delete(request('cold'))
    expect(response).toEqual({ ok: true, value: { deleted: true } })
    expect(h.persistence.delete).toHaveBeenCalledWith('cold')
    expect(h.workspaceRegistry.forgetSession).toHaveBeenCalledWith('cold')
    expect(h.removed).toEqual(['cold'])
  })

  it('reports an already absent Session without touching the registry', async () => {
    const h = await harness()
    h.persistence.delete.mockResolvedValueOnce(false)
    const response = await h.remote.delete(request('missing'))
    expect(response).toMatchObject({ ok: false, error: { code: 'session/not-found', details: { sessionId: 'missing' } } })
    expect(h.workspaceRegistry.forgetSession).not.toHaveBeenCalled()
    expect(h.removed).toEqual([])
  })

  it('refuses a Session a live Agent holds, naming the activity providers report', async () => {
    const h = await harness()
    const session = h.ctx.sessions.create(sid('live'), { meta: { cwd: '/proj' } })
    await h.ctx.agents.register({ id: session.id, session, status: 'idle', ctx: h.ctx } as Agent)
    h.ctx.on('workspace/session-activity', async (_request, next) => [
      { kind: 'turn' },
      { kind: 'job', items: [{ id: 'bash-1', label: 'pnpm run build' }] },
      ...await next(),
    ])

    const response = await h.remote.delete(request('live'))
    expect(response).toMatchObject({
      ok: false,
      error: {
        code: 'session/live',
        details: {
          sessionId: 'live',
          activity: [{ kind: 'turn' }, { kind: 'job', items: [{ id: 'bash-1', label: 'pnpm run build' }] }],
          closable: false,
        },
      },
    })
    expect(h.persistence.delete).not.toHaveBeenCalled()
    expect(h.workspaceRegistry.forgetSession).not.toHaveBeenCalled()
    expect(h.removed).toEqual([])
  })

  it('closes a live Agent it owns before deleting, and stops its work on request', async () => {
    const h = await harness()
    const created = await h.remote.create({ cwd: '/tmp' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const sessionId = created.value.sessionId
    expect(h.ctx.agents.get(sessionId)).toBeDefined()

    // An idle owned Agent is closed without a confirmation hop.
    const deleted = await h.remote.delete({ sessionId })
    expect(deleted).toEqual({ ok: true, value: { deleted: true } })
    expect(h.ctx.agents.get(sessionId)).toBeUndefined()
    expect(h.persistence.delete).toHaveBeenCalledWith(sessionId)
    expect(h.workspaceRegistry.forgetSession).toHaveBeenCalledWith(sessionId)

    // Running work refuses first and names the closure the Host can perform.
    const busy = await h.remote.create({ cwd: '/tmp' })
    expect(busy.ok).toBe(true)
    if (!busy.ok) return
    const liveId = busy.value.sessionId
    const stopped: SessionId[] = []
    h.ctx.on('workspace/session-activity', async (_request, next) => [
      { kind: 'turn' },
      ...await next(),
    ])
    h.ctx.on('workspace/session-stop', ({ sessionId: stoppedId }) => { stopped.push(stoppedId) })
    h.ctx.on('workspace/session-stop', () => { throw new Error('job stop exploded') })
    const warn = vi.spyOn(h.ctx.logger, 'warn').mockImplementation(() => {})
    const refused = await h.remote.delete({ sessionId: liveId })
    expect(refused).toMatchObject({
      ok: false,
      error: {
        code: 'session/live',
        details: { sessionId: liveId, activity: [{ kind: 'turn' }], closable: true },
      },
    })
    expect(h.ctx.agents.get(liveId)).toBeDefined()
    expect(stopped).toEqual([])

    const confirmed = await h.remote.delete({ sessionId: liveId, stopActivity: true })
    expect(confirmed).toEqual({ ok: true, value: { deleted: true } })
    expect(stopped).toEqual([liveId])
    // A failing stop provider is reported, never allowed to block the delete.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('job stop exploded'))
    expect(h.ctx.agents.get(liveId)).toBeUndefined()
    warn.mockRestore()
  })

  it('maps a writer held by another process to the same live refusal', async () => {
    const h = await harness()
    h.persistence.delete.mockRejectedValueOnce(new SessionAlreadyOwnedError(sid('held')))
    const response = await h.remote.delete(request('held'))
    expect(response).toMatchObject({
      ok: false,
      error: { code: 'session/live', details: { sessionId: 'held', activity: [], closable: false } },
    })
    expect(h.workspaceRegistry.forgetSession).not.toHaveBeenCalled()
    expect(h.removed).toEqual([])
  })

  it('keeps an unexpected storage failure as an internal diagnostic', async () => {
    const h = await harness()
    h.persistence.delete.mockRejectedValueOnce(new Error('disk on fire'))
    const response = await h.remote.delete(request('broken'))
    expect(response).toMatchObject({ ok: false, error: { code: 'gateway/internal' } })
    if (response.ok) return
    expect(response.error.message).toContain('disk on fire')
    expect(h.removed).toEqual([])
  })

  it('does not announce removal when the registry cannot forget the Session', async () => {
    const h = await harness()
    h.workspaceRegistry.forgetSession.mockRejectedValueOnce(new Error('registry down'))
    const response = await h.remote.delete(request('half-gone'))
    expect(response).toMatchObject({ ok: false, error: { code: 'gateway/internal' } })
    expect(h.removed).toEqual([])
  })
})
