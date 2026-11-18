/**
 * Run the GUI tests affected by working-tree changes in `packages/client` and `packages/host`
 * (the same scope as the `test:gui` script in package.json).
 *
 * The repository root resolves through `git rev-parse --show-toplevel`, so the command selects the
 * same changes from any subdirectory. Selection: tracked changes against HEAD (staged and
 * unstaged; renames and copies count as a deletion of the old path plus a change of the new one)
 * and untracked `src` TypeScript sources or `tests` spec files; `.d.ts` files never select. A
 * package that lost a file runs its whole spec scope with `--passWithNoTests`, because `vitest
 * related` cannot trace dependents of a deleted module and a package without specs has nothing to
 * run; the remaining existing changed files go to `vitest related`. An empty selection prints
 * `run-gui-changed: 0 tests selected`; a nonempty selection that Vitest answers with no test files
 * prints the selector's blind spots. Both outcomes exit 0 and are dev-loop signals, not push
 * evidence. A failed Vitest run propagates its exit code.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package groups whose specs the command selects; mirrors the `test:gui` script arguments. */
const GUI_SCOPE = ['packages/client', 'packages/host']

/** Git and Vitest output ceilings; the repository default of 1 MiB truncates dirty-tree listings. */
const MAX_OUTPUT = 16 * 1024 * 1024

/** Working-tree changes classified for the GUI test run. */
export interface GuiChangeSelection {
  /** Existing changed files to pass to `vitest related`, outside deletion packages. */
  relatedFiles: string[]
  /** Package roots that lost a file and run their whole spec scope. */
  deletionPackages: string[]
  /** Changed paths inside the GUI scope, deletions and filtered untracked files included. */
  changedInScope: number
  /** Changed paths outside the GUI scope. */
  outOfScope: number
}

function git(repoRoot: string, args: string[]): string {
  const result = spawnSync('git', ['-C', repoRoot, '-c', 'core.fsmonitor=false', ...args], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LANG: 'C', LC_ALL: 'C' },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT,
  })
  if (result.error !== undefined) throw new Error(`run-gui-changed: git ${args.join(' ')} failed: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(`run-gui-changed: git ${args.join(' ')} failed: ${result.stderr.trim() || `exit ${String(result.status)}`}`)
  }
  return result.stdout
}

function inScope(path: string): boolean {
  return GUI_SCOPE.some(prefix => path.startsWith(`${prefix}/`))
}

/** Package root of a scoped path: `packages/<group>/<package>`. */
function packageRoot(path: string): string {
  const segments = path.split('/')
  if (segments.length < 4) throw new Error(`run-gui-changed: scoped path outside a package: ${path}`)
  return segments.slice(0, 3).join('/')
}

function isDeclaration(path: string): boolean {
  return path.endsWith('.d.ts')
}

function untrackedSelected(path: string): boolean {
  const rest = path.split('/').slice(3).join('/')
  if (rest.startsWith('src/')) {
    return (rest.endsWith('.ts') || rest.endsWith('.tsx')) && !isDeclaration(rest)
  }
  return rest.startsWith('tests/') && /\.(spec|test)\.tsx?$/.test(rest)
}

function nextToken(tokens: string[], context: string): string {
  const token = tokens.shift()
  if (token === undefined) throw new Error(`run-gui-changed: malformed git ${context} output`)
  return token
}

/**
 * Classify working-tree changes for the GUI test run.
 * @param repoRoot - Repository root whose HEAD and index define the tracked change set.
 * @returns The related-file list, deletion packages, and in/out-of-scope change counts.
 */
export function collectGuiChanges(repoRoot: string): GuiChangeSelection {
  const deleted: string[] = []
  const changed: string[] = []
  const tokens = git(repoRoot, ['diff', 'HEAD', '--name-status', '-z']).split('\0').filter(entry => entry !== '')
  while (tokens.length > 0) {
    const code = nextToken(tokens, 'name-status')
    const path = nextToken(tokens, 'name-status')
    if (code.startsWith('R') || code.startsWith('C')) {
      deleted.push(path)
      changed.push(nextToken(tokens, 'name-status'))
    } else if (code.startsWith('D')) {
      deleted.push(path)
    } else {
      changed.push(path)
    }
  }
  const untracked = git(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(entry => entry !== '')
  const untrackedInScope = untracked.filter(inScope)
  for (const path of untrackedInScope) {
    if (untrackedSelected(path)) changed.push(path)
  }

  const scopedDeleted = deleted.filter(inScope)
  const deletionPackages = [...new Set(scopedDeleted.map(packageRoot))].sort()
  const deletionSet = new Set(deletionPackages)
  const relatedFiles = changed
    .filter(path => inScope(path) && !isDeclaration(path) && existsSync(join(repoRoot, path)) && !deletionSet.has(packageRoot(path)))
    .sort()
  const outOfScope = [...deleted, ...changed].filter(path => !inScope(path)).length
    + untracked.filter(path => !inScope(path)).length
  const filteredUntracked = untrackedInScope.filter(path => !untrackedSelected(path)).length
  return {
    relatedFiles,
    deletionPackages,
    changedInScope: scopedDeleted.length + changed.filter(inScope).length + filteredUntracked,
    outOfScope,
  }
}

const vitestCli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))

function runVitest(repoRoot: string, args: string[]): { status: number; output: string } {
  const result = spawnSync(process.execPath, [vitestCli, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT,
  })
  if (result.error !== undefined) throw new Error(`run-gui-changed: vitest ${args.join(' ')} failed: ${result.error.message}`)
  const output = `${result.stdout}${result.stderr}`
  process.stdout.write(output)
  return { status: result.status ?? 1, output }
}

/**
 * Command entry: select the affected GUI tests in the current working tree and run them.
 * @returns Process exit code: a failed Vitest run propagates, an empty or blind selection exits 0.
 */
export function main(): number {
  const repoRoot = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim()
  const selection = collectGuiChanges(repoRoot)
  process.stdout.write(`run-gui-changed: ${String(selection.changedInScope)} changed in scope, ${String(selection.outOfScope)} out of scope, ${String(selection.deletionPackages.length)} deletion package(s)\n`)
  let failed = 0
  if (selection.deletionPackages.length > 0) {
    process.stdout.write(`run-gui-changed: deletion package scope: ${selection.deletionPackages.join(', ')}\n`)
    const run = runVitest(repoRoot, ['run', '--passWithNoTests', ...selection.deletionPackages])
    failed = Math.max(failed, run.status)
  }
  if (selection.relatedFiles.length > 0) {
    const run = runVitest(repoRoot, ['related', ...selection.relatedFiles, '--run'])
    failed = Math.max(failed, run.status)
    if (/No (?:test|related) files found/.test(run.output)) {
      process.stdout.write('run-gui-changed: changed files have no related tests; vitest related cannot see config, dynamic loading, subprocesses, or built artifacts — select the owning tests manually\n')
    }
  }
  if (selection.deletionPackages.length === 0 && selection.relatedFiles.length === 0) {
    process.stdout.write('run-gui-changed: 0 tests selected\n')
  }
  return failed
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
