import { describe, expect, it } from 'vitest'
import { timingTotals, zoomProgressAt } from './timing'

describe('timingTotals', () => {
  it('sums hold-start, zoom duration and hold-end', () => {
    const totals = timingTotals({ holdStartSec: 1, zoomDurationSec: 4, holdEndSec: 2 })
    expect(totals).toEqual({ holdStartSec: 1, zoomDurationSec: 4, holdEndSec: 2, totalSec: 7 })
  })

  it('clamps negative holds to 0 and duration to a 0.5s minimum', () => {
    const totals = timingTotals({ holdStartSec: -5, zoomDurationSec: 0.1, holdEndSec: -1 })
    expect(totals).toEqual({ holdStartSec: 0, zoomDurationSec: 0.5, holdEndSec: 0, totalSec: 0.5 })
  })
})

describe('zoomProgressAt', () => {
  const timing = { holdStartSec: 1, zoomDurationSec: 4, holdEndSec: 2 }

  it('is 0 during the start hold', () => {
    expect(zoomProgressAt(0, timing)).toBe(0)
    expect(zoomProgressAt(1, timing)).toBe(0)
  })

  it('progresses linearly through the zoom phase', () => {
    expect(zoomProgressAt(3, timing)).toBeCloseTo(0.5, 9)
  })

  it('clamps to 1 once the zoom phase (and end hold) has passed', () => {
    expect(zoomProgressAt(5, timing)).toBe(1)
    expect(zoomProgressAt(7, timing)).toBe(1)
  })
})
