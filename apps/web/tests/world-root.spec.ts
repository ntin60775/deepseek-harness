/** Where browser scenarios may place their worlds: outside the checkout and outside the sandbox-masked /tmp. */
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { REPO_ROOT, webWorldRoot } from './support.ts'

const savedTemp = process.env.TMPDIR

afterEach(() => {
  if (savedTemp === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = savedTemp
})

it('keeps worlds out of the checkout so no ancestor AGENTS.md reaches a scenario', async () => {
  const inside = await mkdtemp(join(REPO_ROOT, '.artifacts', 'world-root-'))
  try {
    process.env.TMPDIR = inside
    const root = webWorldRoot()
    expect(root.startsWith(realpathSync(REPO_ROOT).replace(/[/\\]+$/u, ''))).toBe(false)
    expect(root).not.toBe(realpathSync(inside))
  } finally {
    await rm(inside, { recursive: true, force: true })
  }
})

it.skipIf(process.platform !== 'linux')('keeps worlds out of the /tmp the sandbox empties', async () => {
  process.env.TMPDIR = '/tmp'
  const root = webWorldRoot()
  expect(root.startsWith('/tmp/')).toBe(false)
  expect(root).toBe(join('/var/tmp', `dsh-web-worlds-${String(process.getuid?.() ?? 0)}`))
  await mkdir(root, { recursive: true })
  expect(realpathSync(tmpdir())).toBe('/tmp')
})
