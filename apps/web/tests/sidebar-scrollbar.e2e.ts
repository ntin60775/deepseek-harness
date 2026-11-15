// Browser geometry for the sidebar scrollbar reservation and theme. Headless
// Chromium uses overlay scrollbars, so the reserved band and `timeCoveredBy`
// together distinguish reserved space from a bar painted over content. Its
// computed pseudo-element style also folds in `:hover`, so the test reads that
// declaration from the cascade. The session list is the column's only vertical
// scroller: its bar stays drawn whenever the rows overflow, independent of the
// pointer, and the navigation stays pinned while the list scrolls natively.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, compareOrRefreshGolden, launchWebScaffold, seedSession, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/sidebar-scrollbar', import.meta.url))
/** Geometry and resolved style are absent from ARIA snapshots, so this scenario records them directly. */
const GEOMETRY_EXPECTED = join(SNAPSHOT_DIR, 'geometry.expected.md')
const MODE = webSnapshotMode()
/** Enough rows that the list overflows the 800px-tall viewport's sidebar; the scenario asserts the overflow rather than trusting it. */
const SEED_COUNT = 24

/** Geometry and resolved scrollbar style of one scroll container, measured in the page. */
interface ListMetrics {
  gutter: string
  width: string
  track: string
  standardWidth: string
  standardColor: string
  hoverRules: string[]
  token: string
  hoverToken: string
  overflows: boolean
  band: number
  scrollbarEdgeOffset: number
  rowEdgeInset: number
  rowPaintInset: number
  clientRight: number
  borderRight: number
  timeRight: number
  /**
   * Pixels of relative time under the scrollbar, measured against the bar's
   * width because an overlay scrollbar does not move the client edge.
   */
  timeCoveredBy: number
}

/**
 * Measure the sidebar list in the page.
 * @param page - the page under test.
 * @returns the list's resolved scrollbar style and the geometry the
 * scrollbar-gutter/thin-scrollbar declarations shape.
 */
function measureList(page: Page): Promise<ListMetrics> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[data-sidebar-list-area]')
    if (list === null) throw new Error('sidebar session list not in the DOM')
    const time = list.querySelector<HTMLElement>('[class*="time"]')
    if (time === null) throw new Error('no row relative-time element in the sidebar list')
    const row = list.querySelector<HTMLElement>('[role="treeitem"]')
    if (row === null) throw new Error('no row in the sidebar list')
    // Use one probe per variable because computed style declarations are live;
    // the color property also normalizes palette syntax.
    const resolve = (name: string): string => {
      const probe = document.createElement('span')
      probe.style.color = `var(${name})`
      list.append(probe)
      const value = getComputedStyle(probe).color
      probe.remove()
      return value
    }
    // Computed pseudo style folds in hover even at rest, so inspect active CSS groups.
    // Cross-origin sheets may throw and cannot contain the app-owned rule.
    const styleRules = (rules: CSSRuleList): CSSStyleRule[] => [...rules].flatMap((rule) => {
      if (rule instanceof CSSStyleRule) return [rule]
      if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) return []
      if (rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) return []
      return rule instanceof CSSGroupingRule ? styleRules(rule.cssRules) : []
    })
    const hoverRules = [...document.styleSheets]
      .flatMap((sheet) => {
        try {
          return styleRules(sheet.cssRules)
        } catch {
          return []
        }
      })
      .filter(rule => rule.selectorText === '::-webkit-scrollbar-thumb:hover')
      .map(rule => rule.style.getPropertyValue('background-color'))
    const style = getComputedStyle(list)
    const pseudoWidth = getComputedStyle(list, '::-webkit-scrollbar').width
    const barWidth = pseudoWidth === 'auto' ? 15 : Number.parseFloat(pseudoWidth)
    const listRect = list.getBoundingClientRect()
    const sidebarEdge = list.closest('[class*="sidebarCol"]')?.getBoundingClientRect().right
    if (sidebarEdge === undefined) throw new Error('sidebar session list has no layout parent')
    return {
      gutter: style.scrollbarGutter,
      width: pseudoWidth,
      track: getComputedStyle(list, '::-webkit-scrollbar-track').backgroundColor,
      standardWidth: style.scrollbarWidth,
      standardColor: style.scrollbarColor,
      hoverRules,
      token: resolve('--dsh-scrollbar-thumb'),
      hoverToken: resolve('--dsh-scrollbar-thumb-hover'),
      overflows: list.scrollHeight > list.clientHeight,
      band: listRect.width - list.clientWidth,
      scrollbarEdgeOffset: sidebarEdge - listRect.right,
      rowEdgeInset: sidebarEdge - row.getBoundingClientRect().right,
      rowPaintInset: sidebarEdge - row.getBoundingClientRect().right + Number.parseFloat(getComputedStyle(row).borderRightWidth),
      clientRight: listRect.left + list.clientWidth,
      borderRight: listRect.right,
      timeRight: time.getBoundingClientRect().right,
      // The bar is drawn in the rightmost `barWidth` of the border box, whether
      // or not that space was reserved. Its width comes from the sheet where the
      // sheet applies, and from the UA's own overlay bar otherwise — 15px is
      // what this chromium paints, measured with the rule absent. Taking the
      // UA width as the fallback is what keeps the assertion
      // honest: assuming 0 there would report no occlusion precisely in the
      // state that has it.
      timeCoveredBy: Math.max(0, time.getBoundingClientRect().right - (listRect.right - barWidth)),
    }
  })
}

