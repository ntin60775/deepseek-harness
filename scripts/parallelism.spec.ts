import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { setPriority } from 'node:os'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_PARALLELISM_CAP, LOCAL_RUN_PRIORITY, LOCAL_TEST_PARALLELISM_CAP, defaultParallelism, defaultTestParallelism, describeDefaultParallelism, lowerLocalPriority } from './parallelism.ts'

// The priority effect is a process-global boundary: mock setPriority to observe the resolved
// value (raising nice back needs privileges a spec worker does not have), keep the real
// availableParallelism for the budget cases, and prove the real lowering in a child process.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, setPriority: vi.fn() }
})

const mockedSetPriority = vi.mocked(setPriority)

beforeEach(() => {
  mockedSetPriority.mockClear()
})

describe('default worker budget', () => {
  it('uses every reported CPU in CI', () => {
    expect(defaultParallelism({ CI: 'true' }, 256)).toBe(256)
    expect(describeDefaultParallelism({ CI: 'true' }, 16)).toBe('16 available CPU(s)')
  })

  it('halves local gate workers under the cap', () => {
    expect(LOCAL_PARALLELISM_CAP).toBe(12)
    expect(defaultParallelism({}, 12)).toBe(6)
    expect(defaultParallelism({}, 3)).toBe(1)
    expect(defaultParallelism({}, 1)).toBe(1)
    expect(defaultParallelism({}, 256)).toBe(12)
    expect(defaultParallelism({ CI: 'false' }, 256)).toBe(12)
    // Co-updated with the halved gate budget: 4 CPUs now yield 2 workers, not 4.
    expect(defaultParallelism({}, 4)).toBe(2)
    expect(describeDefaultParallelism({}, 256)).toBe('12 local default worker(s) of 256 CPU(s)')
  })

  it('halves local Vitest forks under the memory cap', () => {
    expect(LOCAL_TEST_PARALLELISM_CAP).toBe(48)
    expect(defaultTestParallelism({}, 12)).toBe(6)
    expect(defaultTestParallelism({}, 1)).toBe(1)
    expect(defaultTestParallelism({}, 3)).toBe(1)
    expect(defaultTestParallelism({}, 256)).toBe(48)
    expect(defaultTestParallelism({ CI: 'true' }, 256)).toBe(256)
  })
})

describe('local run priority', () => {
  it('lowers to nice 19 by default outside CI', () => {
    lowerLocalPriority({})
    expect(mockedSetPriority).toHaveBeenCalledWith(0, LOCAL_RUN_PRIORITY)
    expect(LOCAL_RUN_PRIORITY).toBe(19)
  })

  it('honors DSH_LOCAL_PRIORITY including the normal-priority opt-out', () => {
    lowerLocalPriority({ DSH_LOCAL_PRIORITY: '0' })
    expect(mockedSetPriority).toHaveBeenCalledWith(0, 0)
    mockedSetPriority.mockClear()
    lowerLocalPriority({ DSH_LOCAL_PRIORITY: '7' })
    expect(mockedSetPriority).toHaveBeenCalledWith(0, 7)
  })

  it('refuses invalid DSH_LOCAL_PRIORITY values before any priority change', () => {
    for (const raw of ['abc', '20', '-1', '1.5', '']) {
      mockedSetPriority.mockClear()
      if (raw === '') {
        lowerLocalPriority({ DSH_LOCAL_PRIORITY: raw })
        expect(mockedSetPriority).toHaveBeenCalledWith(0, LOCAL_RUN_PRIORITY)
        continue
      }
      expect(() => lowerLocalPriority({ DSH_LOCAL_PRIORITY: raw })).toThrow('DSH_LOCAL_PRIORITY must be an integer 0-19')
      expect(mockedSetPriority).not.toHaveBeenCalled()
    }
  })

  it('leaves CI priority untouched', () => {
    lowerLocalPriority({ CI: 'true' })
    lowerLocalPriority({ CI: 'true', DSH_LOCAL_PRIORITY: 'abc' })
    expect(mockedSetPriority).not.toHaveBeenCalled()
  })

  it('lowers a real child process to nice 19', { timeout: 60_000 }, () => {
    const tsxEsm = createRequire(import.meta.url).resolve('tsx/esm')
    const root = resolve(import.meta.dirname, '..')
    const probe = spawnSync(process.execPath, [
      '--import', tsxEsm, '--input-type=module', '-e',
      "const { lowerLocalPriority } = await import('./scripts/parallelism.ts'); const { getPriority } = await import('node:os'); lowerLocalPriority(process.env); console.log(getPriority())",
    ], { cwd: root, env: { ...process.env, CI: '', DSH_LOCAL_PRIORITY: '' }, encoding: 'utf8', timeout: 30_000 })
    expect(probe.status).toBe(0)
    expect(Number(probe.stdout.trim().split('\n').at(-1))).toBe(19)
  })
})
