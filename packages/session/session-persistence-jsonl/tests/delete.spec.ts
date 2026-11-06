// @vitest-environment node
/**
 * Permanent removal of one stored Session: the artifact directory (every
 * generation plus the write lock) disappears, the catalog stops reporting the
 * id, and an owner — this process's write handle or another process's kernel
 * lease — refuses before anything is removed.
 */
import { Context } from '@deepseek-ai/cordis'
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import {
  SessionAlreadyOwnedError, SessionPersistenceNotFoundError,
} from '@deepseek-ai/dsh-session-persistence'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generationLogPath, sessionDir } from '../src/format.ts'
import { SessionWriteLease } from '../src/lease.ts'
import { oneTurnLog } from '../../session-persistence/tests/contract.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

const meta = (id: string, cwd = '/proj'): SessionHeader => ({
  version: SESSION_FORMAT_VERSION,
  id: SessionId(id),
  createdAt: 1,
  isSeeded: false,
  cwd,
})

async function backend(): Promise<{ root: string; persistence: SessionPersistence }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-jsonl-delete-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  return { root, persistence: ctx.sessionPersistence }
}

/** Write one complete materialized session and release its writer. */
async function stored(root: string, persistence: SessionPersistence, id: string): Promise<string> {
  const handle = await persistence.create(meta(id))
  await handle.append(oneTurnLog())
  await handle.flush()
  await handle.close()
  return sessionDir(root, '/proj', SessionId(id))
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then(() => true, () => false)
}

describe('SessionPersistence.delete', () => {
  it('removes the artifact directory, the catalog row, and every reader path', async () => {
    const { root, persistence } = await backend()
    const dir = await stored(root, persistence, 'delete-me')
    expect(await exists(dir)).toBe(true)

    await expect(persistence.delete(SessionId('delete-me'))).resolves.toBe(true)
    expect(await exists(dir)).toBe(false)
    await expect(persistence.stat(SessionId('delete-me'))).resolves.toBeUndefined()
    await expect(persistence.list()).resolves.toEqual([])
    await expect(persistence.open(SessionId('delete-me'), 'read'))
      .rejects.toBeInstanceOf(SessionPersistenceNotFoundError)
    // An absent id is a no-op, not an error.
    await expect(persistence.delete(SessionId('delete-me'))).resolves.toBe(false)
  })

  it('refuses while this process holds the write handle, then removes after close', async () => {
    const { root, persistence } = await backend()
    const id = SessionId('owned')
    const handle = await persistence.create(meta('owned'))
    await handle.append(oneTurnLog())
    const dir = sessionDir(root, '/proj', id)

    await expect(persistence.delete(id)).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
    expect(await exists(dir)).toBe(true)
    await handle.close()
    await expect(persistence.delete(id)).resolves.toBe(true)
    expect(await exists(dir)).toBe(false)
  })

  it('refuses while another process holds the kernel write lease', async () => {
    const { root, persistence } = await backend()
    const id = SessionId('leased')
    const dir = await stored(root, persistence, 'leased')
    const lease = await SessionWriteLease.acquire(dir, id)
    try {
      await expect(persistence.delete(id)).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
      expect(await exists(dir)).toBe(true)
    } finally {
      await lease.release()
    }
    await expect(persistence.delete(id)).resolves.toBe(true)
  })

  it('removes a session whose stored header no longer validates', async () => {
    const { root, persistence } = await backend()
    const id = SessionId('corrupt')
    const dir = await stored(root, persistence, 'corrupt')
    await writeFile(generationLogPath(root, '/proj', id, SESSION_FORMAT_VERSION, 'none'), 'not a session log\n')

    await expect(persistence.delete(id)).resolves.toBe(true)
    expect(await exists(dir)).toBe(false)
  })

  it('refuses a duplicated artifact directory instead of deleting one copy', async () => {
    const { root, persistence } = await backend()
    const id = SessionId('duplicated')
    await stored(root, persistence, 'duplicated')
    // An unrelated project makes the scan visit a directory without this id.
    const unrelated = await persistence.create(meta('elsewhere', '/third'))
    await unrelated.append(oneTurnLog())
    await unrelated.flush()
    await unrelated.close()
    // A second copy under another project directory is corruption, not a target.
    await mkdir(sessionDir(root, '/other', id), { recursive: true })

    await expect(persistence.delete(id)).rejects.toThrow(/duplicate JSONL session id "duplicated"/)
    expect(await exists(sessionDir(root, '/proj', id))).toBe(true)
  })

  it('observes cancellation before removing anything', async () => {
    const { root, persistence } = await backend()
    const dir = await stored(root, persistence, 'cancelled')
    const controller = new AbortController()
    controller.abort()

    await expect(persistence.delete(SessionId('cancelled'), { signal: controller.signal })).rejects.toThrow()
    expect(await exists(dir)).toBe(true)
    await expect(persistence.delete(SessionId('cancelled'))).resolves.toBe(true)
  })
})
