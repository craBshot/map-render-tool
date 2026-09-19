import { describe, expect, it } from 'vitest'
import { markerStateAt } from './markerAnimation'
import { easeOutBack } from '../timeline/ease'
import type { MarkerObject } from '../state/types'
import type { TimingContext } from '../timeline/timing'

const ctx: TimingContext = { totalSec: 7 }

function marker(overrides: Partial<MarkerObject> = {}): MarkerObject {
  return {
    id: 'm1',
    lng: 0,
    lat: 0,
    color: '#fff',
    sizePx: 10,
    pulse: { enabled: true, periodSec: 2, scale: 2, strength: 0.5 },
    appear: { startSec: 1, fadeInSec: 0.5, holdSec: undefined, fadeOutSec: 0 },
    visible: true,
    ...overrides,
  }
}

describe('markerStateAt', () => {
  it('is fully hidden when the marker itself is not visible', () => {
    const state = markerStateAt(marker({ visible: false }), ctx, 0)
    expect(state).toEqual({ visible: false, radius: 0, opacity: 0, haloRadius: 0, haloOpacity: 0 })
  })

  it('shows a static full-strength halo for the null (editor) preview', () => {
    const state = markerStateAt(marker(), ctx, null)
    expect(state.visible).toBe(true)
    expect(state.radius).toBe(10)
    expect(state.opacity).toBe(1)
    expect(state.haloRadius).toBeCloseTo(10 * 1.6, 9) // size * (1 + (scale-1)*0.6)
    expect(state.haloOpacity).toBeCloseTo(0.25, 9) // strength * 0.5
  })

  it('is invisible-but-present before the appear time', () => {
    const state = markerStateAt(marker(), ctx, 0.5)
    expect(state).toEqual({ visible: true, radius: 0, opacity: 0, haloRadius: 0, haloOpacity: 0 })
  })

  it('follows the easeOutBack pop-in curve during the fade-in duration', () => {
    // startSec=1, fadeInSec=0.5 → k=0.5 at sec=1.25
    const state = markerStateAt(marker(), ctx, 1.25)
    expect(state.radius).toBeCloseTo(10 * easeOutBack(0.5), 9)
    expect(state.opacity).toBe(1) // opacity ramps to 1 twice as fast as k
  })

  it('starts the pulse halo exactly at full size once pop-in completes', () => {
    // sec = startSec + fadeIn → k=1, pulse phase=0
    const state = markerStateAt(marker(), ctx, 1.5)
    expect(state.radius).toBeCloseTo(10, 9)
    expect(state.haloRadius).toBeCloseTo(10, 9)
    expect(state.haloOpacity).toBeCloseTo(0.5, 9)
  })

  it('sweeps the halo outward and fades it over one pulse period', () => {
    // half a period after pop-in completes → phase=0.5
    const state = markerStateAt(marker(), ctx, 1.5 + 1)
    expect(state.haloRadius).toBeCloseTo(18.75, 9) // size + (size*scale - size) * (1 - 0.5^3)
    expect(state.haloOpacity).toBeCloseTo(0.25, 9) // strength * (1 - 0.5)
  })

  it('does not pulse when pulse is disabled', () => {
    const state = markerStateAt(marker({ pulse: { enabled: false, periodSec: 2, scale: 2, strength: 0.5 } }), ctx, 5)
    expect(state.haloRadius).toBe(0)
    expect(state.haloOpacity).toBe(0)
  })

  describe('fade-out', () => {
    // startSec=1, fadeIn=0.5 (held through 1.5), holdSec=2 (held through 3.5), fadeOut=1 (gone by 4.5).
    const fading = marker({ appear: { startSec: 1, fadeInSec: 0.5, holdSec: 2, fadeOutSec: 1 } })

    it('stays fully held right up to and including the fade-out boundary', () => {
      const state = markerStateAt(fading, ctx, 3.5)
      expect(state.radius).toBeCloseTo(10, 9)
      expect(state.opacity).toBe(1)
    })

    it('mirrors the pop-in curve outward (shrink, no halo) once fading out', () => {
      const state = markerStateAt(fading, ctx, 4) // halfway through the 1s fade-out
      expect(state.radius).toBeCloseTo(10 * easeOutBack(0.5), 9) // same magnitude as the k=0.5 pop-in point
      expect(state.haloRadius).toBe(0)
      expect(state.haloOpacity).toBe(0)
    })

    it('is fully gone once fade-out completes, and stays gone after', () => {
      expect(markerStateAt(fading, ctx, 4.5).radius).toBeCloseTo(0, 9)
      expect(markerStateAt(fading, ctx, 4.5).opacity).toBe(0)
      expect(markerStateAt(fading, ctx, 999).radius).toBeCloseTo(0, 9)
    })

    it('an unset fadeOutSec (0) disappears instantly once the hold ends', () => {
      const noFadeOut = marker({ appear: { startSec: 0, fadeInSec: 0, holdSec: 1, fadeOutSec: 0 } })
      expect(markerStateAt(noFadeOut, ctx, 1).opacity).toBe(1) // still the held frame, at the boundary
      expect(markerStateAt(noFadeOut, ctx, 1.001).opacity).toBe(0)
    })
  })

  it('regression: holdSec undefined ("until the end") stays fully visible through the exact last frame', () => {
    // fadeOutStart resolves to exactly ctx.totalSec here — sec===totalSec must NOT be treated as "already fading out".
    const m = marker({ appear: { startSec: 0, fadeInSec: 0.4, holdSec: undefined, fadeOutSec: 0 } })
    const state = markerStateAt(m, ctx, ctx.totalSec)
    expect(state.opacity).toBe(1)
    expect(state.radius).toBeCloseTo(10, 9)
  })
})
