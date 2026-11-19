/**
 * Fork upgrade audit: compare the fork's merge base with the upstream tip and
 * check that the fork's own surfaces still fit the merged tree.
 *
 * The range always starts at `merge-base(HEAD, target)`: the recorded tag names
 * the release line the fork last consumed, not the point where the fork stopped
 * consuming upstream. A release tag that is not an ancestor of HEAD names a
 * range the fork never merged; that case prints the commits and guides hidden
 * behind the merge base. Reports the upstream upgrade guides added by the range
 * (the externally perceptible changes to read before adapting), the files both
 * sides touched (the adaptation checklist), and the fork's plugin and profile
 * surfaces. Fails when a fork plugin registers a slot the merged tree no longer
 * declares or a profile row names a package that no longer resolves.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const BASE_FILE = 'packages/fork/upstream-base.json'
const OVERLAP_FILE = '.scratch/fork-upgrade/overlap.txt'
const SLOT_OWNERS = ['packages/client', 'packages/experimental', 'packages/api', 'packages/core', 'apps']
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs']
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'lib', 'types', 'assets'])

interface BaseRecord {
  tag: string | null
  mergedAt: string
}

/** Run one git command in the repository and return trimmed stdout. */
function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

/** Run one git command and return its lines, dropping empty entries. */
function gitLines(root: string, args: string[]): string[] {
  return git(root, args).split('\n').filter(line => line.length > 0)
}

/** Read the recorded upstream base record, or undefined when the file is absent. */
function readBase(root: string): BaseRecord | undefined {
  const path = join(root, BASE_FILE)
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, 'utf8')) as BaseRecord
}

/**
 * Classify `ancestor` against `descendant` with the three-way
 * `git merge-base --is-ancestor` exit status: 0 is an ancestor, 1 is not, and
 * anything else means the revision does not resolve.
 * @param root - Repository whose object database resolves both revisions.
 * @param ancestor - Revision expected to be an ancestor.
 * @param descendant - Revision expected to contain the ancestor.
 * @returns Whether `ancestor` is an ancestor of `descendant`.
 */
function isAncestor(root: string, ancestor: string, descendant: string): boolean {
  const probe = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: root, encoding: 'utf8' })
  if (probe.status === 0) return true
  if (probe.status === 1) return false
  const detail = probe.stderr.trim() || `код ${String(probe.status)}`
  throw new Error(`ревизия «${ancestor}» не разрешается относительно ${descendant}: ${detail}`)
}

/** The tag closest to the target commit, or null when no tag is merged there. */
function nearestTag(root: string, target: string): string | null {
  return gitLines(root, ['tag', '--merged', target, '--sort=-creatordate'])[0] ?? null
}

/** Russian plural form for a count: one, few, many. */
function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/** First line of a value, trimmed to a readable length. */
function clip(text: string, length: number): string {
  const line = text.split('\n')[0]?.trim() ?? ''
  return line.length > length ? `${line.slice(0, length - 1)}…` : line
}

/** Read one file from the target commit. */
function readAt(root: string, target: string, path: string): string {
  try {
    return git(root, ['show', `${target}:${path}`])
  } catch {
    return ''
  }
}

