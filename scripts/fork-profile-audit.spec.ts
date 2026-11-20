import { describe, expect, it } from 'vitest'

import {
  compareProfile,
  entryKey,
  isToolEntry,
  parseComposedEntries,
  parseSchemaErrors,
  snapshotProfile,
} from './fork-profile-audit.ts'

describe('parseComposedEntries', () => {
  it('reads flat and grouped entries with their static disable state', () => {
    const dump = [
      '# == @deepseek-ai/dsh-base',
      '- id: tool-fs',
      "  name: '@deepseek-ai/dsh-tool-fs'",
      '  config:',
      '    applyPatch: false',
      '- id: tool-bash',
      "  name: '@deepseek-ai/dsh-tool-bash'",
      '  disabled: true',
      '- id: planning',
      '  name: cordis:group',
      '  config:',
      '    - id: plan-mode',
      "      name: '@deepseek-ai/dsh-plan-mode'",
      '    - id: executor',
      "      name: '@deepseek-ai/dsh-tool-executor-ptc'",
      '      disabled: !!js "ctx.profile === \'minimal\'"',
    ].join('\n')

    const parsed = parseComposedEntries(dump).map(entry => ({
      section: entry.section, id: entry.id, name: entry.name, disabled: entry.disabled,
    }))
    expect(parsed).toEqual([
      { section: '@deepseek-ai/dsh-base', id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', disabled: null },
      { section: '@deepseek-ai/dsh-base', id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: 'true' },
      { section: '@deepseek-ai/dsh-base', id: 'planning', name: 'cordis:group', disabled: null },
      { section: '@deepseek-ai/dsh-base', id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode', disabled: null },
      { section: '@deepseek-ai/dsh-base', id: 'executor', name: '@deepseek-ai/dsh-tool-executor-ptc', disabled: "!!js \"ctx.profile === 'minimal'\"" },
    ])
  })

  it('keeps entries whose name line is unquoted or absent', () => {
    const dump = '- id: plain\n- id: named\n  name: @local/dsh-plugin'

    expect(parseComposedEntries(dump)).toEqual([
      { section: 'unlabeled', id: 'plain', name: '', disabled: null },
      { section: 'unlabeled', id: 'named', name: '@local/dsh-plugin', disabled: null },
    ])
  })
})

describe('isToolEntry', () => {
  it('classifies tool ids, tool packages, and tool provider rows', () => {
    const tool = (id: string, name: string) => isToolEntry({ section: 's', id, name, disabled: null })

    expect(tool('tool-fs', '@deepseek-ai/dsh-tool-fs')).toBe(true)
    expect(tool('fs', '@deepseek-ai/dsh-tool-fs')).toBe(true)
    expect(tool('plugin-manager', '@deepseek-ai/dsh-plugin-manager/tools')).toBe(true)
    expect(tool('planning', 'cordis:group')).toBe(false)
    expect(tool('fs', '@deepseek-ai/dsh-fs')).toBe(false)
  })
})

describe('snapshotProfile', () => {
  it('sorts keys, keeps only enabled tool entries, and dedupes schema errors', () => {
    const entries = parseComposedEntries([
      '- id: tool-bash',
      '  name: tool-bash',
      '- id: tool-fs',
      '  name: tool-fs',
      '  disabled: true',
      '- id: plan-mode',
      '  name: plan-mode',
    ].join('\n'))
    const snapshot = snapshotProfile(entries, ['b', 'a', 'a'])

    expect(snapshot).toEqual({
      entries: ['plan-mode|plan-mode', 'tool-bash|tool-bash', 'tool-fs|tool-fs [disabled]'],
      tools: ['tool-bash|tool-bash'],
      schemaErrors: ['a', 'b'],
    })
  })
})

describe('compareProfile', () => {
  const recorded = {
    entries: ['tool-fs|tool-fs', 'tool-bash|tool-bash', 'plan-mode|plan-mode'],
    tools: ['tool-fs|tool-fs', 'tool-bash|tool-bash'],
    schemaErrors: [],
  }

  it('reports lost entries, lost tools, gained entries, and new schema errors', () => {
    const current = {
      entries: ['tool-fs|tool-fs', 'plan-mode|plan-mode', 'new|new'],
      tools: ['tool-fs|tool-fs'],
      schemaErrors: ['dsh: error: invalid config: x'],
    }

    expect(compareProfile(recorded, current)).toEqual({
      missingEntries: ['tool-bash|tool-bash'],
      missingTools: ['tool-bash|tool-bash'],
      addedEntries: ['new|new'],
      newSchemaErrors: ['dsh: error: invalid config: x'],
    })
  })

  it('passes an unchanged composition', () => {
    expect(compareProfile(recorded, recorded)).toEqual({ missingEntries: [], missingTools: [], addedEntries: [], newSchemaErrors: [] })
  })

  it('treats a profile without a baseline as unchanged', () => {
    expect(compareProfile(undefined, recorded)).toEqual({ missingEntries: [], missingTools: [], addedEntries: [], newSchemaErrors: [] })
  })
})

describe('entryKey', () => {
  it('marks statically disabled entries and leaves conditional ones unmarked', () => {
    expect(entryKey({ section: 's', id: 'tool-fs', name: 'tool-fs', disabled: 'true' })).toBe('tool-fs|tool-fs [disabled]')
    expect(entryKey({ section: 's', id: 'tool-fs', name: 'tool-fs', disabled: '!!js "x"' })).toBe('tool-fs|tool-fs')
  })
})

describe('parseSchemaErrors', () => {
  it('keeps error lines, drops the composition index, and ignores warnings', () => {
    const stderr = [
      'dsh: error: [/204] invalid config: expected string',
      'dsh: warning: [/237] config/host: transform callback validation',
      'dsh: error: [/205] invalid config: unknown key',
    ].join('\n')

    expect(parseSchemaErrors(stderr)).toEqual([
      'dsh: error: invalid config: expected string',
      'dsh: error: invalid config: unknown key',
    ])
  })
})
