import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { AuditProblemsError, renderAudit } from './fork-upgrade-audit.ts'

const fixtureRoots: string[] = []
const originalPluginDirs = process.env['DSH_FORK_PLUGIN_DIRS']

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
  if (originalPluginDirs === undefined) delete process.env['DSH_FORK_PLUGIN_DIRS']
  else process.env['DSH_FORK_PLUGIN_DIRS'] = originalPluginDirs
})

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/** A repository with one commit and an empty hook directory. */
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-fork-audit-'))
  fixtureRoots.push(root)
  git(root, ['init', '--initial-branch=master'])
  git(root, ['config', 'user.email', 'fork-audit@example.com'])
  git(root, ['config', 'user.name', 'Fork Audit Tests'])
  git(root, ['config', 'commit.gpgsign', 'false'])
  git(root, ['config', 'core.hooksPath', join(root, '.git/hooks-disabled')])
  mkdirSync(join(root, 'home'), { recursive: true })
  mkdirSync(join(root, 'plugins'), { recursive: true })
  process.env['DSH_FORK_PLUGIN_DIRS'] = join(root, 'plugins')
  commit(root, { 'README.md': '# Fixture\n' }, 'base')
  return root
}

function commit(root: string, files: Record<string, string>, message: string): string {
  for (const [path, content] of Object.entries(files)) write(join(root, path), content)
  git(root, ['add', '--', ...Object.keys(files)])
  git(root, ['commit', '-m', message])
  return git(root, ['rev-parse', 'HEAD'])
}

function tag(root: string, name: string, revision = 'HEAD'): void {
  git(root, ['tag', name, revision])
}

function writeBase(root: string, tagName: string | null): void {
  write(join(root, 'packages/fork/upstream-base.json'), `${JSON.stringify({ tag: tagName, mergedAt: '2026-11-19' }, null, 2)}\n`)
}

function baseFile(root: string): string {
  return readFileSync(join(root, 'packages/fork/upstream-base.json'), 'utf8')
}

function home(root: string): string {
  return join(root, 'home')
}

function audit(root: string, ...args: string[]): string {
  return renderAudit(args, root, home(root))
}

/** The base the report names. */
function reportedBase(report: string): string {
  const match = /^база: (\S+)$/m.exec(report)
  if (match?.[1] === undefined) throw new Error(`report has no base line:\n${report}`)
  return match[1]
}

/** Whether git agrees the reported base is an ancestor of HEAD. */
function isAncestor(root: string, ancestor: string, descendant = 'HEAD'): boolean {
  try {
    execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', ancestor, descendant])
    return true
  } catch {
    return false
  }
}

/** A guide document with a heading and description. */
function guide(title: string): string {
  return `---\ndescription: "${title} description"\n---\n\n# ${title}\n`
}

