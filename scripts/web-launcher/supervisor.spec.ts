/** The launcher's supervisor must keep its own processes and temporary files off the shared runtime. */
import { execa } from 'execa'
import { expect, it } from 'vitest'

it.skipIf(process.platform === 'win32')('restarts a crashed server and stops on a signal', async ({ signal }) => {
  const result = await execa('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'scripts/web-launcher', '-p', 'test_supervisor.py'], {
    cancelSignal: signal, killDescendants: true, reject: false,
  })
  expect(result.isCanceled).toBe(false)
  expect(result.signal).toBeUndefined()
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stderr).toMatch(/Ran [1-9]\d* tests?\b/)
})
