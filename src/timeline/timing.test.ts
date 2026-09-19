import { describe, expect, it } from 'vitest'
import { resolveHoldSec } from './timing'

describe('resolveHoldSec', () => {
  it('returns the explicit holdSec when set', () => {
    expect(resolveHoldSec({ startSec: 1, fadeInSec: 0.5, holdSec: 3 }, { totalSec: 100 })).toBe(3)
  })

  it('clamps a negative explicit holdSec to 0', () => {
    expect(resolveHoldSec({ startSec: 1, fadeInSec: 0.5, holdSec: -3 }, { totalSec: 100 })).toBe(0)
  })

  it('resolves to "until the project ends" when holdSec is undefined', () => {
    expect(resolveHoldSec({ startSec: 1, fadeInSec: 0.5, holdSec: undefined }, { totalSec: 10 })).toBeCloseTo(8.5, 9)
  })

  it('never goes negative even if start+fadeIn already exceeds the project length', () => {
    expect(resolveHoldSec({ startSec: 9, fadeInSec: 5, holdSec: undefined }, { totalSec: 10 })).toBe(0)
  })
})