/** Upstream upgrade guides added or changed in the range. */
function upgradeGuides(root: string, base: string, target: string): string[] {
  const rows = gitLines(root, ['diff', '--name-status', base, target, '--', 'docs/upgrade-guide'])
  const guides: string[] = []
  for (const row of rows) {
    const [status, path] = row.split('\t')
    if (path === undefined || !path.endsWith('/guide.md') || (status !== 'A' && status !== 'M')) continue
    const source = readAt(root, target, path)
    const heading = clip(/^#\s+(.+)$/m.exec(source)?.[1] ?? path, 90)
    const description = clip(/^description:\s*"?(.+?)"?\s*$/m.exec(source)?.[1] ?? '', 120)
    guides.push(`${status === 'A' ? 'новый' : 'изменён'}: ${heading}${description.length > 0 ? ` — ${description}` : ''}\n    ${path.replace('docs/upgrade-guide/', '')}`)
  }
  return guides
}

/** Guide files reachable from the tag but not from HEAD. */
function hiddenGuides(root: string, tag: string): string[] {
  return gitLines(root, ['diff', '--name-status', '--diff-filter=A', 'HEAD', tag, '--', 'docs/upgrade-guide'])
    .filter(row => row.split('\t')[1]?.endsWith('/guide.md') === true)
}

/** Files the fork's own commits changed inside the range. */
function forkTouchedFiles(root: string, base: string): Set<string> {
  return new Set(gitLines(root, ['log', '--no-merges', '--name-only', '--format=', `${base}..HEAD`]))
}

/** Files upstream changed inside the range. */
function upstreamTouchedFiles(root: string, base: string, target: string): Set<string> {
  return new Set(gitLines(root, ['log', '--no-merges', '--name-only', '--format=', `${base}..${target}`]))
}

/** Net files upstream changed inside the range. */
function upstreamChangedFiles(root: string, base: string, target: string): number {
  return gitLines(root, ['diff', '--name-only', base, target]).length
}

/** Fork-local package directories under packages/fork. */
function forkPackages(root: string): string[] {
  const group = join(root, 'packages/fork')
  if (!existsSync(group)) return []
  return readdirSync(group)
    .map(name => join(group, name))
    .filter(path => statSync(path).isDirectory() && existsSync(join(path, 'package.json')))
}

/** External plugin directories this workstation loads in a profile. */
function externalPluginDirectories(home: string): string[] {
  const configured = process.env['DSH_FORK_PLUGIN_DIRS']
  const roots = configured !== undefined && configured.length > 0
    ? configured.split(':').filter(Boolean)
    : [join(home, 'home/dev/dsh-plugins'), join(home, 'dev/dsh-plugins')]
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
function profilePatches(home: string): string[] {
  const dshHome = join(home, '.dsh')
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
function slotDeclared(root: string, slot: string): boolean {
  try {
    execFileSync('git', ['grep', '-q', '-F', `'${slot}'`, '--', ...SLOT_OWNERS], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Workspace package names and their directories inside the checkout. */
function workspacePackages(root: string): Map<string, string> {
  const packages = new Map<string, string>()
  const groups = ['packages', 'apps', 'vendor']
  for (const group of groups) {
    const groupPath = join(root, group)
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
function profileProblems(patches: string[], workspace: Map<string, string>, home: string): string[] {
  const problems: string[] = []
  const profilesRoot = join(home, '.dsh/profiles')
  for (const patch of patches) {
    const source = readFileSync(patch, 'utf8')
    for (const match of source.matchAll(/^\s*(?:-\s*)?name:\s*['"]?([^'"\s]+)['"]?\s*$/gm)) {
      const id = match[1]
      if (id === undefined || id.length === 0) continue
      if (id.startsWith('.') || id.startsWith('/')) {
        if (!existsSync(resolve(dirname(patch), id))) {
          problems.push(`${patch.replace(home, '~')}: путь «${id}» не существует`)
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
        problems.push(`${patch.replace(home, '~')}: пакет «${packageName}» не найден ни в workspace, ни в node_modules профилей`)
        continue
      }
      if (subpath !== undefined && !exported(directory, subpath)) {
        problems.push(`${patch.replace(home, '~')}: пакет «${packageName}» не экспортирует «${subpath}»`)
      }
    }
  }
  return problems
}

/**
 * Write the recorded base for the next audit run. The nearest tag merged into
 * the target names the released upstream state; the file records that release
 * line, while the audit range always comes from the merge base.
 * @param root - Repository whose tags and history resolve.
 * @param target - Upstream revision the merge consumed.
 * @returns The line naming the recorded state.
 */
function recordBase(root: string, target: string): string {
  const tag = nearestTag(root, target)
  const record: BaseRecord = { tag, mergedAt: new Date().toISOString().slice(0, 10) }
  const path = join(root, BASE_FILE)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`)
  const recorded = `база записана — ${tag ?? 'тега нет'}`
  if (tag === null) return `${recorded}; диапазон даст merge-base`
  const commit = git(root, ['rev-parse', `${tag}^{commit}`])
  if (isAncestor(root, commit, 'HEAD')) return recorded
  return `${recorded}; внимание: тег не влит в HEAD, диапазон даст merge-base`
}

/** Render one headed section. */
function section(title: string): string {
  return `\n== ${title} ==`
}

/** A strict run that found problems: the report travels with the failure. */
export class AuditProblemsError extends Error {
  constructor(message: string, readonly report: string) {
    super(message)
    this.name = 'AuditProblemsError'
  }
}

/**
 * Render the complete fork upgrade audit report for one repository.
 * @param args - Command-line arguments after the script path.
 * @param root - Repository whose history, manifest, and profile rows are read.
 * @param home - Home directory whose external plugins and profile patches are read.
 * @returns Report text with a trailing newline.
 * @throws AuditProblemsError when `--strict` finds a missing slot or unresolved profile row.
 */
export function renderAudit(args: string[], root: string, home = homedir()): string {
  const argValue = (flag: string): string | undefined => {
    const index = args.indexOf(flag)
    return index === -1 ? undefined : args[index + 1]
  }
  const target = argValue('--target') ?? 'upstream/master'
  const strict = args.includes('--strict')

  if (args.includes('--record-base')) return `${recordBase(root, target)}\n`

  const explicitBase = argValue('--base')
  const base = explicitBase ?? git(root, ['merge-base', 'HEAD', target])
  if (!isAncestor(root, base, 'HEAD')) {
    throw new Error(`база ${base} не предок HEAD — диапазон посчитан от чужой линии`)
  }

  const lines: string[] = [section('fork upgrade audit')]
  lines.push(`диапазон: ${base}..${target}`)
  lines.push(`база: ${base}`)

  const recorded = readBase(root)
  if (recorded === undefined) {
    lines.push(`записанный тег: нет (${BASE_FILE} отсутствует)`)
  } else if (recorded.tag == null) {
    lines.push('записанный тег: нет')
  } else {
    try {
      const tagCommit = git(root, ['rev-parse', `${recorded.tag}^{commit}`])
      const merged = isAncestor(root, tagCommit, 'HEAD')
      lines.push(`записанный тег: ${recorded.tag} = ${tagCommit}`)
      lines.push(`влит в HEAD: ${merged ? 'да' : 'нет'}`)
      if (!merged) {
        const hiddenCommits = Number(git(root, ['rev-list', '--count', 'HEAD..' + tagCommit]))
        const guides = hiddenGuides(root, tagCommit)
        lines.push(`внимание: записанный тег ${recorded.tag} не влит в HEAD — за базой скрыто ${hiddenCommits} ${plural(hiddenCommits, 'коммит', 'коммита', 'коммитов')} и ${guides.length} guide.md`)
        for (const guide of guides) lines.push(`  ${guide.replace('\t', ' ')}`)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message.split('\n')[0] : String(error)
      lines.push(`записанный тег: ${recorded.tag} не разрешается (${detail}); диапазон считает merge-base`)
    }
  }

  const commits = Number(git(root, ['rev-list', '--count', `${base}..${target}`]))
  const merges = Number(git(root, ['rev-list', '--count', '--merges', `${base}..${target}`]))
  const tags = gitLines(root, ['tag', '--merged', target, '--no-merged', base])
  lines.push(`новые теги: ${tags.length > 0 ? tags.join(', ') : 'нет'}`)
  if (commits === 0) {
    lines.push('апстрим влит полностью: новых коммитов нет, проверяю только форк-поверхности')
  }
  lines.push(`${commits} ${plural(commits, 'коммит', 'коммита', 'коммитов')} (${plural(merges, 'мердж', 'мерджа', 'мерджей')} ${merges})`)

  lines.push(section('upgrade guides в диапазоне (читай до адаптации)'))
  const guides = upgradeGuides(root, base, target)
  const added = guides.filter(guide => guide.startsWith('новый:')).length
  const changedGuides = guides.length - added
  lines.push(guides.length === 0
    ? 'гайдов нет'
    : `гайдов ${added} ${plural(added, 'новый', 'новых', 'новых')} + ${changedGuides} ${plural(changedGuides, 'изменённый', 'изменённых', 'изменённых')}`)
  for (const guide of guides) lines.push(`  - ${guide}`)

  lines.push(section('пересечение: файлы, которые менял и апстрим, и форк'))
  const forkFiles = forkTouchedFiles(root, base)
  const upstreamFiles = upstreamTouchedFiles(root, base, target)
  const changed = upstreamChangedFiles(root, base, target)
  const overlap = [...forkFiles].filter(path => upstreamFiles.has(path)).sort()
  if (overlap.length === 0) {
    lines.push(`файлов пересечения нет; апстрим изменил ${changed}`)
  } else {
    const overlapPath = join(root, OVERLAP_FILE)
    mkdirSync(dirname(overlapPath), { recursive: true })
    writeFileSync(overlapPath, `${overlap.join('\n')}\n`)
    lines.push(`файлов пересечения ${overlap.length}; апстрим изменил ${changed}; полный список: ${OVERLAP_FILE}`)
    const groups = new Map<string, number>()
    for (const path of overlap) {
      const key = path.split('/').slice(0, 3).join('/')
      groups.set(key, (groups.get(key) ?? 0) + 1)
    }
    const top = [...groups.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12)
    for (const [group, count] of top) lines.push(`  ${String(count).padStart(3)}  ${group}`)
  }

  lines.push(section('форк-поверхности'))
  const repoPackages = forkPackages(root)
  const externalPlugins = externalPluginDirectories(home)
  const patches = profilePatches(home)
  lines.push(`пакеты packages/fork: ${repoPackages.length}`)
  for (const path of repoPackages) lines.push(`  - ${path.replace(`${root}/`, '')}`)
  lines.push(`внешние плагины: ${externalPlugins.length}`)
  for (const path of externalPlugins) lines.push(`  - ${path.replace(home, '~')}`)
  lines.push(`патчи профилей: ${patches.length}`)
  for (const path of patches) lines.push(`  - ${path.replace(home, '~')}`)

  const problems: string[] = []
  lines.push(section('слоты форк-плагинов в смерженном дереве'))
  const pluginRoots = [...repoPackages, ...externalPlugins]
  if (pluginRoots.length === 0) lines.push('форк-плагинов нет')
  for (const pluginRoot of pluginRoots) {
    const label = pluginRoot.replace(home, '~').replace(`${root}/`, '')
    for (const slot of pluginSlots(pluginRoot)) {
      const known = slotDeclared(root, slot)
      lines.push(`  ${known ? 'ok  ' : 'MISS'} ${slot} (${label})`)
      if (!known) problems.push(`слот «${slot}» не объявлен в дереве (плагин ${label})`)
    }
  }

  lines.push(section('строки профилей на этой машине'))
  if (patches.length === 0) lines.push('патчей профилей нет')
  else {
    const found = profileProblems(patches, workspacePackages(root), home)
    if (found.length === 0) lines.push('все строки разрешаются')
    for (const problem of found) {
      lines.push(`  MISS ${problem}`)
      problems.push(problem)
    }
  }

  lines.push(section('итог'))
  if (problems.length === 0) {
    lines.push('проблем нет: форк-поверхности ложатся на смерженное дерево')
  } else {
    lines.push(`проблем: ${problems.length}`)
    for (const problem of problems) lines.push(`  - ${problem}`)
  }
  const report = `${lines.join('\n')}\n`
  if (strict && problems.length > 0) {
    throw new AuditProblemsError('адаптируй форк-поверхности и повтори (--strict)', report)
  }
  return report
}

const entryPath = process.argv[1]
if (entryPath !== undefined && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(renderAudit(process.argv.slice(2), ROOT))
  } catch (error) {
    if (error instanceof AuditProblemsError) process.stdout.write(error.report)
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`fork-upgrade-audit: ${message}\n`)
    process.exitCode = 1
  }
}
