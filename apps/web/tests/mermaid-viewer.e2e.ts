/** The mermaid viewer holds the chat-scale SVG, steps catalog zoom, and scrolls its overflow. */
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/mermaid-viewer', import.meta.url))
const OVERLAY = fileURLToPath(new URL('./mermaid-fence.overlay.yml', import.meta.url))
const SHOT_DIR = fileURLToPath(new URL('../../../.artifacts/screenshots/mermaid-viewer', import.meta.url))
const MODE = webSnapshotMode()
const DIAGRAM_NAME = 'Mermaid diagram'
const SCROLL_LABEL = 'Diagram scroll region'
const FAILURE_NOTICE = 'The diagram could not be rendered; showing the source.'
const DIALOG = '[role="dialog"][aria-label="Diagram viewer"]'
/** Catalog zoom contract: `DOCUMENT_ZOOM` steps land on the next 0.25 grid node, clamped to [0.25, 4]. */
const ZOOM_STEP = 0.25
const ZOOM_MAX = 4

/** Chat-side facts of one settled diagram card: published scale plus intrinsic and rendered widths. */
interface ChatFacts {
  readonly mode: string | null
  readonly scale: number
  readonly intrinsic: number
  readonly rendered: number
}

/** Viewer-side facts: scaled svg width and the scroll extents of its viewport. */
interface ViewerFacts {
  readonly width: number
  readonly intrinsic: number
  readonly scrollWidth: number
  readonly clientWidth: number
  readonly scrollHeight: number
  readonly clientHeight: number
}

/**
 * Read the card's published fit mode and chat scale next to the svg it renders.
 * @param card - the settled diagram card.
 * @returns the card's fit mode, published scale, viewBox width, and rendered width.
 */
async function cardFacts(card: Locator): Promise<ChatFacts> {
  return await card.evaluate((node) => {
    const svg = node.querySelector('[role="img"] svg') as SVGSVGElement
    return {
      mode: node.getAttribute('data-fit-mode'),
      scale: Number(node.getAttribute('data-fit-scale')),
      intrinsic: svg.viewBox.baseVal.width,
      rendered: svg.getBoundingClientRect().width,
    }
  })
}

/**
 * Read the viewer's scaled svg width and the scroll extents of the scroll viewport.
 * @param dialog - the open diagram viewer.
 * @returns the svg's rendered and intrinsic widths plus the viewport's scroll box.
 */
async function viewerFacts(dialog: Locator): Promise<ViewerFacts> {
  return await dialog.locator(`[aria-label="${SCROLL_LABEL}"]`).evaluate((viewport) => {
    const svg = viewport.querySelector('svg') as SVGSVGElement
    return {
      width: svg.getBoundingClientRect().width,
      intrinsic: svg.viewBox.baseVal.width,
      scrollWidth: viewport.scrollWidth,
      clientWidth: viewport.clientWidth,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
    }
  })
}

/**
 * Read the toolbar's committed zoom percentage.
 * @param dialog - the open diagram viewer.
 * @returns the percentage shown in the zoom menu control.
 */
async function zoomPercent(dialog: Locator): Promise<number> {
  const text = (await dialog.getByRole('button', { name: 'Choose zoom', exact: true }).textContent())?.trim() ?? ''
  return Number.parseInt(text, 10)
}

/**
 * Wait until every card shows a freshly rendered svg: a theme revision replaces
 * each card body with the code block until its new attempt settles.
 * @param cards - the scenario's diagram cards.
 * @param stale - svg ids observed before the revision.
 */
async function settleCards(cards: Locator, stale: readonly string[]): Promise<void> {
  await expect.poll(async () => await cards.evaluateAll((nodes, previous) => {
    const ids = nodes.map(node => node.querySelector('[role="img"] svg')?.getAttribute('id') ?? '')
    return ids.length === previous.length && ids.every(id => id !== '' && !previous.includes(id))
  }, stale), { timeout: 20_000, message: 'diagram cards did not settle after the theme revision' }).toBe(true)
}