/**
 * Measure only overflow and row inset, which remain observable when every
 * session is hidden under a collapsed workspace group.
 * @param page - the page under test.
 * @returns the list overflow state and first row's trailing inset.
 */
function measureRowInset(page: Page): Promise<Pick<ListMetrics, 'overflows' | 'rowEdgeInset' | 'rowPaintInset'>> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[data-sidebar-list-area]')
    if (list === null) throw new Error('sidebar session list not in the DOM')
    const row = list.querySelector<HTMLElement>('[role="treeitem"]')
    if (row === null) throw new Error('no row in the sidebar list')
    const sidebarEdge = list.closest('[class*="sidebarCol"]')?.getBoundingClientRect().right
    if (sidebarEdge === undefined) throw new Error('sidebar session list has no layout parent')
    return {
      overflows: list.scrollHeight > list.clientHeight,
      rowEdgeInset: sidebarEdge - row.getBoundingClientRect().right,
      rowPaintInset: sidebarEdge - row.getBoundingClientRect().right + Number.parseFloat(getComputedStyle(row).borderRightWidth),
    }
  })
}

/** One palette's readings, with the thumb resolved while the pointer is away. */
interface PaletteMetrics {
  metrics: ListMetrics
  awayThumb: string
}

/**
 * Read one palette with the pointer outside the column: the bar must stay
 * drawn there, so the away reading is the subject rather than a quiet state.
 * @param page - the page under test.
 * @returns the palette's away thumb and its list metrics.
 */
async function measurePalette(page: Page): Promise<PaletteMetrics> {
  await pointAt(page, 'away')
  const awayThumb = await resolveThumb(page)
  return { metrics: await measureList(page), awayThumb }
}

/**
 * Render platform-neutral differences and comparisons instead of absolute
 * coordinates that depend on sidebar width and font metrics.
 * @param light - metrics measured under the light palette.
 * @param dark - metrics measured under the dark palette.
 * @returns the golden body, without a trailing newline.
 */
