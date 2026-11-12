import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditDocBudgets, countWords, findRegion } from './verify-doc-budgets.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const BODY = 'one two three four five six seven eight nine ten eleven twelve'
const REGION = ['<!-- BEGIN overlay -->', 'alpha beta gamma delta epsilon zeta', '<!-- END overlay -->'].join('\n')
const WITH_REGION = `${BODY}\n\n${REGION}\n`
const WITHOUT_REGION = `${BODY}\n`

/** `wc -w` over the fixtures, stated independently of the gate's arithmetic. */
const BODY_WORDS = 12
const REGION_WORDS = 14
const FULL_FILE_WORDS = 26

function fixtureRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-doc-budgets-'))
  roots.push(root)
  for (const [file, source] of Object.entries(files)) writeFileSync(join(root, file), source, 'utf8')
  return root
}

describe('doc budgets gate', () => {
  it('budgets a whole-file entry outside every region the manifest names for that file', () => {
    const root = fixtureRoot({ 'doc.md': WITH_REGION })
    const audit = auditDocBudgets(root, { 'doc.md': BODY_WORDS, 'doc.md#overlay': REGION_WORDS })
    expect(audit.failures).toEqual([])
    expect(audit.rows).toEqual([
      `ok      ${String(BODY_WORDS).padStart(4)} / ${String(BODY_WORDS).padEnd(6)} doc.md`,
      `ok      ${String(REGION_WORDS).padStart(4)} / ${String(REGION_WORDS).padEnd(6)} doc.md#overlay`,
    ])
    expect(countWords(BODY)).toBe(BODY_WORDS)
    expect(countWords(findRegion(WITH_REGION, 'overlay') ?? '')).toBe(REGION_WORDS)
  })

  it('rejects a whole-file entry whose own text exceeds its ceiling', () => {
    const root = fixtureRoot({ 'doc.md': WITH_REGION })
    const audit = auditDocBudgets(root, { 'doc.md': 11, 'doc.md#overlay': REGION_WORDS })
    expect(audit.rows[0]).toContain('OVER')
    expect(audit.failures).toEqual([
      'doc.md: 12 words exceeds the 11-word ceiling — relocate or condense per docs/AGENTS.md (raising the ceiling requires justification in the PR)',
    ])
  })

  it('rejects an over-ceiling region without moving the whole-file count', () => {
    const root = fixtureRoot({ 'doc.md': WITH_REGION })
    const audit = auditDocBudgets(root, { 'doc.md': BODY_WORDS, 'doc.md#overlay': REGION_WORDS - 1 })
    expect(audit.rows[0]).toContain('ok')
    expect(audit.rows[1]).toContain('OVER')
    expect(audit.failures).toEqual([
      `doc.md#overlay: ${REGION_WORDS} words exceeds the ${REGION_WORDS - 1}-word ceiling — relocate or condense per docs/AGENTS.md (raising the ceiling requires justification in the PR)`,
    ])
  })

  it('budgets the whole file when the manifest names no region', () => {
    const root = fixtureRoot({ 'doc.md': WITH_REGION })
    const audit = auditDocBudgets(root, { 'doc.md': FULL_FILE_WORDS })
    expect(audit.failures).toEqual([])
    expect(audit.rows[0]).toContain(String(FULL_FILE_WORDS))
  })

  it('fails a region key whose markers are missing or unclosed instead of counting the file', () => {
    const noMarkers = fixtureRoot({ 'doc.md': WITHOUT_REGION })
    const unclosed = fixtureRoot({ 'doc.md': `${BODY}\n\n<!-- BEGIN overlay -->\nalpha\n` })
    expect(auditDocBudgets(noMarkers, { 'doc.md#overlay': 10 }).failures).toEqual([
      'doc.md#overlay: no `<!-- BEGIN overlay -->`…`<!-- END overlay -->` region in doc.md — restore the markers or drop the key from scripts/doc-budgets.manifest.json',
    ])
    expect(auditDocBudgets(unclosed, { 'doc.md#overlay': 10 }).failures).toHaveLength(1)
  })

  it('keeps reporting a missing budgeted file and an invalid ceiling or key', () => {
    const root = fixtureRoot({ 'doc.md': WITH_REGION })
    const audit = auditDocBudgets(root, {
      'gone.md': 100,
      'doc.md': 0,
      'doc.md##': 100,
    })
    expect(audit.failures).toEqual([
      'gone.md: budgeted file does not exist (renamed or deleted? update scripts/doc-budgets.manifest.json in the same change)',
      'doc.md: ceiling must be a positive integer, got 0',
      'doc.md##: expected a file path or a "<path>#<region-token>" key',
    ])
    expect(audit.rows.map(row => row.slice(0, 4))).toEqual(['MISS', 'BAD ', 'BAD '])
  })
})
