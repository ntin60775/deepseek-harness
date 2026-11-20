/**
 * Fork profile audit: compose every installed DSH profile, record its entry and
 * tool inventory, and compare that inventory with the baseline recorded after
 * the last green merge ritual.
 *
 * Upstream moves tool entry ids, Config schemas, and bundle patch targets while
 * the profiles live outside this repository. `dsh --profile <name>
 * --dump-config` composes the bundle layers and the user patch layers without
 * mounting, so an entry that a merge dropped, renamed, or disabled shows up here
 * before a host boots the profile. `--dump-config-schema` reports Config
 * failures the same composition would hit at mount.
 *
 * The baseline is machine-local (`.scratch/fork-upgrade/profiles.json`, never
 * committed): the ritual records it after a green run and the next merge
 * compares against it, so a profile that silently loses a tool entry fails the
 * audit instead of surfacing as a missing control days later.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE_FILE = '.scratch/fork-upgrade/profiles.json'

/** One composed Loader entry as printed by `--dump-config`. */
export interface ComposedEntry {
  /** Bundle section the entry came from; `unlabeled` outside a section header. */
  section: string
  /** Loader entry id targeted by patch layers. */
  id: string
  /** Plugin package name or relative module path; empty when the dump omits it. */
  name: string
  /** Literal `disabled` value when the dump prints one; null when absent. */
  disabled: string | null
}

/** One profile's recorded composition. */
export interface ProfileSnapshot {
  /** Every `id|name` entry key in the composed tree. */
  entries: string[]
  /** Entry keys that provide tools and are not statically disabled. */
  tools: string[]
  /** `dsh: error:` lines from the schema dump, with the entry index removed. */
  schemaErrors: string[]
}

/** Recorded composition of every profile, as written by `--record`. */
export interface ProfileBaseline {
  /** ISO date the baseline was recorded. */
  generatedAt?: string
  /** Per-profile snapshots keyed by profile name. */
  profiles: Record<string, ProfileSnapshot>
}

/** One profile's findings against its baseline. */
export interface ProfileComparison {
  /** Entry keys the baseline had and the composition lost. */
  missingEntries: string[]
  /** Tool entry keys the baseline had and the composition lost. */
  missingTools: string[]
  /** Entry keys the composition gained. */
  addedEntries: string[]
  /** Schema errors the baseline did not have. */
  newSchemaErrors: string[]
}

/** Identity of one composed entry: id, resolved plugin name, and static disable state. */
export function entryKey(entry: ComposedEntry): string {
  const disabled = entry.disabled === 'true' ? ' [disabled]' : ''
  return `${entry.id}|${entry.name}${disabled}`
}

/**
 * Whether a composed entry provides tools. Entry ids name the tool family
 * (`tool-fs`), and tool-provider rows carry `tool` in the package path.
 * @param entry - Composed entry to classify.
 * @returns Whether the entry's registration supplies tools.
 */
export function isToolEntry(entry: ComposedEntry): boolean {
  return entry.id.startsWith('tool-')
    || /(^|[/@-])tool[-/]/.test(entry.name)
    || entry.name.includes('/tools')
}

/**
 * Parse the composed tree printed by `dsh --profile <name> --dump-config`.
 * @param dump - Script stdout.
 * @returns Entries in composed order.
 */
export function parseComposedEntries(dump: string): ComposedEntry[] {
  const entries: ComposedEntry[] = []
  let section = 'unlabeled'
  for (const line of dump.split('\n')) {
    const header = /^# == (.+)$/.exec(line)
    if (header?.[1] !== undefined) {
      section = header[1].trim()
      continue
    }
    const id = /^\s*- id: (.+)$/.exec(line)
    if (id?.[1] !== undefined) {
      entries.push({ section, id: id[1].trim(), name: '', disabled: null })
      continue
    }
    const current = entries.at(-1)
    if (current === undefined) continue
    const name = /^\s+name: (?:'([^']*)'|(.+))$/.exec(line)
    if (name !== null) {
      current.name = (name[1] ?? name[2] ?? '').trim()
      continue
    }
    const disabled = /^\s+disabled: (.+)$/.exec(line)
    if (disabled?.[1] !== undefined) current.disabled = disabled[1].trim()
  }
  return entries
}

/**
 * Extract schema failures from the schema dump's diagnostic stream. The printed
 * entry index changes with unrelated composition edits, so it is dropped from
 * the recorded line.
 * @param stderr - Combined stderr/stdout diagnostics of `--dump-config-schema`.
 * @returns Normalized `dsh: error:` lines.
 */
