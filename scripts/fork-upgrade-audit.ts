/**
 * Fork upgrade audit: compare the last merged upstream commit with the new one
 * and check that the fork's own surfaces still fit the merged tree.
 *
 * Reports the upstream upgrade guides added by the range (the externally
 * perceptible changes to read before adapting), the files both sides touched
 * (the adaptation checklist), and the fork's plugin and profile surfaces. Fails
 * when a fork plugin registers a slot the merged tree no longer declares or a
 * profile row names a package that no longer resolves.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const BASE_FILE = join(ROOT, 'packages/fork/upstream-base.json')
const OVERLAP_FILE = join(ROOT, '.scratch/fork-upgrade/overlap.txt')
const SLOT_OWNERS = ['packages/client', 'packages/experimental', 'packages/api', 'packages/core', 'apps']
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs']
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'lib', 'types', 'assets'])

interface BaseRecord {
  tag: string | null
  mergedAt: string
}

/** Run one git command in the repository and return trimmed stdout. */
function git(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
}

/** Run one git command and return its lines, dropping empty entries. */
function gitLines(args: string[]): string[] {
  return git(args).split('\n').filter(line => line.length > 0)
}

/** Read the recorded upstream base, or undefined when the file is absent. */
function readBase(): BaseRecord | undefined {
  if (!existsSync(BASE_FILE)) return undefined
  return JSON.parse(readFileSync(BASE_FILE, 'utf8')) as BaseRecord
}

/**
 * Resolve the commit the audit compares from: the explicit `--base`, the tag the
 * base file records, or the merge base. The file records a tag rather than a
 * commit id because `verify-repository-references` rejects bare commit hashes.
 */
function resolveBase(target: string, explicit: string | undefined): { base: string; source: string } {
  if (explicit !== undefined) return { base: explicit, source: '--base' }
  const recorded = readBase()
  if (recorded?.tag != null) {
    try {
      return { base: git(['rev-parse', `${recorded.tag}^{commit}`]), source: `${recorded.tag} (${BASE_FILE.replace(`${ROOT}/`, '')})` }
    } catch {
      console.log(`fork-upgrade-audit: тег «${recorded.tag}» из базы не разрешается — беру merge-base`)
    }
  }
  return { base: git(['merge-base', 'HEAD', target]), source: 'merge-base' }
}

/** The tag closest to the target commit, for the recorded base file. */
function nearestTag(target: string): string | null {
  const tags = gitLines(['tag', '--merged', target, '--sort=-creatordate'])
  return tags[0] ?? null
}

/** First line of a value, trimmed to a readable length. */
function clip(text: string, length: number): string {
  const line = text.split('\n')[0]?.trim() ?? ''
  return line.length > length ? `${line.slice(0, length - 1)}…` : line
}

/** Read one file from the target commit. */
function readAt(target: string, path: string): string {
  try {
    return git(['show', `${target}:${path}`])
  } catch {
    return ''
  }
}

