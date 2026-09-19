import { describe, expect, it } from 'vitest'
import { areaStateAt } from './areaAnimation'
import { easeOutQuad } from '../timeline/ease'
import type { AreaStyle } from '../state/types'
import type { TimingContext } from '../timeline/timing'

const ctx: TimingContext = { totalSec: 7 }

function style(overrides: Partial<AreaStyle> = {}): AreaStyle {
  return {
    id: 's1',
    name: 'Test',
    fill: { enabled: true, color: '#2f6bff', opacity: 0.25 },
    outline: { enabled: true, color: '#2f6bff', widthPx: 2, dashed: false },
    appear: { startSec: 1, fadeInSec: 0.5, holdSec: undefined, fadeOutSec: 0 },
    ...overrides,
  }
}

describe('areaStateAt', () => {
  it('is fully hidden when no style is assigned', () => {
    expect(areaStateAt(null, ctx, 0)).toEqual({ visible: false, opacity: 0 })
    expect(areaStateAt(null, ctx, null)).toEqual({ visible: false, opacity: 0 })
  })

  it('is fully opaque for the null (editor) preview', () => {
    expect(areaStateAt(style(), ctx, null)).toEqual({ visible: true, opacity: 1 })
  })

  it('is invisible-but-present before the appear time', () => {
    expect(areaStateAt(style(), ctx, 0.5)).toEqual({ visible: true, opacity: 0 })
  })

  it('follows the easeOutQuad fade curve during the fade-in duration', () => {
    // startSec=1, fadeInSec=0.5 -> k=0.5 at sec=1.25
    const state = areaStateAt(style(), ctx, 1.25)
    expect(state.visible).toBe(true)
    expect(state.opacity).toBeCloseTo(easeOutQuad(0.5), 9)
  })

  it('is fully opaque once the fade-in completes', () => {
    expect(areaStateAt(style(), ctx, 1.5)).toEqual({ visible: true, opacity: 1 })
  })

  it('treats a zero fade-in duration as an instant appear', () => {
    const s = style({ appear: { startSec: 1, fadeInSec: 0, holdSec: undefined, fadeOutSec: 0 } })
    expect(areaStateAt(s, ctx, 1)).toEqual({ visible: true, opacity: 1 })
  })

  describe('fade-out', () => {
    // startSec=1, fadeIn=0.5 (held through 1.5), holdSec=2 (held through 3.5), fadeOut=1 (gone by 4.5).
    const fading = style({ appear: { startSec: 1, fadeInSec: 0.5, holdSec: 2, fadeOutSec: 1 } })

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
    const s = style({ appear: { startSec: 0, fadeInSec: 0.6, holdSec: undefined, fadeOutSec: 0 } })
    expect(areaStateAt(s, ctx, ctx.totalSec)).toEqual({ visible: true, opacity: 1 })
  })
})
