/**
 * Enforce `wc -w`-style ceilings from `scripts/doc-budgets.manifest.json`.
 * Missing files and invalid ceilings fail; `--list` reports current usage.
 * Only listed standing docs are budgeted. A `<path>#<token>` key budgets the
 * region between the file's `<!-- BEGIN <token> -->` and `<!-- END <token> -->`
 * marker lines, markers counted, and the same region is carved out of the
 * `<path>` entry so an overlay keeps its own ceiling without moving the base
 * one. Ceilings ratchet down with at least 5% headroom; raising one requires
 * the justification defined in `docs/AGENTS.md`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

const MANIFEST_PATH = resolve(root, 'scripts/doc-budgets.manifest.json')

/** `wc -w` equivalent: count whitespace-delimited tokens. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/** A manifest key split into its file path and optional region token. */
interface BudgetTarget {
  /** Repository-relative file the key budgets. */
  path: string
  /** Region token for a `<path>#<token>` key; `undefined` budgets the whole file minus its regions. */
  region?: string
}

/** Rows and failures from one budget audit, so `--list` and the check share the walk. */
export interface DocBudgetAudit {
  /** One aligned usage row per manifest key, in manifest order. */
  rows: string[]
  /** Diagnostics prefixed by the manifest key. */
  failures: string[]
}

const KEY_PATTERN = /^(?<path>[^#]+)(?:#(?<token>[\w-]+))?$/

/**
 * Split one manifest key into its file path and region token.
 * @param key - A `scripts/doc-budgets.manifest.json` entry name.
 * @returns the target, or `undefined` when the key names neither a file nor a `<path>#<token>` region.
 */
function parseKey(key: string): BudgetTarget | undefined {
  const match = KEY_PATTERN.exec(key)
  const path = match?.groups?.['path']
  if (path === undefined || path.length === 0) return undefined
  const token = match?.groups?.['token']
  return token === undefined ? { path } : { path, region: token }
}

/**
 * Extract one marker-delimited region, inclusive of both marker lines.
 * @param source - Markdown text of the budgeted file.
 * @param token - Region token naming the `<!-- BEGIN <token> -->` and `<!-- END <token> -->` pair.
 * @returns the region text, or `undefined` when either marker is missing or they are reversed.
 */
export function findRegion(source: string, token: string): string | undefined {
  const region = new RegExp(
    `^[ \\t]*<!-- BEGIN ${token} -->[\\s\\S]*?^[ \\t]*<!-- END ${token} -->[ \\t]*$`,
    'm',
  ).exec(source)
  return region?.[0]
}

/**
 * Audit every budgeted document against its ceiling.
 * @param root - Repository root holding the budgeted files.
 * @param manifest - Ceilings keyed by `scripts/doc-budgets.manifest.json` entry names.
 * @returns usage rows and the failures that make the gate exit 1. A region entry counts its own
 * text; the whole-file entry subtracts every region the manifest budgets for the same file.
 */
export function auditDocBudgets(root: string, manifest: Record<string, number>): DocBudgetAudit {
  const rows: string[] = []
  const failures: string[] = []
  const sources = new Map<string, string | undefined>()
  const sourceOf = (path: string): string | undefined => {
    if (!sources.has(path)) sources.set(path, existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : undefined)
    return sources.get(path)
  }

  const regionsOf = (path: string): string[] =>
    Object.entries(manifest)
      .map(([key]) => parseKey(key))
      .filter((target): target is BudgetTarget & { region: string } => target?.path === path && target.region !== undefined)
      .map(target => target.region)

  for (const [key, ceiling] of Object.entries(manifest)) {
    if (!Number.isInteger(ceiling) || ceiling <= 0) {
      rows.push(`BAD   ${'—'.padStart(6)} / ${String(ceiling).padEnd(6)} ${key}`)
      failures.push(`${key}: ceiling must be a positive integer, got ${ceiling}`)
      continue
    }
    const target = parseKey(key)
    if (target === undefined) {
      rows.push(`BAD   ${'—'.padStart(6)} / ${String(ceiling).padEnd(6)} ${key}`)
      failures.push(`${key}: expected a file path or a "<path>#<region-token>" key`)
      continue
    }
    const source = sourceOf(target.path)
    if (source === undefined) {
      rows.push(`MISS  ${'—'.padStart(6)} / ${String(ceiling).padEnd(6)} ${key}`)
      failures.push(`${key}: budgeted file does not exist (renamed or deleted? update scripts/doc-budgets.manifest.json in the same change)`)
      continue
    }
    let words: number
    if (target.region === undefined) {
      // The whole-file entry budgets everything outside the regions this manifest names.
      let counted = source
      for (const token of regionsOf(target.path)) {
        const region = findRegion(source, token)
        if (region !== undefined) counted = counted.replace(region, '')
      }
      words = countWords(counted)
    } else {
      const region = findRegion(source, target.region)
      if (region === undefined) {
        rows.push(`MISS  ${'—'.padStart(6)} / ${String(ceiling).padEnd(6)} ${key}`)
        failures.push(`${key}: no \`<!-- BEGIN ${target.region} -->\`…\`<!-- END ${target.region} -->\` region in ${target.path} — restore the markers or drop the key from scripts/doc-budgets.manifest.json`)
        continue
      }
      words = countWords(region)
    }
    rows.push(`${words <= ceiling ? 'ok  ' : 'OVER'}  ${String(words).padStart(6)} / ${String(ceiling).padEnd(6)} ${key}`)
    if (words > ceiling) {
      failures.push(`${key}: ${words} words exceeds the ${ceiling}-word ceiling — relocate or condense per docs/AGENTS.md (raising the ceiling requires justification in the PR)`)
    }
  }
  return { rows, failures }
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, number>

const listOnly = process.argv.includes('--list')
const { rows, failures } = auditDocBudgets(root, manifest)

if (listOnly) {
  console.log(rows.join('\n'))
  process.exit(0)
}

if (failures.length > 0) {
  console.error('verify-doc-budgets failed:\n')
  for (const failure of failures) console.error(`  ${failure}`)
  console.error('\nSee docs/AGENTS.md for the documentation standard and the relocation-first rule.')
  process.exit(1)
}

console.log(`verify-doc-budgets: ${Object.keys(manifest).length} budgeted docs within ceiling.`)
