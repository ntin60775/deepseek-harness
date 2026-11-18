/**
 * The GUI changed-test selector reads a real git working tree: every case builds a fixture
 * repository, commits a baseline, and mutates it the way an editor would. Selection cases assert
 * `collectGuiChanges` directly; the three end-to-end cases spawn the command with the repository's
 * tsx hook and Vitest, because the empty-selection, blind-spot, and deletion-scope messages are the
 * command's contract with the operator.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { collectGuiChanges } from './run-gui-changed.ts'

const repoRoot = resolve(import.meta.dirname, '..')
const wrapper = join(repoRoot, 'scripts/run-gui-changed.ts')
const tsxEsm = createRequire(import.meta.url).resolve('tsx/esm')

let fixture: string | undefined

function git(args: string[]): void {
  const result = spawnSync('git', args, { cwd: fixture, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`fixture git ${args.join(' ')} failed: ${result.stderr ?? ''}`)
}

function write(path: string, content: string): void {
  const full = join(fixture!, path)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf8')
}

function commitBaseline(): void {
  write('packages/client/demo/src/a.ts', 'export const answer = 42\n')
  write('packages/client/demo/tests/a.spec.ts', "import { expect, it } from 'vitest'\nimport { answer } from '../src/a.ts'\nit('answer', () => { expect(answer).toBe(42) })\n")
  git(['add', '-A'])
  git(['-c', 'user.email=fixture@test', '-c', 'user.name=fixture', 'commit', '-qm', 'baseline'])
}

function runCommand(): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, ['--import', tsxEsm, wrapper], { cwd: fixture, encoding: 'utf8', timeout: 60_000 })
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

afterEach(() => {
  if (fixture !== undefined) rmSync(fixture, { recursive: true, force: true })
  fixture = undefined
})

function freshFixture(): void {
  fixture = mkdtempSync(join(tmpdir(), 'dsh-gui-changed-'))
  git(['init', '-q', '.'])
  commitBaseline()
}

describe('collectGuiChanges selection', () => {
  it('selects a tracked source edit', () => {
    freshFixture()
    write('packages/client/demo/src/a.ts', 'export const answer = 43\n')
    const selection = collectGuiChanges(fixture!)
    expect(selection.relatedFiles).toEqual(['packages/client/demo/src/a.ts'])
    expect(selection.deletionPackages).toEqual([])
    expect(selection.changedInScope).toBe(1)
  })

  it('selects an untracked source file and an untracked spec', () => {
    freshFixture()
    write('packages/client/demo/src/new.ts', 'export const extra = 1\n')
    write('packages/client/demo/tests/new.spec.ts', "import { expect, it } from 'vitest'\nit('extra', () => { expect(1).toBe(1) })\n")
    const selection = collectGuiChanges(fixture!)
    expect(selection.relatedFiles).toEqual([
      'packages/client/demo/src/new.ts',
      'packages/client/demo/tests/new.spec.ts',
    ])
  })

  it('excludes untracked declaration files inside src', () => {
    freshFixture()
    write('packages/client/demo/src/a.d.ts', 'export declare const answer: number\n')
    const selection = collectGuiChanges(fixture!)
    expect(selection.relatedFiles).toEqual([])
    expect(selection.changedInScope).toBe(0)
  })

  it('reports an empty working tree as an empty selection', () => {
    freshFixture()
    const selection = collectGuiChanges(fixture!)
    expect(selection).toEqual({ relatedFiles: [], deletionPackages: [], changedInScope: 0, outOfScope: 0 })
  })

  it('counts changes outside the GUI scope without selecting them', () => {
    freshFixture()
    write('packages/core/agent-loop/src/x.ts', 'export const x = 1\n')
    const selection = collectGuiChanges(fixture!)
    expect(selection.relatedFiles).toEqual([])
    expect(selection.outOfScope).toBe(1)
  })

  it('routes a deleted source file to its package scope', () => {
    freshFixture()
    git(['rm', '-q', 'packages/client/demo/src/a.ts'])
    const selection = collectGuiChanges(fixture!)
    expect(selection.deletionPackages).toEqual(['packages/client/demo'])
    expect(selection.relatedFiles).toEqual([])
    expect(selection.changedInScope).toBe(1)
  })

  it('treats a staged rename as a deletion of the old path plus a change of the new one', () => {
    freshFixture()
    git(['mv', 'packages/client/demo/src/a.ts', 'packages/client/demo/src/renamed.ts'])
    const selection = collectGuiChanges(fixture!)
    expect(selection.deletionPackages).toEqual(['packages/client/demo'])
    expect(selection.relatedFiles).toEqual([])
  })

  it('selects a staged-only edit against HEAD', () => {
    freshFixture()
    write('packages/client/demo/src/a.ts', 'export const answer = 44\n')
    git(['add', 'packages/client/demo/src/a.ts'])
    const selection = collectGuiChanges(fixture!)
    expect(selection.relatedFiles).toEqual(['packages/client/demo/src/a.ts'])
  })
})

describe('command end-to-end', () => {
  it('prints 0 tests selected and exits 0 on an empty working tree', { timeout: 90_000 }, () => {
    freshFixture()
    const { status, output } = runCommand()
    expect(output).toContain('0 tests selected')
    expect(status).toBe(0)
  })

  it('warns about the blind spots when changed files have no related tests', { timeout: 90_000 }, () => {
    freshFixture()
    write('packages/client/demo/src/orphan.ts', 'export const orphan = 1\n')
    git(['add', '-A'])
    git(['-c', 'user.email=fixture@test', '-c', 'user.name=fixture', 'commit', '-qm', 'orphan'])
    write('packages/client/demo/src/orphan.ts', 'export const orphan = 2\n')
    const { status, output } = runCommand()
    expect(output).toContain('no related tests')
    expect(output).toContain('select the owning tests manually')
    expect(status).toBe(0)
  })

  it('runs the whole package scope when a file was deleted', { timeout: 90_000 }, () => {
    freshFixture()
    write('packages/client/demo/src/unused.ts', 'export const unused = 1\n')
    write('packages/client/demo/tests/b.spec.ts', "import { expect, it } from 'vitest'\nit('independent', () => { expect(2).toBe(2) })\n")
    git(['add', '-A'])
    git(['-c', 'user.email=fixture@test', '-c', 'user.name=fixture', 'commit', '-qm', 'more'])
    git(['rm', '-q', 'packages/client/demo/src/unused.ts'])
    const { status, output } = runCommand()
    expect(output).toContain('deletion package scope: packages/client/demo')
    expect(output).toContain('a.spec.ts')
    expect(output).toContain('b.spec.ts')
    expect(status).toBe(0)
  })
})
