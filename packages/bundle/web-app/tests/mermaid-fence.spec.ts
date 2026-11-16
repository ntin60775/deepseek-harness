/** The Web bundle's mermaid row resolves to a real web-platform Client package. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { expect, it } from 'vitest'

const bundleDir = fileURLToPath(new URL('..', import.meta.url))
const repositoryRoot = join(bundleDir, '../../..')

it('ships the disabled ui-mermaid row backed by an installed web Client package', () => {
  const rows = loadOverlayPatches('mermaid composition', join(bundleDir, 'cordis.patch.yml'))
    .flatMap(patch => patch.insert ?? [])
    .filter(row => row.id === 'ui-mermaid')
  expect(rows).toHaveLength(1)
  const row = rows[0]!
  expect(row.name).toBe('@deepseek-ai/dsh-client-ui-mermaid')
  expect(row.disabled).toBe(true)

  const manifestPath = join(repositoryRoot, 'packages/client/ui-mermaid/package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name: string
    exports: Record<string, unknown>
    dsh: { client: { platform: string } }
  }
  expect(manifest.name).toBe(row.name)
  expect(manifest.dsh.client.platform).toBe('web')
  expect(manifest.exports['./client']).toBeDefined()

  const bundleManifest = JSON.parse(readFileSync(join(bundleDir, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
  }
  expect(bundleManifest.dependencies[row.name]).toBe('workspace:*')
})