export function parseSchemaErrors(stderr: string): string[] {
  return stderr.split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('dsh: error: '))
    .map(line => line.replace(/^dsh: error: \[\/?\d+\] /, 'dsh: error: '))
}

/**
 * Snapshot one composed profile: entry keys, active tool entry keys, and schema
 * errors, all sorted so the baseline compares independent of dump order.
 * @param entries - Parsed composed entries.
 * @param schemaErrors - Normalized schema failure lines.
 * @returns Deterministic snapshot for the baseline.
 */
export function snapshotProfile(entries: ComposedEntry[], schemaErrors: string[]): ProfileSnapshot {
  const keys = entries.map(entryKey).sort()
  const tools = entries.filter(entry => isToolEntry(entry) && entry.disabled !== 'true').map(entryKey).sort()
  return { entries: keys, tools, schemaErrors: [...new Set(schemaErrors)].sort() }
}

/**
 * Compare one profile snapshot with its baseline entry.
 * @param recorded - Baseline snapshot; undefined when the profile is new.
 * @param current - Snapshot of the current composition.
 * @returns Lost and gained entries plus new schema failures.
 */
export function compareProfile(recorded: ProfileSnapshot | undefined, current: ProfileSnapshot): ProfileComparison {
  if (recorded === undefined) {
    return { missingEntries: [], missingTools: [], addedEntries: [], newSchemaErrors: [] }
  }
  const currentEntries = new Set(current.entries)
  const recordedEntries = new Set(recorded.entries)
  const currentTools = new Set(current.tools)
  return {
    missingEntries: recorded.entries.filter(key => !currentEntries.has(key)),
    missingTools: recorded.tools.filter(key => !currentTools.has(key)),
    addedEntries: current.entries.filter(key => !recordedEntries.has(key)),
    newSchemaErrors: current.schemaErrors.filter(error => !recorded.schemaErrors.includes(error)),
  }
}

/** Profile directories under the DSH home that carry a manifest. */
function installedProfiles(home: string): string[] {
  const profilesRoot = join(process.env['DSH_HOME'] ?? join(home, '.dsh'), 'profiles')
  if (!existsSync(profilesRoot)) return []
  return readdirSync(profilesRoot)
    .map(name => join(profilesRoot, name))
    .filter(path => statSync(path).isDirectory() && existsSync(join(path, 'package.json')))
    .map(path => basename(path))
    .sort()
}

/** Run one `pnpm dsh` invocation and capture both streams. */
function runDsh(profile: string, flag: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('pnpm', ['dsh', '--profile', profile, flag], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: `${result.stderr}${result.stdout}`,
  }
}

/** Read the recorded baseline, or an empty record when none exists. */
function readBaseline(root: string): ProfileBaseline {
  const path = join(root, BASELINE_FILE)
  if (!existsSync(path)) return { profiles: {} }
  return JSON.parse(readFileSync(path, 'utf8')) as ProfileBaseline
}

/** Render one headed section. */
function section(title: string): string {
  return `\n== ${title} ==`
}

/** A strict run that found lost entries or tools: the report travels with the failure. */
export class ProfileAuditError extends Error {
  /**
   * @param message - Failure summary for the process exit path.
   * @param report - Full audit text rendered before the failure.
   */
  constructor(message: string, readonly report: string) {
    super(message)
    this.name = 'ProfileAuditError'
  }
}

/**
 * Render the profile audit for one checkout.
 * @param args - Command-line arguments after the script path: `--strict`, `--record`, `--profile <name>`.
 * @param root - Checkout whose installed profiles are composed.
 * @param home - Home directory holding the DSH home.
 * @returns Report text with a trailing newline.
 * @throws Error when `--strict` finds a lost entry, tool, or new schema failure.
 */