describe('web e2e: mermaid diagram viewer', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    await seedSession(scaffold, await readFile(join(SNAPSHOT_DIR, 'session.v4.jsonl'), 'utf8'), 'mermaid-viewer')
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.locator('[role="treeitem"]').first().click()
    await page.locator('[role="treeitem"]').nth(1).click()
    // The overlay guard: without the enabled row the fence stays a code block
    // and this wait times out instead of snapshotting a stable code golden.
    await page.getByRole('img', { name: DIAGRAM_NAME }).first().waitFor({ timeout: 30_000 })
    // Attempts serialize across cards; the wide pipeline fence settles last.
    await page.getByRole('img', { name: DIAGRAM_NAME }).nth(2).waitFor({ timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('opens the diagram at the published chat scale and steps the catalog zoom grid', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mermaid-viewer-scale'))
    const cards = page.locator('[data-mermaid-card]')
    expect(await cards.count()).toBe(3)
    // Three fences: a narrow loop that fits at 1:1, the wide pipeline at its
    // natural width, and the medium pipeline that the column fits below 1:1.
    const loop = await cardFacts(cards.nth(0))
    const pipeline = await cardFacts(cards.nth(1))
    const medium = await cardFacts(cards.nth(2))
    expect(loop.mode).toBe('fit')
    expect(pipeline.mode).toBe('natural')
    expect(medium.mode).toBe('fit')
    // The fitted card proves the published scale is the resolved column fit, not
    // a constant 1:1: a viewer that ignored data-fit-scale renders it wider.
    expect(medium.scale).toBeLessThan(1)
    expect(medium.scale).toBeGreaterThanOrEqual(0.85)
    expect(medium.rendered).toBeCloseTo(medium.scale * medium.intrinsic, 0)
    expect(loop.rendered).toBeCloseTo(loop.scale * loop.intrinsic, 0)
    expect(pipeline.rendered).toBeCloseTo(pipeline.scale * pipeline.intrinsic, 0)

    await cards.nth(2).getByRole('button', { name: 'Open diagram in viewer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Diagram viewer' })
    await dialog.waitFor()
    // The viewer holds live vector SVG at the chat scale under the card's name.
    expect(await dialog.locator('img').count()).toBe(0)
    await dialog.getByRole('img', { name: DIAGRAM_NAME, exact: true }).waitFor()
    await dialog.locator(`[aria-label="${SCROLL_LABEL}"]`).waitFor()
    const opened = await viewerFacts(dialog)
    expect(opened.width).toBeCloseTo(medium.rendered, 0)
    expect(opened.width).toBeCloseTo(medium.scale * medium.intrinsic, 0)
    // A fence that cannot parse renders the source notice, and mermaid's own
    // "Syntax error" graphic must not be left in the document.
    await page.getByText(FAILURE_NOTICE, { exact: true }).waitFor()
    expect(await page.evaluate(() => [...document.querySelectorAll('*')]
      .filter(node => node.textContent?.includes('Syntax error in text')).length)).toBe(0)

    // The golden pins the dialog structure and labels; the numeric scale stays
    // in the explicit expects above, so the percentage is tokenized.
    const percent = await zoomPercent(dialog)
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'ui.expected.md'), await captureStableAria(page, DIALOG,
      scaffold.workspaceCwd, { replacements: [[`${percent}%`, '{{percent}}']] }), MODE)

    // One catalog step snaps to the next 0.25 grid node above the off-grid chat
    // scale, and the reverse step lands on the grid node below it.
    const stepped = Math.min(ZOOM_MAX, (Math.floor(medium.scale / ZOOM_STEP) + 1) * ZOOM_STEP)
    const steppedBack = Math.max(0.25, stepped - ZOOM_STEP)
    expect(stepped).toBeGreaterThan(medium.scale)
    expect(steppedBack).toBeLessThan(medium.scale)
    const zoomIn = dialog.getByRole('button', { name: 'Zoom in', exact: true })
    await zoomIn.click()
    expect(await zoomPercent(dialog)).toBe(Math.round(stepped * 100))
    await expect.poll(async () => (await viewerFacts(dialog)).width).toBeCloseTo(stepped * opened.intrinsic, 0)
    await dialog.getByRole('button', { name: 'Zoom out', exact: true }).click()
    expect(await zoomPercent(dialog)).toBe(Math.round(steppedBack * 100))
    await expect.poll(async () => (await viewerFacts(dialog)).width).toBeCloseTo(steppedBack * opened.intrinsic, 0)
    await page.keyboard.press('Escape')
    await expect.poll(() => dialog.count()).toBe(0)

    // The natural card opens at its 1:1 width, which is what the chat shows.
    await cards.nth(1).getByRole('button', { name: 'Open diagram in viewer' }).click()
    await dialog.waitFor()
    await expect.poll(async () => (await viewerFacts(dialog)).width).toBeCloseTo(pipeline.rendered, 0)
    await mkdir(SHOT_DIR, { recursive: true })
    await page.screenshot({ path: join(SHOT_DIR, `scale-light-${MODE}-${process.pid}.png`) })

    // A short page viewport at the zoom ceiling overflows both axes; the start
    // and both ends stay reachable through the scroll viewport.
    const originalViewport = page.viewportSize()!
    await page.setViewportSize({ width: originalViewport.width, height: 200 })
    for (let step = 0; step < 16; step += 1) {
      if (await zoomIn.isDisabled()) break
      await zoomIn.click()
    }
    expect(await zoomPercent(dialog)).toBe(ZOOM_MAX * 100)
    const overflow = await viewerFacts(dialog)
    expect(overflow.width).toBeCloseTo(ZOOM_MAX * overflow.intrinsic, 0)
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth)
    expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight)
    const viewport = dialog.locator(`[aria-label="${SCROLL_LABEL}"]`)
    const start = await viewport.evaluate((node) => {
      node.scrollLeft = 0
      node.scrollTop = 0
      const content = node.firstElementChild!.getBoundingClientRect()
      const box = node.getBoundingClientRect()
      return { left: Math.abs(content.left - box.left), top: Math.abs(content.top - box.top) }
    })
    expect(Math.max(start.left, start.top)).toBeLessThanOrEqual(1)
    const end = await viewport.evaluate((node) => {
      node.scrollLeft = node.scrollWidth
      node.scrollTop = node.scrollHeight
      const content = node.firstElementChild!.getBoundingClientRect()
      const box = node.getBoundingClientRect()
      return {
        right: Math.abs(content.right - box.right),
        bottom: Math.abs(content.bottom - box.bottom),
        scrollLeft: node.scrollLeft,
        scrollTop: node.scrollTop,
        maxLeft: node.scrollWidth - node.clientWidth,
        maxTop: node.scrollHeight - node.clientHeight,
      }
    })
    expect(end.right).toBeLessThanOrEqual(1)
    expect(end.bottom).toBeLessThanOrEqual(1)
    expect(end.scrollLeft).toBe(end.maxLeft)
    expect(end.scrollTop).toBe(end.maxTop)
    await page.screenshot({ path: join(SHOT_DIR, `scale-zoommax-${MODE}-${process.pid}.png`) })
    await page.setViewportSize(originalViewport)
    await page.keyboard.press('Escape')
    await expect.poll(() => dialog.count()).toBe(0)

    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['session.v4.jsonl', 'ui.expected.md'])
  })

  it('reopens on the dark theme after settle and keeps the chat scale in a narrow column', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mermaid-viewer-theme'))
    const cards = page.locator('[data-mermaid-card]')
    const loopCard = cards.nth(0)
    const stale = await cards.evaluateAll(nodes =>
      nodes.map(node => node.querySelector('[role="img"] svg')?.getAttribute('id') ?? ''))
    await loopCard.getByRole('button', { name: 'Open diagram in viewer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Diagram viewer' })
    await dialog.waitFor()
    // A theme revision closes the open viewer; the reopen follows the settled card.
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => dialog.count()).toBe(0)
    await settleCards(cards, stale)
    const dark = await cardFacts(loopCard)
    await loopCard.getByRole('button', { name: 'Open diagram in viewer' }).click()
    await dialog.waitFor()
    await expect.poll(async () => (await viewerFacts(dialog)).width).toBeCloseTo(dark.scale * dark.intrinsic, 0)
    await mkdir(SHOT_DIR, { recursive: true })
    await page.screenshot({ path: join(SHOT_DIR, `scale-dark-${MODE}-${process.pid}.png`) })
    await page.keyboard.press('Escape')
    await expect.poll(() => dialog.count()).toBe(0)

    const darkStale = await cards.evaluateAll(nodes =>
      nodes.map(node => node.querySelector('[role="img"] svg')?.getAttribute('id') ?? ''))
    await page.emulateMedia({ colorScheme: 'light' })
    await settleCards(cards, darkStale)

    // A narrow column flips the loop diagram to natural size; the viewer still
    // opens it at the published chat scale and scrolls the overflow.
    await page.setViewportSize({ width: 320, height: 1000 })
    await expect.poll(() => loopCard.getAttribute('data-fit-mode')).toBe('natural')
    const narrow = await cardFacts(loopCard)
    await loopCard.getByRole('button', { name: 'Open diagram in viewer' }).click()
    await dialog.waitFor()
    const opened = await viewerFacts(dialog)
    expect(opened.width).toBeCloseTo(narrow.rendered, 0)
    expect(opened.width).toBeCloseTo(narrow.scale * opened.intrinsic, 0)
    expect(opened.scrollWidth).toBeGreaterThan(opened.clientWidth)
    await page.screenshot({ path: join(SHOT_DIR, `scale-narrow-${MODE}-${process.pid}.png`) })
    await page.keyboard.press('Escape')
    await expect.poll(() => dialog.count()).toBe(0)

    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
