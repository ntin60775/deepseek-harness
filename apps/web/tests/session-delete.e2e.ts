// Permanent Session deletion through the sidebar row action: confirm, the row
// disappears from the live list, and the stored log is gone from the Host.
// This flow makes no model calls and keeps the seed cold; the close-and-retry
// path for a Session open in this window is covered by the ui-workspace
// navigation tests.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  acknowledgeReloadConnectionLoss, launchWebScaffold, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

// Another scenario's committed fixture, reused read-only: this spec needs any
// one cold Session row, not new recorded content.
const SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))
const SEED_ID = 'session-delete-web-e2e'

describe('web e2e: a Session is permanently deleted from the sidebar row action', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  /**
   * Expand the Ungrouped group when it renders collapsed so its rows are
   * addressable, then return the section holding them.
   * @returns the expanded Ungrouped section locator.
   */
  async function ungroupedSection(): Promise<Locator> {
    const header = page.getByText('Ungrouped', { exact: true })
    const groupRow = header.locator('..').locator('..')
    await expect.poll(async () => {
      if (await groupRow.count() === 0) return 'absent'
      if (await groupRow.getAttribute('aria-expanded') !== 'true') {
        await header.click()
        return 'collapsed'
      }
      return 'expanded'
    }, { timeout: 15_000 }).toBe('expanded')
    return groupRow.locator('..')
  }

  /**
   * Reveal and click a hover-only row button, re-hovering if a projection
   * update replaces the row before the button becomes visible.
   * @param row - the row owning the action.
   * @param button - the action button locator.
   */
  async function clickHoverButton(row: Locator, button: Locator): Promise<void> {
    await expect.poll(async () => {
      await row.hover()
      return await button.isVisible()
    }, { timeout: 10_000 }).toBe(true)
    await button.click()
  }

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    // Seed one cold session; with no Workspace registered it is the sidebar's
    // only row, in the Ungrouped bucket.
    await seedSession(scaffold, await readFile(SEED, 'utf8'), SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('confirms running work, stops it, deletes the stored log, and keeps it gone across reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-session-delete'))
    const sessionRow = (await ungroupedSection()).locator('[role="treeitem"]')
      .filter({ has: page.locator('button[aria-label^="Session actions for "]') })
    await expect.poll(() => sessionRow.count(), { timeout: 10_000 }).toBe(1)
    await sessionRow.click()
    await expect.poll(() => sessionRow.getAttribute('aria-selected'), { timeout: 10_000 }).toBe('true')
    // Opening the conversation resumes its Agent: deletion must close it
    // before the Host can release the stored log.
    await expect.poll(() => scaffold.ctx.agents.get(SessionId(SEED_ID)) !== undefined,
      { timeout: 10_000 }).toBe(true)

    // Report one family of running work so the Host refuses the plain delete
    // and the dialog has to ask before stopping it.
    const stopped: SessionId[] = []
    scaffold.ctx.on('workspace/session-activity', async (_request, next) => [
      { kind: 'turn' },
      ...await next(),
    ])
    scaffold.ctx.on('workspace/session-stop', ({ sessionId }) => { stopped.push(sessionId) })

    await clickHoverButton(sessionRow, sessionRow.getByRole('button', { name: 'Delete session' }))
    const dialog = page.getByRole('dialog', { name: 'Delete this session permanently?' })
    await dialog.waitFor({ timeout: 10_000 })
    await expect.poll(() => dialog.textContent(), { timeout: 10_000 }).toContain('history will be deleted permanently')
    await dialog.getByRole('button', { name: 'Delete session' }).click()

    // The Host refused because the Session still runs work; the dialog names it
    // and offers the stop-and-delete hop instead of removing anything.
    const activity = dialog.getByRole('list', { name: 'Work that will be stopped' })
    await activity.waitFor({ timeout: 10_000 })
    expect(await activity.locator('li').allTextContents()).toEqual(['The turn in progress'])
    await expect.poll(() => scaffold.ctx.agents.get(SessionId(SEED_ID)) !== undefined,
      { timeout: 10_000 }).toBe(true)
    await dialog.getByRole('button', { name: 'Stop and delete' }).click()

    // Success closes the dialog, removes the row, and drops the now-empty bucket.
    await expect.poll(() => stopped, { timeout: 20_000 }).toEqual([SessionId(SEED_ID)])
    await expect.poll(() => dialog.count(), { timeout: 20_000 }).toBe(0)
    await expect.poll(() => sessionRow.count(), { timeout: 20_000 }).toBe(0)
    await expect.poll(() => page.getByText('Ungrouped', { exact: true }).count(), { timeout: 20_000 }).toBe(0)
    // Durable on the Host: the log is gone and no registry trace survives.
    expect((await scaffold.ctx.sessionPersistence.list()).map(snapshot => snapshot.header.id))
      .not.toContain(SessionId(SEED_ID))
    expect(await scaffold.ctx.sessionPersistence.stat(SessionId(SEED_ID))).toBeUndefined()
    expect([...scaffold.ctx.workspaceRegistry.archivedSessionIds]).toEqual([])
    expect([...scaffold.ctx.workspaceRegistry.pinnedSessionIds]).toEqual([])

    // Reload: the absent row is rebuilt from the Host baseline, so the delete
    // was durable and not merely client state.
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await expect.poll(() => page.getByRole('treeitem').count(), { timeout: 15_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 150_000)
})
