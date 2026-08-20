/**
 * oh-my-pi-compatible `.omp` rule discovery with bounded, abort-aware reads.
 *
 * Discovery mirrors the omp native provider exactly: project rules come only
 * from the session cwd's `.omp/rules/`, user rules from the omp user agent
 * directory's `rules/`, and sticky `RULES.md` files from the user agent
 * directory plus the nearest non-empty `.omp/` directory walking from the cwd
 * toward the project root. Merge order is project rules, user rules, sticky
 * user, sticky project; deduplication is name-based and first-wins, so a
 * project rule shadows a user rule of the same name.
 *
 * @module @deepseek-ai/dsh-agent-rules/discovery
 */

import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import { parseRuleDocument, type Rule, type RuleLevel } from './rule.ts'
import { resolveConfig, type ResolvedConfig } from './config.ts'

/** Discovery inputs; `maxSourceBytes` bounds each rule file read. */
export interface DiscoverRulesOptions {
  cwd: string
  ompAgentDir?: string
  projectRootMarkers?: string[]
  maxSourceBytes?: number
  projectRoot?: string
  signal?: AbortSignal
}

/** The deduplicated rule set plus every non-fatal discovery problem. */
export interface DiscoveredRuleSet {
  /** Rules in merge order with name duplicates dropped (first occurrence wins). */
  readonly rules: Rule[]
  /** Parse and compatibility warnings collected while loading. */
  readonly warnings: string[]
}

/** Name of the sticky always-apply rule synthesized from the user `RULES.md`. */
export const STICKY_USER_RULE_NAME = 'RULES'
/** Name of the sticky always-apply rule synthesized from the nearest project `RULES.md`. */
export const STICKY_PROJECT_RULE_NAME = 'RULES@project'

const RULE_FILE_EXTENSION = /\.(md|mdc)$/
const RULES_DIRECTORY = 'rules'
const STICKY_FILE = 'RULES.md'
const OMP_DIRECTORY = '.omp'

interface ListedEntry {
  name: string
  isFile: boolean
}

async function nodeListDir(dir: string, signal?: AbortSignal): Promise<ListedEntry[] | undefined> {
  try {
    signal?.throwIfAborted()
    const entries = await readdir(dir, { withFileTypes: true })
    signal?.throwIfAborted()
    return entries.map(entry => ({ name: entry.name, isFile: entry.isFile() || entry.isSymbolicLink() }))
  } catch {
    signal?.throwIfAborted()
    // A missing or unreadable directory lists as nothing.
    return undefined
  }
}

async function providerListDir(
  dir: string,
  fileSystem: FileSystem,
  signal?: AbortSignal,
): Promise<ListedEntry[] | undefined> {
  try {
    const target = await fileSystem.resolve(dir, signal === undefined ? undefined : { signal })
    signal?.throwIfAborted()
    const info = await fileSystem.stat(target, signal)
    signal?.throwIfAborted()
    if (info?.type !== 'directory') return undefined
    const entries = await fileSystem.listDir(target, signal)
    signal?.throwIfAborted()
    return entries.map(entry => ({ name: entry.name, isFile: entry.type === 'file' }))
  } catch {
    signal?.throwIfAborted()
    return undefined
  }
}

async function listDir(dir: string, fileSystem?: FileSystem, signal?: AbortSignal): Promise<ListedEntry[] | undefined> {
  return fileSystem === undefined ? nodeListDir(dir, signal) : providerListDir(dir, fileSystem, signal)
}

async function* nodeTextChunks(path: string, signal?: AbortSignal): AsyncIterable<string> {
  const stream = createReadStream(path, { encoding: 'utf8', signal })
  for await (const chunk of stream) yield String(chunk)
}

async function readBounded(
  path: string,
  maxSourceBytes: number,
  fileSystem?: FileSystem,
  signal?: AbortSignal,
): Promise<string | undefined> {
  signal?.throwIfAborted()
  try {
    let chunks: AsyncIterable<string>
    if (fileSystem === undefined) {
      const info = await stat(path)
      signal?.throwIfAborted()
      if (!info.isFile() || info.size > maxSourceBytes) return undefined
      chunks = nodeTextChunks(path, signal)
    } else {
      const target: FsTarget = await fileSystem.resolve(path, signal === undefined ? undefined : { signal })
      signal?.throwIfAborted()
      const info = await fileSystem.stat(target, signal)
      signal?.throwIfAborted()
      if (info?.type !== 'file') return undefined
      if (info.size !== undefined && info.size > maxSourceBytes) return undefined
      chunks = await fileSystem.streamText(target, signal)
    }
    const parts: string[] = []
    let bytes = 0
    for await (const chunk of chunks) {
      signal?.throwIfAborted()
      bytes += Buffer.byteLength(chunk, 'utf8')
      if (bytes > maxSourceBytes) return undefined
      parts.push(chunk)
    }
    signal?.throwIfAborted()
    return parts.join('')
  } catch {
    signal?.throwIfAborted()
    // A file may disappear or become unreadable after its directory listing.
    return undefined
  }
}

