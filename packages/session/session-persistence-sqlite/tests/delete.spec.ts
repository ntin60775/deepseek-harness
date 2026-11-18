/** Permanent Session deletion through the SQLite provider. @module */
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { SessionLogOffset } from '@deepseek-ai/dsh-session'
import { SessionAlreadyOwnedError } from '@deepseek-ai/dsh-session-persistence'
import { meta, oneTurnLog } from '../../session-persistence/tests/contract.ts'
import { persistenceFixture } from './fixtures/persistence.ts'
import { sqliteLogs } from './fixtures/store.ts'

/** Open the provider's database for direct row assertions. */
function openDatabase(root: string): DatabaseSync {
  return new DatabaseSync(join(root, '.segments', 'sessions.sqlite'))
}

/** Count one table's rows. */
function countRows(db: DatabaseSync, table: 'traces' | 'segments' | 'frames'): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()
  return (row as { count: number }).count
}

describe('SQLite Session deletion', () => {
  it('removes the stored rows, the routing record, and the listed entry', async () => {
    const fixture = await persistenceFixture()
    const { persistence } = await fixture.mount('sqlite')
    const header = meta('delete-stored', '/workspace')
    const writer = await persistence.create(header)
    await writer.append(oneTurnLog())
    await writer.close()

    expect(await persistence.delete(header.id)).toBe(true)
    expect(await persistence.stat(header.id)).toBeUndefined()
    expect(await persistence.list()).toEqual([])
    expect((await readdir(join(fixture.root, '.segments'))).filter(name => name.endsWith('.json'))).toEqual([])

    const db = openDatabase(fixture.root)
    try {
      expect([countRows(db, 'traces'), countRows(db, 'segments'), countRows(db, 'frames')]).toEqual([0, 0, 0])
      // The append-only guards return with the transaction that removed them.
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all())
        .toEqual([{ name: 'ancestors_no_delete' }, { name: 'ancestors_no_update' }, { name: 'frames_no_delete' },
          { name: 'frames_no_update' }, { name: 'segments_index_ancestors' }, { name: 'segments_no_reparent' }])
    } finally {
      db.close()
    }
  })

  it('reports no stored Session for a repeated or unknown deletion', async () => {
    const fixture = await persistenceFixture()
    const { persistence } = await fixture.mount('sqlite')
    const header = meta('delete-twice', '/workspace')
    const writer = await persistence.create(header)
    await writer.append(oneTurnLog())
    await writer.close()

    expect(await persistence.delete(header.id)).toBe(true)
    expect(await persistence.delete(header.id)).toBe(false)

    const absentRow = sqliteLogs(join(fixture.root, '.segments', 'absent.sqlite'), fixture.root)
    await absentRow.start()
    expect(await absentRow.delete(meta('never-stored').id)).toBe(false)
    await absentRow.close()

    const unwritten = sqliteLogs(join(fixture.root, '.segments', 'unwritten.sqlite'), fixture.root)
    expect(await unwritten.delete(meta('no-database').id)).toBe(false)
  })

  it('refuses while a write handle in this process owns the Session', async () => {
    const fixture = await persistenceFixture()
    const { persistence } = await fixture.mount('sqlite')
    const header = meta('delete-owned', '/workspace')
    const writer = await persistence.create(header)
    await writer.append(oneTurnLog())
    await expect(persistence.delete(header.id)).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
    await writer.close()
    expect(await persistence.delete(header.id)).toBe(true)
  })

  it('observes cancellation before removing anything', async () => {
    const fixture = await persistenceFixture()
    const { persistence } = await fixture.mount('sqlite')
    const header = meta('delete-aborted', '/workspace')
    const writer = await persistence.create(header)
    await writer.append(oneTurnLog())
    await writer.close()

    await expect(persistence.delete(header.id, { signal: AbortSignal.abort() })).rejects.toThrow()
    expect(await persistence.stat(header.id)).toBeDefined()

    const store = sqliteLogs(join(fixture.root, '.segments', 'sessions.sqlite'), fixture.root)
    await store.start()
    await expect(store.delete(header.id, AbortSignal.abort())).rejects.toThrow()
    await store.close()
  })

  it('keeps a live fork and removes only the deleted Trace rows', async () => {
    const fixture = await persistenceFixture()
    const { persistence } = await fixture.mount('sqlite')
    const parent = meta('delete-parent', '/workspace')
    const events = oneTurnLog()
    const parentWriter = await persistence.create(parent)
    await parentWriter.append(events)
    await parentWriter.close()
    const child = meta('delete-child', '/workspace')
    const childWriter = await persistence.create(child, {
      parentSource: { sessionId: parent.id, endSeq: SessionLogOffset(events.length), events },
    })
    await childWriter.close()

    // The parent's Tail Segment is the child's inherited prefix, so the parent Trace goes without it.
    expect(await persistence.delete(parent.id)).toBe(true)
    expect(await persistence.stat(parent.id)).toBeUndefined()
    const survivor = await persistence.open(child.id, 'read')
    expect((await survivor.read()).events).toEqual(events)
    await survivor.close()

    const db = openDatabase(fixture.root)
    try {
      // The child's own Segment plus the parent Tail the child inherited as its prefix.
      expect([countRows(db, 'traces'), countRows(db, 'segments')]).toEqual([1, 2])
    } finally {
      db.close()
    }

    expect(await persistence.delete(child.id)).toBe(true)
    const reopened = openDatabase(fixture.root)
    try {
      expect([countRows(reopened, 'traces'), countRows(reopened, 'segments'), countRows(reopened, 'frames')])
        .toEqual([0, 0, 0])
    } finally {
      reopened.close()
    }
  })

  it('removes a legacy JSONL-only Session through the JSONL backend', async () => {
    const fixture = await persistenceFixture()
    const legacy = await fixture.mount('jsonl')
    const header = meta('delete-legacy', '/workspace')
    const writer = await legacy.persistence.create(header)
    await writer.append(oneTurnLog())
    await writer.close()

    const { persistence } = await fixture.mount('sqlite')
    expect(await persistence.delete(header.id)).toBe(true)
    expect(await persistence.stat(header.id)).toBeUndefined()
    expect(await legacy.persistence.stat(header.id)).toBeUndefined()
  })
})
