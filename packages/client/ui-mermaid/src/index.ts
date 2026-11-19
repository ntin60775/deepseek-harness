/** Host companion for the Mermaid fence Client plugin, which also serves its authoring skill. */

import { readFileSync } from 'node:fs'
import { sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { BUNDLED_SKILL_RANK, type SkillCandidate } from '@deepseek-ai/dsh-skill'
import { parseSkill } from './skill.ts'

/** Directory holding the packaged authoring skill; it also carries any resources the body references. */
const SKILL_DIR = fileURLToPath(new URL('../assets/mermaid/', import.meta.url))
/** Instruction file read once at load; a malformed file fails the plugin instead of dropping the skill. */
const SKILL_FILE = fileURLToPath(new URL('../assets/mermaid/SKILL.md', import.meta.url))
/** Registry name of the provider, distinct from the skill name it serves. */
const PROVIDER = 'dsh-mermaid'

/** Cordis plugin identity. */
export const name = 'ui-mermaid'
/** The skill registry the provider registers into. */
export const inject: string[] = ['skills']

/**
 * Serve the packaged mermaid authoring skill through `ctx.skills`, so the row that
 * renders diagram cards also teaches the model to write them. The bundled rank keeps
 * a project or user skill with the same name in front of this one.
 * @param ctx - Context carrying the skill registry.
 * @throws Error when the packaged `SKILL.md` is missing, has no frontmatter, or declares no name or description.
 */
export function apply(ctx: Context): void {
  const skill = parseSkill(readFileSync(SKILL_FILE, 'utf8'), SKILL_FILE)
  const candidate: SkillCandidate = {
    name: skill.name,
    description: skill.description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: PROVIDER,
    source: 'bundled',
    rank: BUNDLED_SKILL_RANK,
    resourceBase: { kind: 'directory', path: SKILL_DIR.split(sep).join('/') },
    locator: SKILL_FILE,
  }
  const { rank: _rank, locator: _locator, ...summary } = candidate
  ctx.skills.registerProvider(() => ({
    name: PROVIDER,
    list: async () => [candidate],
    get: async () => ({ ...summary, content: skill.content }),
  }))
}
