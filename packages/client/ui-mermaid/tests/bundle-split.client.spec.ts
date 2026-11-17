import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = resolve(import.meta.dirname, '..')
const entryPath = join(packageRoot, 'lib/client.js')
const mermaidPath = join(packageRoot, 'lib/client.mermaid-entry.js')

// Minification drops the module-path comments, so the maps name the bundled inputs.
const sources = (path: string): string[] => (JSON.parse(readFileSync(`${path}.map`, 'utf8')) as { sources: string[] }).sources

describe('mermaid client artifacts', () => {
  it.skipIf(!existsSync(entryPath))('keeps mermaid behind the single lazy entry chunk', () => {
    expect(existsSync(mermaidPath)).toBe(true)
    const entry = readFileSync(entryPath, 'utf8')
    const mermaid = readFileSync(mermaidPath, 'utf8')
    expect([...entry.matchAll(/require\.async\((["'`])(\.\/client[^"'`/]*\.js)\1\)/gu)].map(match => match[2]))
      .toEqual(['./client.mermaid-entry.js'])
    expect(entry).not.toMatch(/\brequire\((["'`])\.\/client[^"'`/]*\.js\1\)/u)
    expect([...mermaid.matchAll(/require\((["'`])(\.\/client[^"'`/]*\.js)\1\)/gu)].map(match => match[2]))
      .toEqual([])
    expect(mermaid).not.toMatch(/require\.async\(/u)
    expect(sources(entryPath).some(source => source.includes('/mermaid@'))).toBe(false)
    expect(sources(mermaidPath).some(source => source.includes('/mermaid@'))).toBe(true)
    // One DOMPurify copy, inside the mermaid tree.
    expect(sources(entryPath).some(source => source.includes('/dompurify@'))).toBe(false)
    expect(sources(mermaidPath).filter(source => source.includes('/dompurify@')).length).toBeGreaterThan(0)
    expect(mermaid).toContain('Bundled Mermaid license notices')
  })
  it.skipIf(!existsSync(mermaidPath))('credits every bundled package root in the license banner', () => {
    const mermaid = readFileSync(mermaidPath, 'utf8')
    const bannerLines: string[] = []
    for (const line of mermaid.split('\n')) {
      if (!line.startsWith('//')) break
      bannerLines.push(line)
    }
    // Block headers are `// <package> <license file|README.md>`; license prose
    // lines never match the two-token file-name form.
    const credited = new Set(bannerLines
      .map(line => /^\/\/ ((?:@[\w.-]+\/)?[\w.-]+) ((?:license|licence|notice)(?:\.\w+)?|readme(?:\.md)?)$/iu.exec(line)?.[1])
      .filter((name): name is string => name !== undefined))
    const roots = new Set(sources(mermaidPath).flatMap((source) => {
      const matches = [...source.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)\//gu)]
      const last = matches.at(-1)?.[1]
      return last === undefined ? [] : [last]
    }))
    expect(roots.size).toBeGreaterThan(0)
    expect([...roots].filter(root => !credited.has(root))).toEqual([])
  })
})
