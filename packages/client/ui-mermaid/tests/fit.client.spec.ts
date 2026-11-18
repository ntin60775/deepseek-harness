// @vitest-environment jsdom
/** Boundary specs of the pure fit rule: 0.84 / 0.85 / 0.86 and the equality case. */
import { describe, expect, it } from 'vitest'
import { resolveDiagramFit } from '../src/client/fit.ts'

/** Independent literal box: W=1000 makes the scale fractions exact decimals. */
const box = { width: 1000, height: 100 }
const config = { minFitScale: 0.85 }

describe('resolveDiagramFit boundaries', () => {
  it('keeps natural size with explicit W×H below the floor (fit 0.84)', () => {
    expect(resolveDiagramFit(box, 840, config)).toEqual({ mode: 'natural', scale: 1, width: 1000, height: 100 })
  })

  it('fits the column at equality with the floor (fit 0.85)', () => {
    expect(resolveDiagramFit(box, 850, config)).toEqual({ mode: 'fit', scale: 0.85 })
  })

  it('fits the column above the floor (fit 0.86)', () => {
    expect(resolveDiagramFit(box, 860, config)).toEqual({ mode: 'fit', scale: 0.86 })
  })

  it('caps the scale at 1 when the column is wider than the diagram', () => {
    expect(resolveDiagramFit(box, 2000, config)).toEqual({ mode: 'fit', scale: 1 })
  })

  it('keeps natural size at zero measured width', () => {
    expect(resolveDiagramFit(box, 0, config)).toEqual({ mode: 'natural', scale: 1, width: 1000, height: 100 })
  })

  it('applies a configured floor instead of the default', () => {
    const half = { minFitScale: 0.5 }
    expect(resolveDiagramFit(box, 490, half)).toEqual({ mode: 'natural', scale: 1, width: 1000, height: 100 })
    expect(resolveDiagramFit(box, 500, half)).toEqual({ mode: 'fit', scale: 0.5 })
    expect(resolveDiagramFit(box, 510, half)).toEqual({ mode: 'fit', scale: 0.51 })
  })

  it('returns the viewBox W×H unchanged as the natural size', () => {
    const recorded = { width: 1432.15625, height: 63 }
    expect(resolveDiagramFit(recorded, 1000, config)).toEqual({ mode: 'natural', scale: 1, width: 1432.15625, height: 63 })
  })
})
