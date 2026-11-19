import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { describe, expect, it } from 'vitest'
import * as MermaidRow from '../src/index.ts'
import { parseSkill } from '../src/skill.ts'

const ASSET = fileURLToPath(new URL('../assets/mermaid/SKILL.md', import.meta.url))

describe('mermaid authoring skill', () => {
  it('serves the packaged skill beside the renderer row', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      await ctx.plugin(MermaidRow)
      const catalog = await ctx.skills.list()
      expect(catalog.map(skill => skill.name)).toEqual(['mermaid'])
      const skill = (await ctx.skills.get('mermaid'))!
      expect(skill.description).toBe('Write inline Mermaid diagrams in answers and Markdown: choose the grammar by the relationship being shown, keep one idea per diagram, and stay inside this renderer\'s limits.')
      expect(skill.source).toBe('bundled')
      expect(skill.invocation).toEqual({ modelInvocable: true, userInvocable: true })
      // The body the model receives is the packaged instructions without frontmatter.
      expect(skill.content.startsWith('---')).toBe(false)
      expect(skill.content).toContain('## Choose the grammar by the relationship')
      expect(skill.content).toContain('`zenuml` is a separate renderer plugin that this bundle does not ship')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('ships the instruction file and drops the skill when the row is disposed', async () => {
    expect(existsSync(ASSET)).toBe(true)
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      const fiber = await ctx.plugin(MermaidRow)
      expect(await ctx.skills.list()).toHaveLength(1)
      await fiber.dispose()
      expect(await ctx.skills.list()).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects malformed packaged metadata instead of dropping the skill', () => {
    const page = '# Mermaid\n\nbody'
    expect(() => parseSkill(page, 'SKILL.md')).toThrow('has no YAML frontmatter')
    expect(() => parseSkill('---\njust a string\n---\n\nbody', 'SKILL.md')).toThrow('frontmatter is not a mapping')
    expect(() => parseSkill('---\nname: mermaid\n---\n\nbody', 'SKILL.md')).toThrow('declares no description')
    expect(() => parseSkill('---\ndescription: routing only\n---\n\nbody', 'SKILL.md')).toThrow('declares no skill name')
    expect(() => parseSkill('---\nname: Mermaid Diagrams\ndescription: routing\n---\n\nbody', 'SKILL.md')).toThrow('declares the invalid skill name Mermaid Diagrams')
    expect(() => parseSkill('---\nname: ""\ndescription: routing\n---\n\nbody', 'SKILL.md')).toThrow('declares no skill name')
    expect(parseSkill('---\nname: mermaid\ndescription: routing\n---\n\nbody', 'SKILL.md'))
      .toEqual({ name: 'mermaid', description: 'routing', content: 'body' })
  })
})
