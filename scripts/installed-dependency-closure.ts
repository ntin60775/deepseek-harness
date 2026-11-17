/** Installed dependency closure of a package root, shared by license disclosure surfaces. */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** Manifest fields the closure walk reads. */
interface ClosureManifest {
  name?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

/**
 * Package root of a resolved dependency entry: the last `node_modules/<name>`
 * segment of its physical path. Packages without a `./package.json` export
 * resolve through their main entry instead.
 * @param resolved - absolute module path a require resolution returned.
 * @returns the owning package root directory.
 */
export function packageRootOfResolved(resolved: string): string {
  const matches = [...resolved.matchAll(/node_modules\/(@[^/]+\/[^/]+|[^/]+)\//gu)]
  const last = matches.at(-1)
  if (last === undefined) throw new Error(`cannot locate package root in ${resolved}`)
  return resolved.slice(0, last.index + last[0].length - 1)
}

/**
 * Every installed package directory reachable from one package root through
 * its dependencies and installed optional dependencies. Type-only `@types/*`
 * packages are erased at compile time and never distributed, so the walk skips
 * them. When a dependency's exports block `require.resolve`, the walk reads the
 * sibling link farm: pnpm places every declared dependency next to the package
 * inside the same `node_modules` directory.
 * @param entryRoot - absolute package root directory containing package.json.
 * @returns unique real package root directories, sorted by package name.
 */
export function installedDependencyRoots(entryRoot: string): string[] {
  const roots = new Map<string, string>()
  const visited = new Set<string>()
  const queue = [entryRoot]
  while (queue.length > 0) {
    const dir = queue.pop()
    if (dir === undefined) break
    const real = realpathSync(dir)
    if (visited.has(real)) continue
    visited.add(real)
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as ClosureManifest
    if (manifest.name !== undefined && !manifest.name.startsWith('@types/')) roots.set(real, manifest.name)
    const requireFn = createRequire(join(dir, 'package.json'))
    const declared = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {})]
    for (const dep of declared) {
      if (dep.startsWith('@types/')) continue
      let root: string
      try {
        root = packageRootOfResolved(requireFn.resolve(dep))
      } catch {
        // Exports-blocked or main-less packages still occupy the sibling farm.
        const linked = join(dirname(real), dep)
        if (!existsSync(join(linked, 'package.json'))) continue
        root = linked
      }
      queue.push(root)
    }
  }
  return [...roots.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dir]) => dir)
}
