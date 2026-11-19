/**
 * Reject compiled TypeScript output left inside a source tree.
 *
 * Builds emit under each package's `lib/`, never beside the sources. A file in
 * `src/` that carries a sibling `.ts`/`.tsx` of the same base is emitted output:
 * it shadows the source for a same-directory import, and the package `files`
 * list publishes it. Hand-written shims without a source counterpart, such as
 * `css-modules.d.ts`, stay legal, and so does a hand-written `.js` beside no
 * TypeScript source; neither can come from `tsc`.
 *
 * An ad-hoc `tsc <file>` invocation ignores `tsconfig` and emits next to its
 * input, which is how such files appear. A scan that finds no source directory
 * fails instead of passing, so a narrowed walk cannot hide the violation.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/** Directories inside a source tree that hold build output or dependencies. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'lib', 'dist', 'coverage'])

/** Emitted names that can shadow a sibling TypeScript source. */
const EMITTED_NAME = /\.(?:js|js\.map|d\.ts|d\.ts\.map)$/u

/** One source-tree scan. */
export interface SourceArtifactScan {
  /** Repository-relative artifact paths with forward slashes, sorted. */
  artifacts: string[]
  /** Source directories walked, so an empty walk cannot pass silently. */
  sourceDirectories: number
}

/**
 * Whether a path names an existing directory.
 * @param path - absolute path to inspect.
 * @returns true when the path exists and is a directory.
 */
function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory()
}

/**
 * Names of the directories directly under a path, in filesystem order.
 * @param path - absolute directory path.
 * @returns the direct child directory names.
 */
function childDirectories(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch (error) {
    // A repository root without this tree has no source directories there.
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

/**
 * Strip `.map` and the emitted extension, leaving the source base name.
 * @param name - file name inside a source directory.
 * @returns the base name shared with its `.ts`/`.tsx` source, or undefined for a non-emitted name.
 */
function sourceBase(name: string): string | undefined {
  if (!EMITTED_NAME.test(name)) return undefined
  const emitted = name.endsWith('.map') ? name.slice(0, -'.map'.length) : name
  if (emitted.endsWith('.d.ts')) return emitted.slice(0, -'.d.ts'.length)
  if (emitted.endsWith('.js')) return emitted.slice(0, -'.js'.length)
  return undefined
}

/**
 * Whether an emitted file duplicates a source in the same directory.
 * @param directory - absolute directory holding the file.
 * @param name - file name to judge.
 * @returns true when a `.ts`/`.tsx` source of the same base exists, or a declaration map sits beside its `.d.ts`.
 */
function duplicatesSource(directory: string, name: string): boolean {
  const base = sourceBase(name)
  if (base === undefined) return false
  if (existsSync(join(directory, `${base}.ts`)) || existsSync(join(directory, `${base}.tsx`))) return true
  return name.endsWith('.d.ts.map') && existsSync(join(directory, `${base}.d.ts`))
}

/**
 * Collect emitted artifacts below one directory.
 * @param directory - absolute directory to walk.
 * @param repoRoot - repository root the reported paths are relative to.
 * @param artifacts - accumulator receiving repository-relative paths.
 */
function walk(directory: string, repoRoot: string, artifacts: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(join(directory, entry.name), repoRoot, artifacts)
      continue
    }
    if (!entry.isFile()) continue
    if (!duplicatesSource(directory, entry.name)) continue
    artifacts.push(relative(repoRoot, join(directory, entry.name)).split('\\').join('/'))
  }
}

/**
 * Every `src/` directory of a package or application.
 * @param repoRoot - repository root to inspect.
 * @returns absolute source directory paths.
 */
export function listSourceDirectories(repoRoot: string): string[] {
  const directories: string[] = []
  const packages = join(repoRoot, 'packages')
  for (const group of childDirectories(packages)) {
    for (const name of childDirectories(join(packages, group))) {
      const source = join(packages, group, name, 'src')
      if (isDirectory(source)) directories.push(source)
    }
  }
  for (const name of childDirectories(join(repoRoot, 'apps'))) {
    const source = join(repoRoot, 'apps', name, 'src')
    if (isDirectory(source)) directories.push(source)
  }
  return directories
}

/**
 * Find emitted TypeScript output inside package and application source trees.
 * @param repoRoot - repository root to scan.
 * @returns sorted repository-relative artifacts and the number of source directories walked.
 * @throws when no source directory exists, so a narrowed walk cannot report success.
 */
export function scanSourceArtifacts(repoRoot: string): SourceArtifactScan {
  const directories = listSourceDirectories(repoRoot)
  if (directories.length === 0) {
    throw new Error('verify-src-artifacts: source discovery found no src directory')
  }
  const artifacts: string[] = []
  for (const directory of directories) walk(directory, repoRoot, artifacts)
  return { artifacts: artifacts.sort(), sourceDirectories: directories.length }
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  const { artifacts, sourceDirectories } = scanSourceArtifacts(root)
  if (artifacts.length > 0) {
    const noun = artifacts.length === 1 ? 'file' : 'files'
    console.error(`verify-src-artifacts: ${String(artifacts.length)} emitted ${noun} found inside source trees:\n`
      + artifacts.map(file => `  ${file}`).join('\n')
      + '\nBuild output belongs under lib/. Delete these and rebuild with `pnpm run build`;'
      + ' an ad-hoc `tsc <file>` run emits next to its input instead.')
    process.exit(1)
  }
  console.log(`verify-src-artifacts: ${String(sourceDirectories)} source directories hold no emitted output.`)
}
