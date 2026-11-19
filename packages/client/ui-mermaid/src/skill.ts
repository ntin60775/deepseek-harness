/** Packaged mermaid authoring skill: frontmatter parsing for the provider in `index.ts`. */

import { isSkillName } from '@deepseek-ai/dsh-skill'
import { parse as parseYaml } from 'yaml'

/** One packaged skill after its frontmatter and body are separated. */
export interface PackagedSkill {
  /** Kebab-case skill name declared by the frontmatter. */
  readonly name: string
  /** Routing description shown in the model catalog. */
  readonly description: string
  /** Markdown instruction body without the frontmatter block. */
  readonly content: string
}

/** Frontmatter block at the start of a packaged `SKILL.md`. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u

/**
 * Parse a packaged `SKILL.md` into its declared name, description, and body.
 * The file ships inside the package, so a missing or malformed metadata field is a
 * broken build rather than a runtime condition and fails loud at load.
 * @param raw - file contents.
 * @param path - path reported in the failure.
 * @returns the parsed skill.
 * @throws Error when the frontmatter, its name, or its description is missing or malformed, or when the name is not kebab-case.
 */
export function parseSkill(raw: string, path: string): PackagedSkill {
  const frontmatter = FRONTMATTER.exec(raw)
  if (frontmatter?.[1] === undefined) throw new Error(`ui-mermaid: ${path} has no YAML frontmatter`)
  const metadata: unknown = parseYaml(frontmatter[1])
  if (typeof metadata !== 'object' || metadata === null) throw new Error(`ui-mermaid: ${path} frontmatter is not a mapping`)
  const { name, description } = metadata as { name?: unknown; description?: unknown }
  if (typeof name !== 'string' || name.length === 0) throw new Error(`ui-mermaid: ${path} declares no skill name`)
  if (!isSkillName(name)) throw new Error(`ui-mermaid: ${path} declares the invalid skill name ${name}`)
  if (typeof description !== 'string' || description.length === 0) throw new Error(`ui-mermaid: ${path} declares no description`)
  return { name, description, content: raw.slice(frontmatter[0].length).trim() }
}