async function existsAsMarker(path: string, fileSystem?: FileSystem, signal?: AbortSignal): Promise<boolean> {
  if (fileSystem !== undefined) {
    try {
      const target = await fileSystem.resolve(path, signal === undefined ? undefined : { signal })
      return await fileSystem.stat(target, signal) !== undefined
    } catch {
      signal?.throwIfAborted()
      return false
    }
  }
  try {
    signal?.throwIfAborted()
    await stat(path)
    signal?.throwIfAborted()
    return true
  } catch {
    signal?.throwIfAborted()
    return false
  }
}

/**
 * Walk upward to the first directory containing a configured root marker.
 * @param cwd - absolute session working directory where the walk begins.
 * @param markers - child names that identify a project root.
 * @param fileSystem - optional provider used instead of host filesystem probes.
 * @param signal - cancellation for provider and host probes.
 * @returns the discovered project root, or `cwd` when no marker exists.
 */
export async function findProjectRoot(
  cwd: string,
  markers: readonly string[],
  fileSystem?: FileSystem,
  signal?: AbortSignal,
): Promise<string> {
  let current = resolve(cwd)
  for (;;) {
    for (const marker of markers) {
      if (await existsAsMarker(join(current, marker), fileSystem, signal)) return current
    }
    const parent = dirname(current)
    if (parent === current) return resolve(cwd)
    current = parent
  }
}

/** Whether the directory exists and holds at least one entry of any kind. */
async function isNonEmptyDir(dir: string, fileSystem?: FileSystem, signal?: AbortSignal): Promise<boolean> {
  const entries = await listDir(dir, fileSystem, signal)
  return entries !== undefined && entries.length > 0
}

interface RuleFileInput {
  absolutePath: string
  displayPath: string
  name: string
  level: RuleLevel
  sticky: boolean
  forceAlwaysApply: boolean
}

async function loadRuleFile(
  input: RuleFileInput,
  maxSourceBytes: number,
  fileSystem?: FileSystem,
  signal?: AbortSignal,
): Promise<{ rule?: Rule; warning?: string }> {
  const raw = await readBounded(input.absolutePath, maxSourceBytes, fileSystem, signal)
  // Empty and unreadable files contribute nothing, matching omp discovery.
  if (raw === undefined || raw.trim().length === 0) return {}
  const parsed = parseRuleDocument(raw, input.displayPath)
  if (parsed.body.length === 0) {
    return parsed.warning === undefined ? {} : { warning: parsed.warning }
  }
  const warnings: string[] = parsed.warning === undefined ? [] : [parsed.warning]
  if (parsed.hasTtsrFields) {
    warnings.push(`rule "${input.name}" declares TTSR fields (condition/astCondition/scope/interruptMode); this harness parses but does not enforce them`)
  }
  return {
    rule: {
      name: input.name,
      absolutePath: input.absolutePath,
      displayPath: input.displayPath,
      content: parsed.body,
      level: input.level,
      sticky: input.sticky,
      ...parsed.description === undefined ? {} : { description: parsed.description },
      ...parsed.globs === undefined ? {} : { globs: parsed.globs },
      alwaysApply: input.forceAlwaysApply || parsed.alwaysApply,
      hasTtsrFields: parsed.hasTtsrFields,
    },
    ...warnings.length > 0 ? { warning: warnings.join('; ') } : {},
  }
}

async function loadRulesDirectory(
  dir: string,
  displayDir: string,
  level: RuleLevel,
  maxSourceBytes: number,
  fileSystem?: FileSystem,
  signal?: AbortSignal,
): Promise<{ rules: Rule[]; warnings: string[] }> {
  const entries = await listDir(dir, fileSystem, signal)
  if (entries === undefined) return { rules: [], warnings: [] }
  const names = entries
    .filter(entry => entry.isFile && RULE_FILE_EXTENSION.test(entry.name))
    .map(entry => entry.name)
    .sort()
  const rules: Rule[] = []
  const warnings: string[] = []
  for (const name of names) {
    const loaded = await loadRuleFile({
      absolutePath: join(dir, name),
      displayPath: `${displayDir}/${name}`,
      name: name.replace(RULE_FILE_EXTENSION, ''),
      level,
      sticky: false,
      forceAlwaysApply: false,
    }, maxSourceBytes, fileSystem, signal)
    if (loaded.warning !== undefined) warnings.push(loaded.warning)
    if (loaded.rule !== undefined) rules.push(loaded.rule)
  }
  return { rules, warnings }
}

async function loadStickyFile(
  absolutePath: string,
  displayPath: string,
  name: string,
  level: RuleLevel,
  maxSourceBytes: number,
  fileSystem?: FileSystem,
  signal?: AbortSignal,
): Promise<{ rule?: Rule; warning?: string }> {
  return loadRuleFile({
    absolutePath,
    displayPath,
    name,
    level,
    sticky: true,
    forceAlwaysApply: true,
  }, maxSourceBytes, fileSystem, signal)
}