function renderGeometry(light: PaletteMetrics, dark: PaletteMetrics): string {
  const palette = (name: string, { metrics, awayThumb }: PaletteMetrics): string[] => [
    `## ${name}`,
    '',
    `- --dsh-scrollbar-thumb, pointer outside the sidebar: ${awayThumb}`,
    `- scrollbar-gutter: ${metrics.gutter}`,
    `- ::-webkit-scrollbar width: ${metrics.width}`,
    `- ::-webkit-scrollbar-track background: ${metrics.track}`,
    `- scrollbar-width: ${metrics.standardWidth}`,
    `- scrollbar-color: ${metrics.standardColor}`,
    `- ::-webkit-scrollbar-thumb:hover declarations: ${metrics.hoverRules.join(' | ')}`,
    `- --dsh-scrollbar-thumb, pointer over the list: ${metrics.token}`,
    `- --dsh-scrollbar-thumb-hover, pointer over the list: ${metrics.hoverToken}`,
    `- list overflows: ${String(metrics.overflows)}`,
    `- reserved band: ${String(metrics.band)}px`,
    `- scrollbar inset from the sidebar edge: ${String(metrics.scrollbarEdgeOffset)}px`,
    `- row hitbox inset from the sidebar edge: ${String(metrics.rowEdgeInset)}px`,
    `- row background inset from the sidebar edge: ${String(metrics.rowPaintInset)}px`,
    `- relative time covered by the bar: ${String(metrics.timeCoveredBy)}px`,
    `- relative time ends inside the content area: ${String(metrics.timeRight <= metrics.clientRight)}`,
    `- content area ends before the border box: ${String(metrics.clientRight < metrics.borderRight)}`,
    '',
  ]
  return [
    '# Sidebar session list scrollbar',
    '',
    ...palette('Light palette', light),
    ...palette('Dark palette', dark),
  ].join('\n').trimEnd()
}

/**
 * Resolve `--dsh-scrollbar-thumb` as the list sees it, without the rest of the
 * geometry. Own probe element for the same reason {@link measureList} uses
 * one: `getComputedStyle` returns a live declaration.
 * @param page - the page under test.
 * @returns the resolved thumb colour, serialized as `rgb`/`rgba`.
 */
function resolveThumb(page: Page): Promise<string> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[data-sidebar-list-area]')
    if (list === null) throw new Error('sidebar session list not in the DOM')
    const probe = document.createElement('span')
    probe.style.color = 'var(--dsh-scrollbar-thumb)'
    list.append(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    return value
  })
}

/** Fully transparent, which is how a hidden bar would spell "no thumb". */
const NO_THUMB = 'rgba(0, 0, 0, 0)'

/**
 * Park the pointer over the session list or outside the sidebar entirely.
 * @param page - the page under test.
 * @param where - `list` to point at the session list, `away` for the far side
 * of the viewport (the conversation column).
 */
async function pointAt(page: Page, where: 'list' | 'away'): Promise<void> {
  const box = await page.locator('[data-sidebar-list-area]').boundingBox()
  if (box === null) throw new Error('sidebar session list has no layout box')
  const viewport = page.viewportSize()
  if (viewport === null) throw new Error('page has no viewport')
  const target = where === 'list'
    ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    : { x: viewport.width - 5, y: box.y + box.height / 2 }
  await page.mouse.move(target.x, target.y)
}

/**
 * Reveal the seeded rows: every seeded session is unattached, so they all sit
 * in the collapsed Ungrouped bucket. Open the bucket, then use its transient
 * Show-more control because an open group intentionally renders only five
 * rows by default. Hand-rolled polling because
 * `expect.poll` is test-scoped and this runs in `beforeAll`.
 * @param page - the page under test.
 */