/** Upstream upgrade guides added or changed in the range. */
function upgradeGuides(base: string, target: string): string[] {
  const rows = gitLines(['diff', '--name-status', base, target, '--', 'docs/upgrade-guide'])
  const guides: string[] = []
  for (const row of rows) {
    const [status, path] = row.split('\t')
    if (path === undefined || !path.endsWith('/guide.md') || (status !== 'A' && status !== 'M')) continue
    const source = readAt(target, path)
    const heading = clip(/^#\s+(.+)$/m.exec(source)?.[1] ?? path, 90)
    const description = clip(/^description:\s*"?(.+?)"?\s*$/m.exec(source)?.[1] ?? '', 120)
    guides.push(`${status === 'A' ? 'новый' : 'изменён'}: ${heading}${description.length > 0 ? ` — ${description}` : ''}\n    ${path.replace('docs/upgrade-guide/', '')}`)
  }
  return guides
}

/** Files the fork's own commits changed inside the range. */
function forkTouchedFiles(base: string): Set<string> {
  const rows = gitLines(['log', '--no-merges', '--name-only', '--format=', `${base}..HEAD`])
  return new Set(rows)
}

/** Files upstream changed inside the range. */
function upstreamTouchedFiles(base: string, target: string): Set<string> {
  const rows = gitLines(['log', '--no-merges', '--name-only', '--format=', `${base}..${target}`])
  return new Set(rows)
}

/** Fork-local package directories under packages/fork. */
function forkPackages(): string[] {
  const group = join(ROOT, 'packages/fork')
  if (!existsSync(group)) return []
  return readdirSync(group)
    .map(name => join(group, name))
    .filter(path => statSync(path).isDirectory() && existsSync(join(path, 'package.json')))
}

/** External plugin directories this workstation loads in a profile. */
function externalPluginDirectories(): string[] {
  const configured = process.env['DSH_FORK_PLUGIN_DIRS']
  const roots = configured !== undefined && configured.length > 0
    ? configured.split(':').filter(Boolean)
    : [join(homedir(), 'home/dev/dsh-plugins'), join(homedir(), 'dev/dsh-plugins')]
  const directories: string[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const name of readdirSync(root)) {
      const path = join(root, name)
      if (statSync(path).isDirectory() && existsSync(join(path, 'package.json'))) directories.push(path)
    }
  }
  return directories
}

/** Machine-local profile patch layers the running profile applies. */
function profilePatches(): string[] {
  const dshHome = join(homedir(), '.dsh')
  const patches: string[] = []
  const global = join(dshHome, 'cordis.patch.yml')
  if (existsSync(global)) patches.push(global)
  const profiles = join(dshHome, 'profiles')
  if (!existsSync(profiles)) return patches
  for (const name of readdirSync(profiles)) {
    const patch = join(profiles, name, 'cordis.patch.yml')
    if (existsSync(patch)) patches.push(patch)
  }
  return patches
}

/** Every source file under one plugin directory, skipping build and vendor output. */
function sourceFiles(directory: string): string[] {
  const files: string[] = []
  const walk = (path: string): void => {
    for (const entry of readdirSync(path)) {
      if (SKIP_DIRECTORIES.has(entry)) continue
      const child = join(path, entry)
      const stats = statSync(child)
      if (stats.isDirectory()) {
        walk(child)
        continue
      }
      if (stats.size > 2 * 1024 * 1024) continue
      if (SOURCE_EXTENSIONS.some(extension => entry.endsWith(extension))) files.push(child)
    }
  }
  walk(directory)
  return files
}