/**
 * Discover the omp-compatible rule set for one session cwd: project rules from
 * `<cwd>/.omp/rules`, user rules from `<ompAgentDir>/rules`, and the sticky
 * `RULES.md` files at the user agent directory and the nearest non-empty
 * project `.omp/` directory walking toward the project root. Project entries
 * are appended before user entries, so first-wins name deduplication lets a
 * project rule shadow a user rule of the same name.
 * @param options - cwd, agent directory, root marker, and size cap configuration.
 * @param fileSystem - optional provider used instead of host filesystem reads.
 * @returns the deduplicated rules in merge order and any discovery warnings.
 */
export async function discoverAgentRules(
  options: DiscoverRulesOptions,
  fileSystem?: FileSystem,
): Promise<DiscoveredRuleSet> {
  const resolved: ResolvedConfig = resolveConfig({
    ...options.ompAgentDir === undefined ? {} : { ompAgentDir: options.ompAgentDir },
    ...options.projectRootMarkers === undefined ? {} : { projectRootMarkers: options.projectRootMarkers },
    // Discovery never renders; the render budget is irrelevant here and a
    // disabled render budget must not block the `rule` tool's lookups.
    maxBytes: 1,
    ...options.maxSourceBytes === undefined ? {} : { maxSourceBytes: options.maxSourceBytes },
  })
  const cwd = resolve(options.cwd)
  const projectRoot = options.projectRoot === undefined
    ? await findProjectRoot(cwd, resolved.projectRootMarkers, fileSystem, options.signal)
    : options.projectRoot
  const rules: Rule[] = []
  const warnings: string[] = []
  const seen = new Set<string>()
  const accept = (loaded: { rules: Rule[]; warnings: string[] }): void => {
    warnings.push(...loaded.warnings)
    for (const rule of loaded.rules) {
      if (seen.has(rule.name)) continue
      seen.add(rule.name)
      rules.push(rule)
    }
  }

  // Project rules: only the cwd's own `.omp/rules`, and only when the cwd's
  // `.omp/` directory is non-empty — omp performs no ancestor walk for these.
  const projectOmpDir = join(cwd, OMP_DIRECTORY)
  if (await isNonEmptyDir(projectOmpDir, fileSystem, options.signal)) {
    accept(await loadRulesDirectory(
      join(projectOmpDir, RULES_DIRECTORY),
      `${relative(projectRoot, projectOmpDir)}/${RULES_DIRECTORY}`,
      'project',
      resolved.maxSourceBytes,
      fileSystem,
      options.signal,
    ))
  }

  // User rules: the omp user agent directory's `rules/` when non-empty.
  if (await isNonEmptyDir(resolved.ompAgentDir, fileSystem, options.signal)) {
    accept(await loadRulesDirectory(
      join(resolved.ompAgentDir, RULES_DIRECTORY),
      `${resolved.ompAgentDirDisplay}/${RULES_DIRECTORY}`,
      'user',
      resolved.maxSourceBytes,
      fileSystem,
      options.signal,
    ))
  }

  // Sticky user rule: `<ompAgentDir>/RULES.md`.
  const stickyUser = await loadStickyFile(
    join(resolved.ompAgentDir, STICKY_FILE),
    `${resolved.ompAgentDirDisplay}/${STICKY_FILE}`,
    STICKY_USER_RULE_NAME,
    'user',
    resolved.maxSourceBytes,
    fileSystem,
    options.signal,
  )
  if (stickyUser.warning !== undefined) warnings.push(stickyUser.warning)
  if (stickyUser.rule !== undefined && !seen.has(stickyUser.rule.name)) {
    seen.add(stickyUser.rule.name)
    rules.push(stickyUser.rule)
  }

  // Sticky project rule: `RULES.md` in the nearest non-empty `.omp/` directory
  // walking from the cwd toward the project root; the walk stops at that
  // directory even when it lacks `RULES.md`.
  let current = cwd
  for (;;) {
    const ompDir = join(current, OMP_DIRECTORY)
    if (await isNonEmptyDir(ompDir, fileSystem, options.signal)) {
      const stickyProject = await loadStickyFile(
        join(ompDir, STICKY_FILE),
        relative(projectRoot, join(ompDir, STICKY_FILE)),
        STICKY_PROJECT_RULE_NAME,
        'project',
        resolved.maxSourceBytes,
        fileSystem,
        options.signal,
      )
      if (stickyProject.warning !== undefined) warnings.push(stickyProject.warning)
      if (stickyProject.rule !== undefined && !seen.has(stickyProject.rule.name)) {
        seen.add(stickyProject.rule.name)
        rules.push(stickyProject.rule)
      }
      break
    }
    if (current === projectRoot) break
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return { rules, warnings }
}