async function expandSeededSessions(page: Page): Promise<void> {
  const bucket = page.getByText('Ungrouped', { exact: true }).locator('..').locator('..')
  await bucket.waitFor({ timeout: 15_000 })
  const rows = page.locator('[role="tree"][aria-label="Sessions"] [role="treeitem"]')
  const deadline = Date.now() + 30_000
  for (;;) {
    if (await bucket.getAttribute('aria-expanded') !== 'true') {
      await page.getByText('Ungrouped', { exact: true }).click()
    }
    const showMore = page.getByRole('button', { name: /Show \d+ more sessions/ })
    if (await bucket.getAttribute('aria-expanded') === 'true'
      && await rows.count() < SEED_COUNT
      && await showMore.count() > 0) {
      await showMore.click()
    }
    if (await bucket.getAttribute('aria-expanded') === 'true' && await rows.count() >= SEED_COUNT) return
    if (Date.now() > deadline) {
      throw new Error(`Ungrouped bucket never revealed all ${SEED_COUNT} rows`)
    }
    await page.waitForTimeout(200)
  }
}

/**
 * Scroll positions of the sidebar viewport and the session list, with the fixed controls around them.
 * @param page - the page under test.
 * @returns both scroll offsets and ranges, plus the toolbar, navigation, and fixed-control edges.
 */
function nestedScrollGeometry(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('[data-sidebar-scrollport]')!
    const list = document.querySelector<HTMLElement>('[data-sidebar-list-area]')!
    const column = viewport.closest('[class*="sidebarCol"]')!
    const edge = (selector: string) => column.querySelector(selector)!.getBoundingClientRect()
    return {
      viewportTop: viewport.getBoundingClientRect().top,
      viewportScroll: viewport.scrollTop,
      viewportRange: viewport.scrollHeight - viewport.clientHeight,
      listScroll: list.scrollTop,
      listRange: list.scrollHeight - list.clientHeight,
      headerTop: edge('[data-sidebar-workspace-header]').top,
      navBottom: edge('[class*="panelList"]').bottom,
      buttonTop: edge('button[class*="newSession"]').top,
      footerTop: edge('[class*="footArea"]').top,
    }
  })
}

/**
 * Return the session list to its top; the viewport no longer scrolls.
 * @param page - the page under test.
 */
async function resetNestedScroll(page: Page): Promise<void> {
  await page.locator('[data-sidebar-list-area]').evaluate((el) => { el.scrollTop = 0 })
}

/**
 * Park the pointer at the center of the first element matching `selector`.
 * @param page - the page under test.
 * @param selector - the element to point at.
 */
async function pointInto(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`${selector} has no layout box`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
}

/** Drag geometry of the list's WebKit thumb, in page coordinates. */
interface ThumbDrag {
  x: number
  y: number
  range: number
  travel: number
}

/**
 * Locate the thumb center and the scroll range a full track travel maps to.
 * @param page - the page under test.
 * @returns the drag start point, the list's scroll range, and the track travel.
 */
function thumbDrag(page: Page): Promise<ThumbDrag> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[data-sidebar-list-area]')!
    const rect = list.getBoundingClientRect()
    const barWidth = Number.parseFloat(getComputedStyle(list, '::-webkit-scrollbar').width)
    const trackMargin = Number.parseFloat(getComputedStyle(list, '::-webkit-scrollbar-track').marginTop)
    const track = list.clientHeight - trackMargin * 2
    const thumb = Math.max(track * (list.clientHeight / list.scrollHeight), 20)
    const range = list.scrollHeight - list.clientHeight
    const top = rect.top + trackMargin + (list.scrollTop / range) * (track - thumb)
    return { x: rect.right - barWidth / 2, y: top + thumb / 2, range, travel: track - thumb }
  })
}