/** Slot names one plugin registers into or injects. */
function pluginSlots(directory: string): Set<string> {
  const slots = new Set<string>()
  const patterns = [
    /slots\.inject\(\s*['"]([^'"]+)['"]/g,
    /slots\.register\(\s*\{\s*name:\s*['"]([^'"]+)['"]/g,
    /register\(\{\s*name:\s*["']([^"']+)["']/g,
  ]
  for (const file of sourceFiles(directory)) {
    const source = readFileSync(file, 'utf8')
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        if (match[1] !== undefined) slots.add(match[1])
      }
    }
  }
  return slots
}

/** Whether the merged tree declares one slot name on any owning surface. */
function slotDeclared(slot: string): boolean {
  try {
    execFileSync('git', ['grep', '-q', '-F', `'${slot}'`, '--', ...SLOT_OWNERS], { cwd: ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Workspace package names and their directories inside the checkout. */
function workspacePackages(): Map<string, string> {
  const packages = new Map<string, string>()
  const groups = ['packages', 'apps', 'vendor']
  for (const group of groups) {
    const groupPath = join(ROOT, group)
    if (!existsSync(groupPath)) continue
    for (const first of readdirSync(groupPath)) {
      const firstPath = join(groupPath, first)
      if (!statSync(firstPath).isDirectory()) continue
      const candidates = group === 'packages'
        ? readdirSync(firstPath).map(name => join(firstPath, name))
        : [firstPath]
      for (const candidate of candidates) {
        const manifest = join(candidate, 'package.json')
        if (!existsSync(manifest)) continue
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }
        if (parsed.name !== undefined) packages.set(parsed.name, candidate)
      }
    }
  }
  return packages
}

/** Split a module id into its package name and its subpath export. */
function splitModuleId(id: string): { packageName: string; subpath: string | undefined } {
  const segments = id.split('/')
  const packageSegments = id.startsWith('@') ? 2 : 1
  const packageName = segments.slice(0, packageSegments).join('/')
  const rest = segments.slice(packageSegments).join('/')
  return { packageName, subpath: rest.length > 0 ? `./${rest}` : undefined }
}

/** Whether one package manifest exports the requested subpath. */
function exported(packageDirectory: string, subpath: string): boolean {
  const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as {
    exports?: Record<string, unknown>
  }
  const keys = Object.keys(manifest.exports ?? {})
  if (keys.includes(subpath)) return true
  return keys.some(key => key.endsWith('/*') && subpath.startsWith(key.slice(0, -1)))
}

/** Profile rows naming a package or path that must resolve on this machine. */
function profileProblems(patches: string[], workspace: Map<string, string>): string[] {
  const problems: string[] = []
  const profilesRoot = join(homedir(), '.dsh/profiles')
  for (const patch of patches) {
    const source = readFileSync(patch, 'utf8')
    for (const match of source.matchAll(/^\s*(?:-\s*)?name:\s*['"]?([^'"\s]+)['"]?\s*$/gm)) {
      const id = match[1]
      if (id === undefined || id.length === 0) continue
      if (id.startsWith('.') || id.startsWith('/')) {
        if (!existsSync(resolve(dirname(patch), id))) {
          problems.push(`${patch.replace(homedir(), '~')}: путь «${id}» не существует`)
        }
        continue
      }
      const { packageName, subpath } = splitModuleId(id)
      const candidates = [
        workspace.get(packageName),
        join(profilesRoot, 'node_modules', packageName),
        join(dirname(patch), 'node_modules', packageName),
      ].filter((path): path is string => path !== undefined)
      const directory = candidates.find(path => existsSync(join(path, 'package.json')))
      if (directory === undefined) {
        problems.push(`${patch.replace(homedir(), '~')}: пакет «${packageName}» не найден ни в workspace, ни в node_modules профилей`)
        continue
      }
      if (subpath !== undefined && !exported(directory, subpath)) {
        problems.push(`${patch.replace(homedir(), '~')}: пакет «${packageName}» не экспортирует «${subpath}»`)
      }
    }
  }
  return problems
}

/**
 * Write the recorded base for the next audit run. The nearest merged tag names
 * the released upstream state; without one the next run falls back to the merge
 * base, which stays correct for a pre-merge run.
 */
function recordBase(target: string): void {
  const tag = nearestTag(target)
  const record: BaseRecord = { tag, mergedAt: new Date().toISOString().slice(0, 10) }
  writeFileSync(BASE_FILE, `${JSON.stringify(record, null, 2)}\n`)
  console.log(`fork-upgrade-audit: база записана — ${tag ?? 'тега нет, fallback на merge-base'}`)
}

/** Print one headed section. */
function section(title: string): void {
  console.log(`\n== ${title} ==`)
}

const argv = process.argv.slice(2)
const argValue = (flag: string): string | undefined => {
  const index = argv.indexOf(flag)
  return index === -1 ? undefined : argv[index + 1]
}
const target = argValue('--target') ?? 'upstream/master'
const strict = argv.includes('--strict')

if (argv.includes('--record-base')) {
  recordBase(target)
  process.exit(0)
}

const { base, source } = resolveBase(target, argValue('--base'))
const problems: string[] = []

section('fork upgrade audit')
console.log(`диапазон: ${base.slice(0, 12)}..${target} (база: ${source})`)

if (base === git(['rev-parse', target])) {
  console.log('апстрим влит полностью: новых коммитов нет, проверяю только форк-поверхности')
} else {
  const commits = Number(git(['rev-list', '--count', `${base}..${target}`]))
  const merges = Number(git(['rev-list', '--count', '--merges', `${base}..${target}`]))
  const tags = gitLines(['tag', '--merged', target, '--no-merged', base])
  console.log(`коммитов: ${commits} (мерджей ${merges}); новые теги: ${tags.length > 0 ? tags.join(', ') : 'нет'}`)
}

section('upgrade guides в диапазоне (читай до адаптации)')
const guides = upgradeGuides(base, target)
if (guides.length === 0) console.log('нет новых или изменённых guide.md')
for (const guide of guides) console.log(`  - ${guide}`)

section('пересечение: файлы, которые менял и апстрим, и форк')
const forkFiles = forkTouchedFiles(base)
const upstreamFiles = upstreamTouchedFiles(base, target)
const overlap = [...forkFiles].filter(path => upstreamFiles.has(path)).sort()
if (overlap.length === 0) {
  console.log('нет пересечений')
} else {
  mkdirSync(dirname(OVERLAP_FILE), { recursive: true })
  writeFileSync(OVERLAP_FILE, `${overlap.join('\n')}\n`)
  const groups = new Map<string, number>()
  for (const path of overlap) {
    const key = path.split('/').slice(0, 3).join('/')
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  const top = [...groups.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12)
  console.log(`файлов: ${overlap.length}; полный список: ${OVERLAP_FILE.replace(`${ROOT}/`, '')}`)
  for (const [group, count] of top) console.log(`  ${String(count).padStart(3)}  ${group}`)
}

section('форк-поверхности')
const repoPackages = forkPackages()
const externalPlugins = externalPluginDirectories()
const patches = profilePatches()
console.log(`пакеты packages/fork: ${repoPackages.length}`)
for (const path of repoPackages) console.log(`  - ${path.replace(`${ROOT}/`, '')}`)
console.log(`внешние плагины: ${externalPlugins.length}`)
for (const path of externalPlugins) console.log(`  - ${path.replace(homedir(), '~')}`)
console.log(`патчи профилей: ${patches.length}`)
for (const path of patches) console.log(`  - ${path.replace(homedir(), '~')}`)

section('слоты форк-плагинов в смерженном дереве')
const pluginRoots = [...repoPackages, ...externalPlugins]
if (pluginRoots.length === 0) console.log('форк-плагинов нет')
for (const root of pluginRoots) {
  for (const slot of pluginSlots(root)) {
    const known = slotDeclared(slot)
    console.log(`  ${known ? 'ok  ' : 'MISS'} ${slot} (${root.replace(homedir(), '~').replace(`${ROOT}/`, '')})`)
    if (!known) problems.push(`слот «${slot}» не объявлен в дереве (плагин ${root.replace(homedir(), '~').replace(`${ROOT}/`, '')})`)
  }
}

section('строки профилей на этой машине')
if (patches.length === 0) console.log('патчей профилей нет')
else {
  const found = profileProblems(patches, workspacePackages())
  if (found.length === 0) console.log('все строки разрешаются')
  for (const problem of found) {
    console.log(`  MISS ${problem}`)
    problems.push(problem)
  }
}

section('итог')
if (problems.length === 0) {
  console.log('проблем нет: форк-поверхности ложатся на смерженное дерево')
} else {
  console.log(`проблем: ${problems.length}`)
  for (const problem of problems) console.log(`  - ${problem}`)
}
if (strict && problems.length > 0) {
  console.error('\nfork-upgrade-audit: адаптируй форк-поверхности и повтори (--strict)')
  process.exit(1)
}
