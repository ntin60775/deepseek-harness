import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Rolldown, type UserConfig } from 'tsdown'
import { installedDependencyRoots, packageRootOfResolved } from '../../../scripts/installed-dependency-closure.ts'
import { clientBundle } from '../tsdown.client.ts'

const require = createRequire(import.meta.url)
const mermaidEntryMarker = '?dsh-mermaid-bundle'

/**
 * License blocks of one package root: every dedicated license file, else the
 * README's license section (fastdom ships its MIT text there). A root with
 * neither fails loud instead of distributing undisclosed code.
 */
function licenseBlocks(root: string): string[] {
  const name = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name: string }).name
  const files = readdirSync(root).filter(file => /^(license|licence|notice)(\.|$)/iu.test(file)).sort()
  if (files.length > 0) {
    return files.map(file => `${name} ${file}\n\n${readFileSync(join(root, file), 'utf8').trimEnd()}`)
  }
  const readme = readdirSync(root).find(file => /^readme(\.md)?$/iu.test(file))
  if (readme !== undefined) {
    const lines = readFileSync(join(root, readme), 'utf8').split('\n')
    const start = lines.findIndex(line => /^#{1,6}\s+license\b/iu.test(line))
    if (start >= 0) {
      const end = lines.findIndex((line, index) => index > start && /^#{1,6}\s/u.test(line))
      const body = lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trimEnd()
      if (body.length > 0) return [`${name} ${readme}\n\n${body}`]
    }
  }
  throw new Error(`mermaid license banner: no license text found for ${name} at ${root}`)
}

/**
 * License files of every private copy inside the mermaid tree: the installed
 * dependency closure of mermaid, which is exactly the set the nested bundle
 * embeds (type-only packages are erased and excluded by the walk). DOMPurify
 * arrives transitively through mermaid, so the tree carries one copy.
 */
function mermaidLicenseBanner(): string {
  const mermaidRoot = packageRootOfResolved(require.resolve('mermaid'))
  const blocks = [...new Set(installedDependencyRoots(mermaidRoot).flatMap(licenseBlocks))]
  return ['//! Bundled Mermaid license notices', ...blocks.join('\n\n').split('\n').map(line => `// ${line}`)].join('\n')
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
