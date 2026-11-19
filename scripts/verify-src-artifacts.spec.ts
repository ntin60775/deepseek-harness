import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listSourceDirectories, scanSourceArtifacts } from './verify-src-artifacts.ts'

const fixtures: string[] = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(async directory => rm(directory, { recursive: true, force: true })))
})

/**
 * Create a temporary repository root with the given repository-relative files.
 * @param files - file paths mapped to their contents.
 * @returns the absolute fixture root.
 */
async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-src-artifacts-'))
  fixtures.push(root)
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path)
    await mkdir(join(absolute, '..'), { recursive: true })
    await writeFile(absolute, content)
  }
  return root
}

describe('emitted artifacts inside source trees', () => {
  it.each([
    ['a sibling script', 'index.js'],
    ['a script map', 'index.js.map'],
    ['a declaration', 'index.d.ts'],
    ['a declaration map', 'index.d.ts.map'],
  ])('rejects %s next to its source', async (_label, name) => {
    const root = await fixture({
      'packages/group/pkg/package.json': '{}\n',
      'packages/group/pkg/src/index.ts': 'export {}\n',
      [`packages/group/pkg/src/${name}`]: '',
    })

    expect(scanSourceArtifacts(root)).toEqual({
      artifacts: [`packages/group/pkg/src/${name}`],
      sourceDirectories: 1,
    })
  })

  it('accepts a hand-written declaration shim without a source counterpart', async () => {
    const root = await fixture({
      'packages/group/pkg/src/index.ts': 'export {}\n',
      'packages/group/pkg/src/css-modules.d.ts': "declare module '*.module.css' {}\n",
    })

    expect(scanSourceArtifacts(root).artifacts).toEqual([])
  })

  it('accepts a hand-written script with no TypeScript source of its name', async () => {
    const root = await fixture({
      'packages/group/pkg/src/tool.js': 'export {}\n',
      'packages/group/pkg/src/index.ts': 'export {}\n',
    })

    expect(scanSourceArtifacts(root).artifacts).toEqual([])
  })

  it('rejects an emitted script under an application source tree', async () => {
    const root = await fixture({
      'apps/web/src/main.ts': 'export {}\n',
      'apps/web/src/main.js': '',
    })

    expect(scanSourceArtifacts(root).artifacts).toEqual(['apps/web/src/main.js'])
  })

  it('skips dependency and build-output directories inside a source tree', async () => {
    const root = await fixture({
      'packages/group/pkg/src/index.ts': 'export {}\n',
      'packages/group/pkg/src/node_modules/dep/index.js': '',
      'packages/group/pkg/src/lib/types/index.js': '',
      'packages/group/pkg/src/dist/main.js': '',
    })

    expect(scanSourceArtifacts(root).artifacts).toEqual([])
  })

  it('fails when source discovery finds no directory', async () => {
    const root = await fixture({ 'packages/group/pkg/package.json': '{}\n' })

    expect(() => scanSourceArtifacts(root)).toThrow(/found no src directory/u)
  })

  it('lists each package source directory once', async () => {
    const root = await fixture({
      'packages/group/one/src/index.ts': 'export {}\n',
      'packages/group/two/src/index.ts': 'export {}\n',
      'apps/web/src/index.ts': 'export {}\n',
    })

    expect(listSourceDirectories(root)).toHaveLength(3)
  })
})