describe('web e2e: sidebar session list scrollbar (reserved gutter / themed thumb)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    const fixture = await readFile(SEED, 'utf8')
    for (let index = 0; index < SEED_COUNT; index += 1) {
      await seedSession(scaffold, fixture, `sidebar-scrollbar-web-e2e-${String(index).padStart(2, '0')}`)
    }
    // Playwright's headless default args hide scrollbars, which would leave
    // the styled bar unpainted and its thumb undraggable; headful browsers
    // draw it, so the scenario opts out of the hiding.
    browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })
    // Shorter than the other scenarios' 1000px so SEED_COUNT rows overflow
    // the list with room to spare.
    page = await newEnglishPage(browser, 800)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await expandSeededSessions(page)
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('reserves a scrollbar gutter on the overflowing session list', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-scrollbar-gutter'))
    // Vacuity guard: with a non-overflowing list `stable` still reserves, but
    // the scenario would no longer be reproducing the reported situation.
    await expect.poll(async () => (await measureList(page)).overflows, { timeout: 10_000 }).toBe(true)
    const metrics = await measureList(page)
    expect(metrics.gutter).toBe('stable')
    const horizontal = await page.locator('[data-sidebar-scrollport]').evaluate(viewport => ({
      overflow: getComputedStyle(viewport).overflowX,
      scrollbarHeight: viewport.getBoundingClientRect().height - viewport.clientHeight,
    }))
    expect(horizontal.overflow).toBe('hidden')
    expect(horizontal.scrollbarHeight).toBe(0)
    // Pin presence, not width, because the width is platform-dependent.
    expect(metrics.band).toBeGreaterThan(0)
    expect(metrics.scrollbarEdgeOffset).toBe(2)
    // The 14px drag rail plus the 2px edge offset reserve the trailing band;
    // rows stop clear of it instead of sliding under the thumb.
    expect(metrics.rowEdgeInset).toBe(16)
    expect(metrics.rowPaintInset).toBe(19)
    // Measure against the bar because overlay scrollbars do not move the client edge.
    expect(metrics.timeCoveredBy).toBe(0)
    expect(metrics.timeRight).toBeLessThanOrEqual(metrics.clientRight)
    expect(metrics.clientRight).toBeLessThan(metrics.borderRight)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('keeps the thumb drawn with the pointer away and while scrolling without a pointer', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-scrollbar-pointer'))
    await pointAt(page, 'away')
    const away = await resolveThumb(page)
    expect(away).not.toBe(NO_THUMB)
    expect(away).toBe((await measureList(page)).token)
    // Scrolling without a pointer — what a keyboard or a touch drag does —
    // keeps the bar drawn: it is the list's permanent affordance now.
    await page.locator('[data-sidebar-list-area]').evaluate((el) => { el.scrollTop += 200 })
    await page.waitForTimeout(500)
    expect(await resolveThumb(page)).toBe(away)
    await pointAt(page, 'list')
    expect(await resolveThumb(page)).toBe(away)
    await resetNestedScroll(page)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('removes the list scroll range without moving row edges when grouped content fits', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-scrollbar-stable-inset'))
    const viewport = page.locator('[data-sidebar-list-area]')
    const height = await viewport.evaluate(el => el.scrollHeight)
    expect(await measureRowInset(page)).toEqual({ overflows: true, rowEdgeInset: 16, rowPaintInset: 19 })
    const bucket = page.getByText('Ungrouped', { exact: true }).locator('..').locator('..')
    await bucket.click()
    try {
      await expect.poll(async () => viewport.evaluate(el => el.scrollHeight)).toBeLessThan(height)
      await expect.poll(async () => (await measureRowInset(page)).overflows).toBe(false)
      expect(await measureRowInset(page)).toEqual({ overflows: false, rowEdgeInset: 16, rowPaintInset: 19 })
      // The pinned navigation never scrolls, in either state.
      expect((await nestedScrollGeometry(page)).viewportRange).toBe(0)
    } finally {
      await expandSeededSessions(page)
      await viewport.evaluate((el) => { el.scrollTop = 0 })
    }
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('scrolls the list natively while the navigation stays pinned', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-nested-scroll'))
    const size = page.viewportSize()!
    try {
      await page.setViewportSize({ width: size.width, height: 500 })
      await resetNestedScroll(page)
      const before = await nestedScrollGeometry(page)
      expect(before.viewportRange).toBe(0)
      expect(before.listRange).toBeGreaterThan(60)
      expect(before.navBottom).toBeGreaterThan(before.viewportTop)
      await pointInto(page, '[data-sidebar-list-area] [role="treeitem"]')
      await page.mouse.wheel(0, 120)
      await expect.poll(async () => (await nestedScrollGeometry(page)).listScroll).toBe(120)
      const after = await nestedScrollGeometry(page)
      expect(after.viewportScroll).toBe(0)
      expect(after.headerTop).toBe(before.headerTop)
      expect(after.navBottom).toBe(before.navBottom)
      expect(after.buttonTop).toBe(before.buttonTop)
      expect(after.footerTop).toBe(before.footerTop)
      await page.mouse.wheel(0, -120)
      await expect.poll(async () => (await nestedScrollGeometry(page)).listScroll).toBe(0)
      // Wheel over the pinned navigation moves nothing: the viewport clips.
      await pointInto(page, '[data-sidebar-scrollport] [class*="panelList"]')
      await page.mouse.wheel(0, 120)
      await page.waitForTimeout(300)
      const idle = await nestedScrollGeometry(page)
      expect(idle.listScroll).toBe(0)
      expect(idle.viewportScroll).toBe(0)
    } finally {
      await page.setViewportSize(size)
      await resetNestedScroll(page)
    }
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('drags the scrollbar thumb to scroll the session list and back', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-scrollbar-drag'))
    await resetNestedScroll(page)
    const drag = await thumbDrag(page)
    expect(drag.range).toBeGreaterThan(60)
    const distance = Math.min(150, drag.travel)
    await page.mouse.move(drag.x, drag.y)
    await page.mouse.down()
    await page.mouse.move(drag.x, drag.y + distance, { steps: 8 })
    await page.mouse.up()
    const scrolled = (await nestedScrollGeometry(page)).listScroll
    // The thumb maps track travel onto the scroll range proportionally.
    const expected = distance * (drag.range / drag.travel)
    expect(scrolled).toBeGreaterThan(expected / 2)
    expect(scrolled).toBeLessThanOrEqual(expected + 2)
    expect((await nestedScrollGeometry(page)).viewportScroll).toBe(0)
    const back = await thumbDrag(page)
    await page.mouse.move(back.x, back.y)
    await page.mouse.down()
    await page.mouse.move(back.x, back.y - distance, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await nestedScrollGeometry(page)).listScroll).toBeLessThan(3)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('steps and holds the rail arrows like Windows scroll buttons', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-rail-arrows'))
    await resetNestedScroll(page)
    const up = page.getByRole('button', { name: 'Scroll up', exact: true })
    const down = page.getByRole('button', { name: 'Scroll down', exact: true })
    expect(await up.isDisabled()).toBe(true)
    expect(await down.isDisabled()).toBe(false)
    // One click steps three 34px rows.
    await down.click()
    await expect.poll(async () => (await nestedScrollGeometry(page)).listScroll).toBe(102)
    // Holding steps once, waits, then repeats until release.
    const box = (await down.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(900)
    await page.mouse.up()
    const held = (await nestedScrollGeometry(page)).listScroll
    expect(held).toBeGreaterThan(102 + 34 * 4)
    expect((await nestedScrollGeometry(page)).viewportScroll).toBe(0)
    await up.click()
    await expect.poll(async () => (await nestedScrollGeometry(page)).listScroll).toBe(held - 102)
    await resetNestedScroll(page)
    await expect.poll(async () => up.isDisabled()).toBe(true)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('keeps the toolbar pinned through empty search results', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-nested-scroll-search'))
    const header = page.locator('[data-sidebar-workspace-header]')
    const input = header.locator('input')
    const size = page.viewportSize()!
    try {
      await page.setViewportSize({ width: size.width, height: 500 })
      await resetNestedScroll(page)
      const before = await nestedScrollGeometry(page)
      const searchButton = await page.getByRole('button', { name: 'Search sessions', exact: true }).boundingBox()
      if (searchButton === null) throw new Error('Search sessions has no layout box')
      await page.mouse.click(searchButton.x + searchButton.width / 2, searchButton.y + searchButton.height / 2)
      expect(await input.evaluate(el => el === document.activeElement)).toBe(true)
      await input.fill('no-sidebar-scroll-matches-9f4c')
      await page.locator('[class*="searchTree"]').locator('..').locator('[class*="empty"]').waitFor()
      const filtered = await nestedScrollGeometry(page)
      expect(filtered.viewportScroll).toBe(0)
      expect(filtered.headerTop).toBe(before.headerTop)
      expect((await header.boundingBox())?.height).toBe(36)
    } finally {
      if (await input.isVisible()) { await input.fill(''); await input.press('Escape') }
      await page.setViewportSize(size)
      await expandSeededSessions(page)
      await resetNestedScroll(page)
    }
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('renders the themed thumb through the WebKit path in both palettes', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-scrollbar-theme'))
    const light = await measureList(page)
    // The gate's signature on this engine, and the reason it exists: chromium
    // implements `::-webkit-scrollbar`, so the standard properties stay at
    // their initial `auto`. A concrete value here would mean the gate leaked,
    // which is exactly what makes chromium discard the pseudo-element rules —
    // the hover token included.
    expect(light.standardWidth).toBe('auto')
    expect(light.standardColor).toBe('auto')
    // The pseudo-element path is the one in force: the shell's 14px drag rail
    // and transparent track reached a container the sheet never names.
    expect(light.width).toBe('14px')
    expect(light.track).toBe('rgba(0, 0, 0, 0)')
    // The resting and the hover rule each read the rebindable indirection, and
    // the two resolve to DIFFERENT colours on this list: the l2 pair arrived
    // here intact rather than collapsing to one value or falling back.
    expect(light.hoverRules).toEqual(['var(--dsh-scrollbar-thumb-hover)'])
    expect(light.token).toMatch(/^rgba?\(/)
    expect(light.hoverToken).not.toBe(light.token)
    // The dark palette declares different scrollbar tokens; driving the body
    // attribute pins the cascade the way lifecycle-chrome does (the Settings
    // gesture that sets it is owned there).
    await page.evaluate(() => { document.body.setAttribute('data-ds-dark-theme', '') })
    const dark = await measureList(page)
    expect(dark.token).not.toBe(light.token)
    expect(dark.hoverToken).not.toBe(dark.token)
    expect(dark.hoverToken).not.toBe(light.hoverToken)
    await page.evaluate(() => { document.body.removeAttribute('data-ds-dark-theme') })
    const restored = await measureList(page)
    expect(restored.token).toBe(light.token)
    expect(restored.hoverToken).toBe(light.hoverToken)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('matches the committed scrollbar geometry golden in both palettes', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-scrollbar-golden'))
    const light = await measurePalette(page)
    expect(light.awayThumb).not.toBe(NO_THUMB)
    expect(light.awayThumb).toBe(light.metrics.token)
    await page.evaluate(() => { document.body.setAttribute('data-ds-dark-theme', '') })
    const dark = await measurePalette(page)
    expect(dark.awayThumb).not.toBe(NO_THUMB)
    expect(dark.awayThumb).toBe(dark.metrics.token)
    await page.evaluate(() => { document.body.removeAttribute('data-ds-dark-theme') })
    await compareOrRefreshGolden(GEOMETRY_EXPECTED, renderGeometry(light, dark), MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('commits exactly the fixtures it reads', async () => {
    // The scenario borrows seeded-history's session.v3.jsonl rather than committing a
    // second copy, so this directory holds the golden alone.
    await assertFixtureInventory(SNAPSHOT_DIR, ['geometry.expected.md'])
  })

  it.skipIf(MODE === 'record')('issued zero model calls and stayed clean', () => {
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  })
})
