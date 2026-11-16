/** A settled mermaid fence renders as one named diagram card in the assembled Web surface. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/mermaid-fence', import.meta.url))
const OVERLAY = fileURLToPath(new URL('./mermaid-fence.overlay.yml', import.meta.url))
const MODE = webSnapshotMode()
const DIAGRAM_NAME = 'Mermaid diagram'

describe('web e2e: mermaid fence diagram card', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    await seedSession(scaffold, await readFile(join(SNAPSHOT_DIR, 'session.v4.jsonl'), 'utf8'), 'mermaid-fence')
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.locator('[role="treeitem"]').first().click()
    await page.locator('[role="treeitem"]').nth(1).click()
    // The overlay guard: without the enabled row the fence stays a code block
    // and this wait times out instead of snapshotting a stable code golden.
    await page.getByRole('img', { name: DIAGRAM_NAME }).first().waitFor({ timeout: 30_000 })
    // Attempts serialize across cards; the wide pipeline fence settles second.
    await page.getByRole('img', { name: DIAGRAM_NAME }).nth(1).waitFor({ timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders exactly one named diagram card with source swap and a viewport-fit viewer', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mermaid-fence'))
    const card = page.locator('[data-mermaid-card]').first()
    expect(await page.locator('[data-mermaid-card]').count()).toBe(2)
    const golden = await captureStableAria(page, '[data-mermaid-card]', scaffold.workspaceCwd)
    expect(golden.match(/img "Mermaid diagram"/gu)).toHaveLength(1)
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'ui.expected.md'), golden, MODE)

    const toggle = card.getByRole('button', { name: 'Source', exact: true })
    await toggle.click()
    expect(await toggle.getAttribute('aria-pressed')).toBe('true')
    expect(await card.locator('pre').textContent()).toContain('flowchart LR')
    expect(await card.getByRole('img', { name: DIAGRAM_NAME }).count()).toBe(0)
    await toggle.click()
    expect(await toggle.getAttribute('aria-pressed')).toBe('false')
    await card.getByRole('img', { name: DIAGRAM_NAME }).waitFor()

    await card.getByRole('button', { name: 'Open diagram in viewer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Diagram viewer' })
    await dialog.waitFor()
    const src = await dialog.locator('img').getAttribute('src')
    expect(src?.startsWith('data:image/svg+xml;base64,')).toBe(true)
    await page.keyboard.press('Escape')
    await expect.poll(() => dialog.count()).toBe(0)

    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['session.v4.jsonl', 'ui.expected.md'])
  })

  it('fits the small diagram and scrolls the wide one, switching mode on resize without re-render', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mermaid-fit'))
    const cards = page.locator('[data-mermaid-card]')
    const small = cards.first()
    const wide = cards.nth(1)
    // The default column fits the 351px loop diagram and is far below the
    // wide pipeline's natural width: fitted vs natural branch side by side.
    await expect.poll(() => small.getAttribute('data-fit-mode')).toBe('fit')
    expect(await wide.getAttribute('data-fit-mode')).toBe('natural')
    const wideOverflow = await wide.locator('[role="img"]').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(wideOverflow.scroll).toBeGreaterThan(wideOverflow.client)
    // The cached svg node survives resize: a mode switch rewrites attributes
    // only, it never swaps the rendered diagram.
    await wide.locator('[role="img"] svg').evaluate(el => el.setAttribute('data-resize-probe', 'kept'))
    await page.setViewportSize({ width: 320, height: 1000 })
    await expect.poll(() => small.getAttribute('data-fit-mode')).toBe('natural')
    const narrowOverflow = await small.locator('[role="img"]').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(narrowOverflow.scroll).toBeGreaterThan(narrowOverflow.client)
    expect(await wide.getAttribute('data-fit-mode')).toBe('natural')
    expect(await wide.locator('[role="img"] svg').getAttribute('data-resize-probe')).toBe('kept')
    await page.setViewportSize({ width: 1680, height: 1000 })
    await expect.poll(() => small.getAttribute('data-fit-mode')).toBe('fit')
    expect(await wide.locator('[role="img"] svg').getAttribute('data-resize-probe')).toBe('kept')
    expect(tripwire.pageErrors).toEqual([])
  })
})
