import { describe, expect, it } from 'vitest'
import { areaStateAt } from './areaAnimation'
import { easeOutQuad } from '../timeline/ease'
import type { AreaObject } from '../state/types'
import type { TimingContext } from '../timeline/timing'

const ctx: TimingContext = { totalSec: 7 }

function area(overrides: Partial<AreaObject> = {}): AreaObject {
  return {
    id: 'a1',
    name: 'Test',
    styleId: null,
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    source: { osmType: 'way', osmId: 1 },
    visible: true,
    appear: { startSec: 1, fadeInSec: 0.5, holdSec: undefined, fadeOutSec: 0 },
    ...overrides,
  }
}

describe('areaStateAt', () => {
  it('is fully opaque for the null (editor) preview', () => {
    expect(areaStateAt(area(), ctx, null)).toEqual({ visible: true, opacity: 1 })
  })

  it('is invisible-but-present before the appear time', () => {
    expect(areaStateAt(area(), ctx, 0.5)).toEqual({ visible: true, opacity: 0 })
  })

  it('follows the easeOutQuad fade curve during the fade-in duration', () => {
    // startSec=1, fadeInSec=0.5 -> k=0.5 at sec=1.25
    const state = areaStateAt(area(), ctx, 1.25)
    expect(state.visible).toBe(true)
    expect(state.opacity).toBeCloseTo(easeOutQuad(0.5), 9)
  })

  it('is fully opaque once the fade-in completes', () => {
    expect(areaStateAt(area(), ctx, 1.5)).toEqual({ visible: true, opacity: 1 })
  })

  it('treats a zero fade-in duration as an instant appear', () => {
    const a = area({ appear: { startSec: 1, fadeInSec: 0, holdSec: undefined, fadeOutSec: 0 } })
    expect(areaStateAt(a, ctx, 1)).toEqual({ visible: true, opacity: 1 })
  })

  describe('fade-out', () => {
    // startSec=1, fadeIn=0.5 (held through 1.5), holdSec=2 (held through 3.5), fadeOut=1 (gone by 4.5).
    const fading = area({ appear: { startSec: 1, fadeInSec: 0.5, holdSec: 2, fadeOutSec: 1 } })

    it('stays fully opaque right up to and including the fade-out boundary', () => {
      expect(areaStateAt(fading, ctx, 3.5)).toEqual({ visible: true, opacity: 1 })
    })

    it('mirrors the fade-in curve outward while fading out', () => {
      const state = areaStateAt(fading, ctx, 4) // halfway through the 1s fade-out
      expect(state.opacity).toBeCloseTo(easeOutQuad(0.5), 9) // same magnitude as the fade-in's k=0.5 point
    })

    it('is fully transparent once fade-out completes, and stays that way after', () => {
      expect(areaStateAt(fading, ctx, 4.5).opacity).toBeCloseTo(0, 9)
      expect(areaStateAt(fading, ctx, 999).opacity).toBeCloseTo(0, 9)
    })
  })

  it('regression: holdSec undefined ("until the end") stays fully opaque through the exact last frame', () => {
    // fadeOutStart resolves to exactly ctx.totalSec here — sec===totalSec must NOT be treated as "already fading out".
    const a = area({ appear: { startSec: 0, fadeInSec: 0.6, holdSec: undefined, fadeOutSec: 0 } })
    expect(areaStateAt(a, ctx, ctx.totalSec)).toEqual({ visible: true, opacity: 1 })
  })
})