describe('renderAudit base range', () => {
  it('measures from the merge base when the recorded tag is an older ancestor', () => {
    const root = repository()
    const tagged = git(root, ['rev-parse', 'HEAD'])
    tag(root, 'v-old')
    const base = commit(root, { 'fork.txt': 'fork\n' }, 'fork work')
    git(root, ['checkout', '-b', 'upstream'])
    commit(root, { 'upstream.txt': 'upstream\n' }, 'upstream work')
    git(root, ['checkout', 'master'])
    writeBase(root, 'v-old')

    const report = audit(root, '--target', 'upstream')

    expect(report).toContain(`база: ${base}`)
    expect(report).toContain(`записанный тег: v-old = ${tagged}`)
    expect(report).toContain('влит в HEAD: да')
    expect(report).toContain('1 коммит (мерджей 0)')
    expect(report).toContain('гайдов нет')
    expect(report).toContain('файлов пересечения нет')
    expect(isAncestor(root, reportedBase(report))).toBe(true)
  })

  it('measures from the tag when the tag is the merge base', () => {
    const root = repository()
    const base = git(root, ['rev-parse', 'HEAD'])
    tag(root, 'v-base')
    git(root, ['checkout', '-b', 'upstream'])
    commit(root, { 'upstream.txt': 'upstream\n' }, 'upstream work')
    git(root, ['checkout', 'master'])
    commit(root, { 'fork.txt': 'fork\n' }, 'fork work')
    writeBase(root, 'v-base')

    const report = audit(root, '--target', 'upstream')

    expect(report).toContain(`база: ${base}`)
    expect(report).toContain('влит в HEAD: да')
    expect(report).toContain('1 коммит (мерджей 0)')
    expect(isAncestor(root, reportedBase(report))).toBe(true)
  })

  it('names commits and guides hidden behind an unmerged release tag', () => {
    const root = repository()
    commit(root, { 'docs/upgrade-guide/v0.2.2-rc.4/fork/guide.md': guide('Fork guide') }, 'fork guide')
    const base = git(root, ['rev-parse', 'HEAD'])
    git(root, ['checkout', '-b', 'release'])
    const guidePath = 'docs/upgrade-guide/v0.2.2-rc.5/search/guide.md'
    commit(root, { [guidePath]: guide('Search provider') }, 'release guide')
    tag(root, 'v-new')
    git(root, ['checkout', 'master'])
    commit(root, { 'fork.txt': 'fork\n' }, 'fork work')
    writeBase(root, 'v-new')

    const report = audit(root, '--target', 'release')

    expect(report).toContain(`база: ${base}`)
    expect(report).toContain('влит в HEAD: нет')
    expect(report).toContain('за базой скрыто 1 коммит и 1 guide.md')
    expect(report).toContain(guidePath)
    expect(report).not.toContain('v0.2.2-rc.4/fork/guide.md')
    expect(report).toContain('гайдов 1 новый + 0 изменённых')
    expect(report).toContain('1 коммит (мерджей 0)')
    expect(isAncestor(root, reportedBase(report))).toBe(true)
  })

  it('lets --base override the recorded tag and the merge base', () => {
    const root = repository()
    const older = git(root, ['rev-parse', 'HEAD'])
    tag(root, 'v-old')
    const base = commit(root, { 'mid.txt': 'mid\n' }, 'between tag and base')
    git(root, ['checkout', '-b', 'release'])
    commit(root, { 'docs/upgrade-guide/v0.2.2-rc.5/a/guide.md': guide('A') }, 'guide one')
    commit(root, { 'docs/upgrade-guide/v0.2.2-rc.5/b/guide.md': guide('B') }, 'guide two')
    git(root, ['checkout', 'master'])
    commit(root, { 'fork.txt': 'fork\n' }, 'fork work')
    writeBase(root, 'v-old')

    const byMergeBase = audit(root, '--target', 'release')
    expect(byMergeBase).toContain(`база: ${base}`)
    expect(byMergeBase).toContain('2 коммита (мерджей 0)')
    expect(byMergeBase).toContain('записанный тег: v-old')

    const byExplicit = audit(root, '--target', 'release', '--base', older)
    expect(byExplicit).toContain(`база: ${older}`)
    expect(byExplicit).toContain('3 коммита (мерджей 0)')
    expect(byExplicit).toContain('гайдов 2 новых + 0 изменённых')
  })

  it('falls back to the merge base when the recorded tag is absent or unresolvable', () => {
    const root = repository()
    const base = git(root, ['rev-parse', 'HEAD'])
    git(root, ['checkout', '-b', 'upstream'])
    commit(root, { 'upstream.txt': 'upstream\n' }, 'upstream work')
    git(root, ['checkout', 'master'])
    commit(root, { 'fork.txt': 'fork\n' }, 'fork work')

    const missingFile = audit(root, '--target', 'upstream')
    expect(missingFile).toContain(`база: ${base}`)
    expect(missingFile).toContain('записанный тег: нет (packages/fork/upstream-base.json отсутствует)')

    writeBase(root, 'v-gone')
    const missingTag = audit(root, '--target', 'upstream')
    expect(missingTag).toContain(`база: ${base}`)
    expect(missingTag).toContain('не разрешается')
    expect(missingTag).toContain(`база: ${base}`)

    writeBase(root, null)
    const nullTag = audit(root, '--target', 'upstream')
    expect(nullTag).toContain('записанный тег: нет')

    expect(() => audit(root, '--target', 'upstream', '--base', 'no-such-revision')).toThrow(/ревизия .* не разрешается/)
  })

  it('reports a fully merged upstream and the delta behind a passed --base', () => {
    const root = repository()
    const preMerge = commit(root, { 'shared.txt': 'one\ntwo\nthree\n' }, 'shared file')
    git(root, ['checkout', '-b', 'upstream'])
    commit(root, { 'shared.txt': 'upstream\ntwo\nthree\n', 'upstream.txt': 'upstream\n' }, 'upstream one')
    commit(root, { 'docs/upgrade-guide/v0.2.2-rc.5/c/guide.md': guide('C') }, 'upstream guide')
    git(root, ['checkout', 'master'])
    commit(root, { 'shared.txt': 'one\ntwo\nfork\n', 'fork.txt': 'fork\n' }, 'fork work')
    git(root, ['merge', 'upstream', '--no-edit'])

    const merged = audit(root, '--target', 'upstream')
    expect(merged).toContain('апстрим влит полностью')
    expect(merged).toContain('0 коммитов (мерджей 0)')
    expect(merged).toContain('гайдов нет')
    expect(merged).toContain('файлов пересечения нет')

    const delta = audit(root, '--target', 'upstream', '--base', preMerge)
    expect(delta).toContain(`база: ${preMerge}`)
    expect(delta).toContain('2 коммита (мерджей 0)')
    expect(delta).toContain('гайдов 1 новый + 0 изменённых')
    expect(delta).toContain('файлов пересечения 1; апстрим изменил 3')
  })

  it('keeps the recorded base stable without --record-base and warns when the tag is outside HEAD', () => {
    const root = repository()
    const stable = `${JSON.stringify({ tag: 'v-kept', mergedAt: '2026-01-01' }, null, 2)}\n`
    write(join(root, 'packages/fork/upstream-base.json'), stable)
    git(root, ['checkout', '-b', 'upstream'])
    commit(root, { 'upstream.txt': 'upstream\n' }, 'upstream work')
    git(root, ['checkout', 'master'])
    commit(root, { 'fork.txt': 'fork\n' }, 'fork work')

    audit(root, '--target', 'upstream')
    expect(baseFile(root)).toBe(stable)

    git(root, ['checkout', '-b', 'release'])
    commit(root, { 'docs/upgrade-guide/v0.2.2-rc.5/d/guide.md': guide('D') }, 'release guide')
    tag(root, 'v-ahead')
    git(root, ['checkout', 'master'])

    const warning = audit(root, '--record-base', '--target', 'release')
    expect(warning).toContain('база записана — v-ahead')
    expect(warning).toContain('тег не влит в HEAD')
    const record = JSON.parse(baseFile(root)) as { tag: string | null; mergedAt: string }
    expect(record.tag).toBe('v-ahead')
    expect(record.mergedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(baseFile(root)).not.toMatch(/[0-9a-f]{40}/)
  })

  it('records a null tag when the target carries none', () => {
    const root = repository()
    git(root, ['checkout', '-b', 'upstream'])
    commit(root, { 'upstream.txt': 'upstream\n' }, 'upstream work')
    git(root, ['checkout', 'master'])
    commit(root, { 'fork.txt': 'fork\n' }, 'fork work')

    const recorded = audit(root, '--record-base', '--target', 'upstream')

    expect(recorded).toContain('тега нет')
    expect((JSON.parse(baseFile(root)) as { tag: string | null }).tag).toBeNull()
  })

  it('keeps the full report on a strict failure', () => {
    const root = repository()
    write(join(home(root), '.dsh/profiles/web/cordis.patch.yml'), '- id: demo\n  name: ./missing-plugin\n')
    git(root, ['checkout', '-b', 'upstream'])
    commit(root, { 'upstream.txt': 'upstream\n' }, 'upstream work')
    git(root, ['checkout', 'master'])
    commit(root, { 'fork.txt': 'fork\n' }, 'fork work')

    const report = audit(root, '--target', 'upstream')
    expect(report).toContain('проблем: 1')
    let caught: unknown
    try {
      audit(root, '--target', 'upstream', '--strict')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AuditProblemsError)
    expect((caught as AuditProblemsError).report).toContain('проблем: 1')
    expect((caught as AuditProblemsError).report).toContain('MISS')
  })

  it('rejects a --base that is not an ancestor of HEAD', () => {
    const root = repository()
    git(root, ['checkout', '-b', 'upstream'])
    commit(root, { 'upstream.txt': 'upstream\n' }, 'upstream work')
    const unrelated = git(root, ['rev-parse', 'HEAD'])
    git(root, ['checkout', 'master'])
    commit(root, { 'fork.txt': 'fork\n' }, 'fork work')

    expect(() => audit(root, '--target', 'upstream', '--base', unrelated)).toThrow(/не предок HEAD/)
  })

  it('always reports an ancestor of HEAD as the base', () => {
    const root = repository()
    tag(root, 'v-old')
    commit(root, { 'mid.txt': 'mid\n' }, 'mid')
    git(root, ['checkout', '-b', 'upstream'])
    commit(root, { 'docs/upgrade-guide/v0.2.2-rc.5/e/guide.md': guide('E') }, 'upstream guide')
    git(root, ['checkout', 'master'])
    commit(root, { 'fork.txt': 'fork\n' }, 'fork work')
    writeBase(root, 'v-old')

    for (const target of ['master', 'upstream', 'HEAD~1']) {
      const base = reportedBase(audit(root, '--target', target))
      expect(isAncestor(root, base), `base of ${target}`).toBe(true)
    }
  })

  it('counts added and modified guides over the merge-base range', () => {
    const root = repository()
    const oldGuide = 'docs/upgrade-guide/v0.2.2-rc.4/old/guide.md'
    commit(root, { [oldGuide]: guide('Old') }, 'old guide')
    git(root, ['checkout', '-b', 'release'])
    commit(root, { [oldGuide]: guide('Old updated'), 'docs/upgrade-guide/v0.2.2-rc.5/new/guide.md': guide('New') }, 'guides')
    git(root, ['checkout', 'master'])
    commit(root, { 'fork.txt': 'fork\n' }, 'fork work')

    const report = audit(root, '--target', 'release')

    expect(report).toContain('гайдов 1 новый + 1 изменённый')
    expect(report).toContain('новый: New')
    expect(report).toContain('изменён: Old updated')
  })
})
