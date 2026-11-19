/** A settled mermaid fence renders as one named diagram card in the assembled Web surface. */
import { mkdir, readFile } from 'node:fs/promises'
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
const SHOT_DIR = fileURLToPath(new URL('../../../.artifacts/screenshots/mermaid-viewer', import.meta.url))

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

  it('renders two named diagram cards with source swap and a chat-scale viewer', async () => {
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

    const originalViewport = page.viewportSize()!
    await card.getByRole('button', { name: 'Open diagram in viewer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Diagram viewer' })
    await dialog.waitFor()
    // The viewer holds live vector SVG at the chat scale, not a raster data URL.
    expect(await dialog.locator('img').count()).toBe(0)
    const viewerSvg = dialog.locator('[role="img"] svg')
    await viewerSvg.waitFor()
    const chatWidth = await card.locator('[role="img"] svg').evaluate(el => el.getBoundingClientRect().width)
    expect(await viewerSvg.evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(chatWidth, 0)
    // One catalog zoom step snaps to the next 0.25 grid node above the chat scale.
    const intrinsic = await viewerSvg.evaluate(el => (el as SVGSVGElement).viewBox.baseVal.width)
    const s0 = Number(await card.getAttribute('data-fit-scale'))
    const stepped = Math.min(4, (Math.floor(s0 / 0.25) + 1) * 0.25)
    await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click()
    expect(await viewerSvg.evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(intrinsic * stepped, 0)
    await mkdir(SHOT_DIR, { recursive: true })
    await page.screenshot({ path: join(SHOT_DIR, `viewer-light-${MODE}-${process.pid}.png`) })
    await page.setViewportSize({ width: 320, height: 1000 })
    await page.screenshot({ path: join(SHOT_DIR, `viewer-narrow-${MODE}-${process.pid}.png`) })
    // Overflow scrolls with a reachable start and end, by pointer and by keyboard.
    const metrics = await dialog.locator('[role="img"]').evaluate((el) => {
      const vp = el.parentElement!.parentElement!
      return { sw: vp.scrollWidth, cw: vp.clientWidth, left: el.getBoundingClientRect().left, vpLeft: vp.getBoundingClientRect().left }
    })
    expect(metrics.sw).toBeGreaterThan(metrics.cw)
    expect(metrics.left).toBeCloseTo(metrics.vpLeft, 0)
    await dialog.locator('[role="img"]').evaluate((el) => {
      const vp = el.parentElement!.parentElement!
      vp.scrollLeft = vp.scrollWidth
      return { right: el.getBoundingClientRect().right, vpRight: vp.getBoundingClientRect().right }
    }).then((end) => { expect(end.right).toBeCloseTo(end.vpRight, 0) })
    await dialog.locator('[aria-label="Diagram scroll region"]').evaluate((el) => { el.scrollLeft = 0 })
    // The scroller is keyboard-reachable: Tab from the close control lands on it.
    await dialog.getByRole('button', { name: 'Close', exact: true }).focus()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Diagram scroll region')
    await page.setViewportSize(originalViewport)
    // A theme revision closes the open viewer; reopen on dark for the second probe.
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => dialog.count()).toBe(0)
    await card.locator('[role="img"]').waitFor()
    await card.getByRole('button', { name: 'Open diagram in viewer' }).click()
    await dialog.waitFor()
    await page.screenshot({ path: join(SHOT_DIR, `viewer-dark-${MODE}-${process.pid}.png`) })
    await page.keyboard.press('Escape')
    await expect.poll(() => dialog.count()).toBe(0)
    await page.emulateMedia({ colorScheme: 'light' })
    await card.locator('[role="img"]').waitFor()

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
    // The fitted svg's real scale equals the computed fit: its width is
    // min(measureWidth, W), with body padding outside the measure container.
    const fitted = await small.evaluate((card) => {
      const measure = card.querySelector('[role="img"]')!.parentElement as HTMLElement
      const svg = card.querySelector('[role="img"] svg') as SVGSVGElement
      return { measure: measure.clientWidth, width: svg.viewBox.baseVal.width, svg: svg.getBoundingClientRect().width }
    })
    expect(fitted.svg).toBeCloseTo(Math.min(fitted.measure, fitted.width), 0)
    expect(await wide.getAttribute('data-fit-mode')).toBe('natural')
    const wideOverflow = await wide.locator('[role="img"]').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(wideOverflow.scroll).toBeGreaterThan(wideOverflow.client)
    // The cached svg node survives resize: a mode switch rewrites attributes
    // only, it never swaps the rendered diagram.
    await wide.locator('[role="img"] svg').evaluate((el) => { el.setAttribute('data-resize-probe', 'kept') })
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
