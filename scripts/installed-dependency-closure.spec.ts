import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { installedDependencyRoots, packageRootOfResolved } from './installed-dependency-closure.ts'

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** One fixture package directory with a manifest and a resolvable main entry. */
function fixturePackage(root: string, name: string, deps: Record<string, string> = {}, extra: Record<string, unknown> = {}): string {
  const dir = join(root, name.replaceAll('/', '+'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', dependencies: deps, ...extra }))
  writeFileSync(join(dir, 'index.js'), '')
  return dir
}

/** Link one fixture package into another's node_modules farm under its manifest name. */
function link(from: string, to: string): void {
  const name = (JSON.parse(readFileSync(join(to, 'package.json'), 'utf8')) as { name: string }).name
  const target = join(from, 'node_modules', name)
  mkdirSync(dirname(target), { recursive: true })
  symlinkSync(to, target, 'dir')
}

describe('packageRootOfResolved', () => {
  it('reads the last node_modules segment, scoped and plain', () => {
    expect(packageRootOfResolved('/repo/node_modules/.pnpm/a@1/node_modules/@scope/pkg/dist/index.js'))
      .toBe('/repo/node_modules/.pnpm/a@1/node_modules/@scope/pkg')
    expect(packageRootOfResolved('/repo/node_modules/plain/lib/main.js')).toBe('/repo/node_modules/plain')
  })
  it('rejects a path without a node_modules segment', () => {
    expect(() => packageRootOfResolved('/repo/src/index.ts')).toThrow('cannot locate package root')
  })
})

describe('installedDependencyRoots', () => {
  it('walks dependencies transitively and returns real roots sorted by name', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-closure-')); temps.push(root)
    const entry = fixturePackage(root, 'entry', { mid: '1.0.0' })
    const mid = fixturePackage(root, 'mid', { leaf: '1.0.0' })
    const leaf = fixturePackage(root, 'leaf')
    link(entry, mid); link(mid, leaf)
    expect(installedDependencyRoots(entry)).toEqual([entry, leaf, mid].sort((a, b) => a.localeCompare(b)))
  })
  it('skips type-only packages and uninstalled optional dependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-closure-')); temps.push(root)
    const entry = fixturePackage(root, 'entry', { '@types/node': '22.0.0' }, { optionalDependencies: { absent: '1.0.0' } })
    expect(installedDependencyRoots(entry)).toEqual([entry])
  })
  it('reads the sibling farm when a dependency exports block require.resolve', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-closure-')); temps.push(root)
    // pnpm layout: both packages sit side by side in one node_modules farm.
    const farm = join(root, 'node_modules')
    mkdirSync(farm, { recursive: true })
    const entry = fixturePackage(farm, 'entry', { blocked: '1.0.0' })
    const blocked = fixturePackage(farm, 'blocked', {}, { exports: { './dist/*': './dist/*' } })
    expect(installedDependencyRoots(entry)).toEqual([blocked, entry].sort((a, b) => a.localeCompare(b)))
  })
  it('deduplicates a diamond and follows installed optional dependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-closure-')); temps.push(root)
    const entry = fixturePackage(root, 'entry', { left: '1.0.0' }, { optionalDependencies: { right: '1.0.0' } })
    const left = fixturePackage(root, 'left', { shared: '1.0.0' })
    const right = fixturePackage(root, 'right', { shared: '1.0.0' })
    const shared = fixturePackage(root, 'shared')
    link(entry, left); link(entry, right); link(left, shared); link(right, shared)
    expect(installedDependencyRoots(entry)).toEqual([entry, left, right, shared].sort((a, b) => a.localeCompare(b)))
  })
})