export function renderProfileAudit(args: string[], root: string, home = homedir()): string {
  const strict = args.includes('--strict')
  const record = args.includes('--record')
  const selected: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index + 1]
    if (args[index] === '--profile' && value !== undefined) {
      selected.push(value)
      index += 1
    }
  }
  const profiles = selected.length > 0 ? selected : installedProfiles(home)
  const baseline = readBaseline(root)

  const lines: string[] = [section('fork profile audit')]
  lines.push(`DSH_HOME: ${process.env['DSH_HOME'] ?? join(home, '.dsh')}`)
  lines.push(`базовая линия: ${BASELINE_FILE}${Object.keys(baseline.profiles).length === 0 ? ' (отсутствует)' : ''}`)

  if (profiles.length === 0) {
    lines.push('профилей нет — проверка пропущена')
    return `${lines.join('\n')}\n`
  }

  const problems: string[] = []
  const snapshots: Record<string, ProfileSnapshot> = {}
  lines.push(section('профили'))

  for (const profile of profiles) {
    const composed = runDsh(profile, '--dump-config')
    if (composed.status !== 0) {
      const detail = composed.stderr.split('\n').find(line => line.trim().length > 0) ?? 'нет вывода'
      lines.push(`  FAIL ${profile}: композиция не собирается — ${detail.trim()}`)
      problems.push(`профиль ${profile}: композиция не собирается`)
      continue
    }
    const entries = parseComposedEntries(composed.stdout)
    const schema = parseSchemaErrors(runDsh(profile, '--dump-config-schema').stderr)
    const snapshot = snapshotProfile(entries, schema)
    snapshots[profile] = snapshot
    const comparison = compareProfile(baseline.profiles[profile], snapshot)
    const toolCount = snapshot.tools.length
    lines.push(`  ${comparison.missingEntries.length === 0 && comparison.missingTools.length === 0 ? 'ok  ' : 'LOST'} ${profile}: записей ${snapshot.entries.length}, тул-записей ${toolCount}, schema-ошибок ${snapshot.schemaErrors.length}`)
    if (comparison.missingEntries.length > 0) {
      lines.push(`    потеряно записей: ${comparison.missingEntries.length}`)
      for (const key of comparison.missingEntries) lines.push(`      - ${key}`)
      if (!record) problems.push(`профиль ${profile}: потеряно записей ${comparison.missingEntries.length}`)
    }
    if (comparison.missingTools.length > 0) {
      lines.push(`    потеряно тул-записей: ${comparison.missingTools.length}`)
      for (const key of comparison.missingTools) lines.push(`      - ${key}`)
      if (!record) problems.push(`профиль ${profile}: потеряны инструменты ${comparison.missingTools.length}`)
    }
    if (comparison.addedEntries.length > 0) {
      lines.push(`    новых записей: ${comparison.addedEntries.length}`)
      for (const key of comparison.addedEntries.slice(0, 20)) lines.push(`      + ${key}`)
    }
    const invalidConfig = snapshot.schemaErrors.filter(error => error.includes('invalid config:'))
    if (invalidConfig.length > 0) {
      lines.push(`    конфиг не проходит схему плагина: ${invalidConfig.length}`)
      for (const error of invalidConfig) lines.push(`      ! ${error}`)
      problems.push(`профиль ${profile}: конфиг не проходит схему плагина`)
    }
    if (comparison.newSchemaErrors.length > 0) {
      lines.push(`    новых schema-ошибок: ${comparison.newSchemaErrors.length}`)
      for (const error of comparison.newSchemaErrors) lines.push(`      ! ${error}`)
      if (!record) problems.push(`профиль ${profile}: новых schema-ошибок ${comparison.newSchemaErrors.length}`)
    }
  }

  if (record && problems.length === 0) {
    const path = join(root, BASELINE_FILE)
    mkdirSync(dirname(path), { recursive: true })
    const next: ProfileBaseline = { generatedAt: new Date().toISOString().slice(0, 10), profiles: snapshots }
    writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`)
    lines.push(section('запись базовой линии'))
    lines.push(`записано: ${BASELINE_FILE}`)
  } else if (record) {
    lines.push(section('запись базовой линии'))
    lines.push('не записано: находки выше — сначала починить композицию профилей')
  }

  lines.push(section('итог'))
  if (problems.length === 0) {
    lines.push('профили соответствуют базовой линии: ни одна запись и ни один инструмент не потеряны')
  } else {
    lines.push(`проблем: ${problems.length}`)
    for (const problem of problems) lines.push(`  - ${problem}`)
  }
  if (strict && problems.length > 0) throw new ProfileAuditError('потеряны записи или инструменты профилей — адаптируй профили и повтори', `${lines.join('\n')}\n`)
  return `${lines.join('\n')}\n`
}

const entryPath = process.argv[1]
if (entryPath !== undefined && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(renderProfileAudit(process.argv.slice(2), ROOT))
  } catch (error) {
    if (error instanceof ProfileAuditError) process.stdout.write(error.report)
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`fork-profile-audit: ${message}\n`)
    process.exitCode = 1
  }
}
