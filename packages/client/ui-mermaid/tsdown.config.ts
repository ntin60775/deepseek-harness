import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'
import { Rolldown, type UserConfig } from 'tsdown'
import { clientBundle } from '../tsdown.client.ts'

const require = createRequire(import.meta.url)
const mermaidEntryMarker = '?dsh-mermaid-bundle'

/**
 * Package root of a resolved dependency entry: the last `node_modules/<name>`
 * segment of its physical path. Packages without a `./package.json` export
 * (DOMPurify) resolve through their main entry instead.
 */
function dependencyRoot(requireFn: NodeJS.Require, name: string): string {
  const resolved = requireFn.resolve(name)
  const matches = [...resolved.matchAll(/node_modules\/(@[^/]+\/[^/]+|[^/]+)\//gu)]
  const last = matches.at(-1)
  if (last === undefined) throw new Error(`cannot locate package root of ${name} in ${resolved}`)
  return resolved.slice(0, last.index! + last[0].length - 1)
}

/**
 * License files of every private copy inside the mermaid tree. DOMPurify
 * arrives transitively through mermaid, so the tree carries one copy.
 */
function mermaidLicenseBanner(): string {
  const mermaidRoot = dependencyRoot(require, 'mermaid')
  const mermaidRequire = createRequire(join(mermaidRoot, 'package.json'))
  const roots = [mermaidRoot, ...['dompurify', 'd3', 'cytoscape', 'katex', 'marked', 'roughjs']
    .map(name => dependencyRoot(mermaidRequire, name))]
  const notices = roots.flatMap(root => readdirSync(root)
    .filter(name => /^(LICENSE|LICENCE|NOTICE)(\.|$)/u.test(name)).sort()
    .map(name => `${basename(root)} ${name}\n\n${readFileSync(join(root, name), 'utf8').trimEnd()}`))
  return ['//! Bundled Mermaid license notices', ...notices.join('\n\n').split('\n').map(line => `// ${line}`)].join('\n')
}

const bundle = clientBundle(import.meta.dirname, ['lib/types/index.js'], {
  clientBanner: fileName => fileName.startsWith('client.mermaid-entry') ? mermaidLicenseBanner() : undefined,
})

/**
 * Mermaid's published ESM entries all carry an internal dynamic-import chunk
 * graph the client runtime cannot resolve. Bundle the package's mermaid entry
 * into one self-contained module text; the outer build keeps it behind the
 * controller's `import()` as the single lazy `client.mermaid-entry.js` chunk.
 */
const mermaidEntry: NonNullable<UserConfig['plugins']> = [{
  name: 'dsh-mermaid-entry-source',
  resolveId(source, importer) {
    // The preset bundles the compiled lib/types face, where the controller's
    // dynamic import carries the .js extension; source-plane runs carry .ts.
    if (source !== './mermaid-entry.ts' && source !== './mermaid-entry.js') return null
    if (importer?.startsWith(import.meta.dirname) !== true) return null
    return join(import.meta.dirname, 'src/client/mermaid-entry.ts') + mermaidEntryMarker
  },
  async load(id) {
    if (!id.endsWith(mermaidEntryMarker)) return null
    const entryPath = id.slice(0, -mermaidEntryMarker.length)
    const parent = this
    const worker = await Rolldown.rolldown({
      input: entryPath, platform: 'browser',
      resolve: { mainFields: ['browser', 'module', 'main'], aliasFields: [['browser']] },
      transform: { define: { 'process.env.NODE_ENV': JSON.stringify('production') } },
      plugins: [{
        name: 'dsh-mermaid-entry-dependencies',
        async resolveId(source, importer) {
          // The outer build's license analysis must also see imports embedded in the entry text.
          if (importer?.startsWith(join(import.meta.dirname, 'src')) && !source.startsWith('.')) await parent.resolve(source, importer)
          return null
        },
      }],
    })
    try {
      const result = await worker.generate({ format: 'esm', codeSplitting: false, minify: true, sourcemap: true })
      const chunk = result.output[0]
      if (chunk?.type !== 'chunk') throw new Error('Mermaid entry did not emit a JavaScript chunk')
      for (const path of Object.keys(chunk.modules)) this.addWatchFile(path)
      return { code: chunk.code, map: chunk.map }
    } finally { await worker.close() }
  },
}]

export default (options: Parameters<typeof bundle>[0]): UserConfig[] => bundle(options).map(config =>
  config.name?.endsWith('/client') === true ? {
    ...config,
    inputOptions: {
      ...config.inputOptions,
      resolve: { ...config.inputOptions?.resolve, mainFields: ['browser', 'module', 'main'], aliasFields: [['browser']] },
    },
    plugins: [config.plugins, mermaidEntry],
  } : config,
)
