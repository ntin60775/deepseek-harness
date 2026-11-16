// @vitest-environment jsdom
/** Config minFitScale: default 0.85, exclusive zero floor, inclusive one ceiling, fails loud at load. */
import { describe, expect, it } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { Config } from '../src/client/index.ts'

describe('ui-mermaid Config', () => {
  it('defaults minFitScale to 0.85', () => {
    expect(Config({})).toEqual({ minFitScale: 0.85 })
    expect(Config()).toEqual({ minFitScale: 0.85 })
  })

  it('accepts values inside (0, 1] including both boundaries of the ceiling', () => {
    expect(Config({ minFitScale: 0.5 })).toEqual({ minFitScale: 0.5 })
    expect(Config({ minFitScale: 0.01 })).toEqual({ minFitScale: 0.01 })
    expect(Config({ minFitScale: 1 })).toEqual({ minFitScale: 1 })
  })

  it('rejects zero at load with a validation error', () => {
    expect(() => Config({ minFitScale: 0 })).toThrow(z.ValidationError)
    expect(() => Config({ minFitScale: 0 })).toThrow(/minFitScale > 0/u)
  })

  it('rejects values above one at load', () => {
    expect(() => Config({ minFitScale: 1.01 })).toThrow(z.ValidationError)
    expect(() => Config({ minFitScale: 2 })).toThrow(z.ValidationError)
  })

  it('rejects negative values and non-numbers at load', () => {
    expect(() => Config({ minFitScale: -0.1 })).toThrow(z.ValidationError)
    expect(() => Config(JSON.parse('{"minFitScale":"0.8"}') as { minFitScale?: number })).toThrow(z.ValidationError)
  })
})
