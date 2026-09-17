import { describe, expect, it } from 'vitest'
import { markerStateAt } from './markerAnimation'
import { easeOutBack } from '../timeline/ease'
import type { MarkerObject } from '../state/types'
import type { TimingTotals } from '../timeline/timing'

const timing: TimingTotals = { holdStartSec: 1, zoomDurationSec: 4, holdEndSec: 2, totalSec: 7 }

function marker(overrides: Partial<MarkerObject> = {}): MarkerObject {
  return {
    id: 'm1',
    lng: 0,
    lat: 0,
    color: '#fff',
    sizePx: 10,
    pulse: { enabled: true, periodSec: 2, scale: 2, strength: 0.5 },
    appear: { mode: 'custom', atSec: 1, popDurationSec: 0.5 },
    visible: true,
    ...overrides,
  }
}

describe('markerStateAt', () => {
  it('is fully hidden when the marker itself is not visible', () => {
    const state = markerStateAt(marker({ visible: false }), timing, 0)
    expect(state).toEqual({ visible: false, radius: 0, opacity: 0, haloRadius: 0, haloOpacity: 0 })
  })

  it('shows a static full-strength halo for the null (editor) preview', () => {
    const state = markerStateAt(marker(), timing, null)
    expect(state.visible).toBe(true)
    expect(state.radius).toBe(10)
    expect(state.opacity).toBe(1)
    expect(state.haloRadius).toBeCloseTo(10 * 1.6, 9) // size * (1 + (scale-1)*0.6)
    expect(state.haloOpacity).toBeCloseTo(0.25, 9) // strength * 0.5
  })

  it('is invisible-but-present before the appear time', () => {
    const state = markerStateAt(marker(), timing, 0.5)
    expect(state).toEqual({ visible: true, radius: 0, opacity: 0, haloRadius: 0, haloOpacity: 0 })
  })

  it('follows the easeOutBack pop-in curve during the pop duration', () => {
    // appearAt=1, popDurationSec=0.5 → k=0.5 at sec=1.25
    const state = markerStateAt(marker(), timing, 1.25)
    expect(state.radius).toBeCloseTo(10 * easeOutBack(0.5), 9)
    expect(state.opacity).toBe(1) // opacity ramps to 1 twice as fast as k
  })

  it('starts the pulse halo exactly at full size once pop-in completes', () => {
    // sec = appearAt + pop → k=1, pulse phase=0
    const state = markerStateAt(marker(), timing, 1.5)
    expect(state.radius).toBeCloseTo(10, 9)
    expect(state.haloRadius).toBeCloseTo(10, 9)
    expect(state.haloOpacity).toBeCloseTo(0.5, 9)
  })

  it('sweeps the halo outward and fades it over one pulse period', () => {
    // half a period after pop-in completes → phase=0.5
    const state = markerStateAt(marker(), timing, 1.5 + 1)
    expect(state.haloRadius).toBeCloseTo(18.75, 9) // size + (size*scale - size) * (1 - 0.5^3)
    expect(state.haloOpacity).toBeCloseTo(0.25, 9) // strength * (1 - 0.5)
  })

  it('does not pulse when pulse is disabled', () => {
    const state = markerStateAt(marker({ pulse: { enabled: false, periodSec: 2, scale: 2, strength: 0.5 } }), timing, 5)
    expect(state.haloRadius).toBe(0)
    expect(state.haloOpacity).toBe(0)
  })

  it.each([
    ['start', 0],
    ['zoomStart', timing.holdStartSec],
    ['zoomEnd', timing.holdStartSec + timing.zoomDurationSec],
  ] as const)('resolves appear mode %s to the right appear time', (mode, expectedAppearAt) => {
    const m = marker({ appear: { mode, popDurationSec: 0.5 } })
    expect(markerStateAt(m, timing, expectedAppearAt - 0.01).opacity).toBe(0)
    expect(markerStateAt(m, timing, expectedAppearAt).radius).toBeCloseTo(0, 9)
  })
})
