import { describe, expect, it } from 'vitest'
import { areaStateAt } from './areaAnimation'
import { easeOutQuad } from '../timeline/ease'
import type { AreaStyle } from '../state/types'
import type { TimingTotals } from '../timeline/timing'

const timing: TimingTotals = { holdStartSec: 1, zoomDurationSec: 4, holdEndSec: 2, totalSec: 7 }

function style(overrides: Partial<AreaStyle> = {}): AreaStyle {
  return {
    id: 's1',
    name: 'Test',
    fill: { enabled: true, color: '#2f6bff', opacity: 0.25 },
    outline: { enabled: true, color: '#2f6bff', widthPx: 2, dashed: false },
    appear: { mode: 'custom', atSec: 1, fadeDurationSec: 0.5 },
    ...overrides,
  }
}

describe('areaStateAt', () => {
  it('is fully hidden when no style is assigned', () => {
    expect(areaStateAt(null, timing, 0)).toEqual({ visible: false, opacity: 0 })
    expect(areaStateAt(null, timing, null)).toEqual({ visible: false, opacity: 0 })
  })

  it('is fully opaque for the null (editor) preview', () => {
    expect(areaStateAt(style(), timing, null)).toEqual({ visible: true, opacity: 1 })
  })

  it('is invisible-but-present before the appear time', () => {
    expect(areaStateAt(style(), timing, 0.5)).toEqual({ visible: true, opacity: 0 })
  })

  it('follows the easeOutQuad fade curve during the fade duration', () => {
    // appearAt=1, fadeDurationSec=0.5 -> k=0.5 at sec=1.25
    const state = areaStateAt(style(), timing, 1.25)
    expect(state.visible).toBe(true)
    expect(state.opacity).toBeCloseTo(easeOutQuad(0.5), 9)
  })

  it('is fully opaque once the fade completes', () => {
    expect(areaStateAt(style(), timing, 1.5)).toEqual({ visible: true, opacity: 1 })
  })

  it('treats a zero fade duration as an instant appear', () => {
    const s = style({ appear: { mode: 'custom', atSec: 1, fadeDurationSec: 0 } })
    expect(areaStateAt(s, timing, 1)).toEqual({ visible: true, opacity: 1 })
  })

  it.each([
    ['start', 0],
    ['zoomStart', timing.holdStartSec],
    ['zoomEnd', timing.holdStartSec + timing.zoomDurationSec],
  ] as const)('resolves appear mode %s to the right appear time', (mode, expectedAppearAt) => {
    const s = style({ appear: { mode, fadeDurationSec: 0.5 } })
    expect(areaStateAt(s, timing, expectedAppearAt - 0.01).opacity).toBe(0)
    expect(areaStateAt(s, timing, expectedAppearAt).opacity).toBeGreaterThanOrEqual(0)
  })
})
