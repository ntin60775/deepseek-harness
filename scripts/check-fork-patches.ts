/**
 * Fork-patch registry: asserts the fork-local surfaces still exist after an
 * upstream merge. Each row names a file and a marker comment the patch carries;
 * a missing marker means the merge restored the upstream component, or the
 * patch moved and the table needs the same edit.
 */
import { readFile } from 'node:fs/promises'

interface ForkPatch {
  id: string
  file: string
  marker: string
}

const PATCHES: readonly ForkPatch[] = [
  {
    id: 'composer-model-picker',
    file: 'packages/client/ui-model-selection/src/client/ModelSelect.tsx',
    marker: 'fork-patch: composer-model-picker',
  },
  {
    id: 'composer-model-picker',
    file: 'packages/client/ui-model-selection/src/client/index.ts',
    marker: 'fork-patch: composer-model-picker',
  },
  {
    id: 'composer-model-picker',
    file: 'packages/client/ui-model-selection/src/client/slots.ts',
    marker: 'fork-patch: composer-model-picker',
  },
  {
    id: 'composer-model-picker',
    file: 'packages/client/ui-primitives/src/Modal.tsx',
    marker: 'fork-patch: composer-model-picker',
  },
  {
    id: 'web-alt-shortcuts',
    file: 'packages/client/shortcuts/src/binding.ts',
    marker: 'fork-patch: web-alt-shortcuts',
  },
  {
    id: 'web-alt-shortcuts',
    file: 'packages/client/shortcuts/tests/configuration.client.spec.ts',
    marker: 'fork-patch: web-alt-shortcuts',
  },
]

const missing: string[] = []
for (const patch of PATCHES) {
  const text = await readFile(patch.file, 'utf8').catch(() => '')
  if (!text.includes(patch.marker)) missing.push(`${patch.id}: ${patch.file}`)
}

if (missing.length > 0) {
  console.error('fork-patch-check: markers missing (upstream merge dropped a fork surface):')
  for (const row of missing) console.error(`  ${row}`)
  process.exit(1)
}
console.log(`fork-patch-check: ${String(PATCHES.length)} marker(s) present across ${String(new Set(PATCHES.map(p => p.file)).size)} file(s)`)
