import { describe, expect, it } from 'vitest'
import { appearBarLayout, chainSegmentsLayout, pointLayout } from './timelineLayout'
import { MIN_TRAVEL_SEC } from '../../map/camera'
import { createDefaultCameraWaypoint, type AppearTiming, type CameraWaypoint } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'

function appear(overrides: Partial<AppearTiming> = {}): AppearTiming {
  return { startSec: 1, fadeInSec: 0.5, holdSec: 2, fadeOutSec: 1, ...overrides }
}

describe('appearBarLayout', () => {
  it('holdSec undefined: hasFixedEnd, no fade-out sliver, bar reaches the end', () => {
    const layout = appearBarLayout(appear({ startSec: 0, fadeInSec: 1, holdSec: undefined }), { totalSec: 10 })
    expect(layout.hasFixedEnd).toBe(true)
    expect(layout.fadeOutPct).toBe(0)
    expect(layout.leftPct + layout.fadeInPct + layout.holdPct).toBeCloseTo(100, 9)
  })

  it('holdSec defined, fadeOutSec 0: sharp cutoff, not a fixed end', () => {
    const layout = appearBarLayout(appear({ holdSec: 3, fadeOutSec: 0 }), { totalSec: 10 })
    expect(layout.hasFixedEnd).toBe(false)
    expect(layout.fadeOutPct).toBe(0)
  })

  it('fadeInSec 0: no fade-in sliver', () => {
    const layout = appearBarLayout(appear({ fadeInSec: 0 }), { totalSec: 10 })
    expect(layout.fadeInPct).toBe(0)
  })

  it('totalSec 0 (degenerate/empty project): every pct is 0, no NaN/Infinity', () => {
    const layout = appearBarLayout(appear(), { totalSec: 0 })
    expect(layout.leftPct).toBe(0)
    expect(layout.fadeInPct).toBe(0)
    expect(layout.holdPct).toBe(0)
    expect(layout.fadeOutPct).toBe(0)
    expect(Number.isFinite(layout.leftPct)).toBe(true)
  })

  it('start+fadeIn+hold+fadeOut overflowing totalSec: clamps, no negative trailing segment', () => {
    const ctx: TimingContext = { totalSec: 3 }
    const layout = appearBarLayout(appear({ startSec: 1, fadeInSec: 1, holdSec: 5, fadeOutSec: 2 }), ctx)
    expect(layout.leftPct + layout.fadeInPct + layout.holdPct + layout.fadeOutPct).toBeCloseTo(100, 9)
    expect(layout.fadeOutPct).toBeGreaterThanOrEqual(0)
    expect(layout.holdPct).toBeGreaterThanOrEqual(0)
  })

  it('startSec beyond totalSec (e.g. post-drag): leftPct clamps to 100, all widths 0', () => {
    const layout = appearBarLayout(appear({ startSec: 50 }), { totalSec: 10 })
    expect(layout.leftPct).toBe(100)
    expect(layout.fadeInPct).toBe(0)
    expect(layout.holdPct).toBe(0)
    expect(layout.fadeOutPct).toBe(0)
  })
})

describe('pointLayout', () => {
  it('converts startSec to a percentage of totalSec', () => {
    expect(pointLayout(5, { totalSec: 10 }).leftPct).toBeCloseTo(50, 9)
  })

  it('totalSec 0: no NaN/Infinity', () => {
    expect(pointLayout(5, { totalSec: 0 }).leftPct).toBe(0)
  })
})

describe('chainSegmentsLayout', () => {
  function wp(overrides: Partial<CameraWaypoint> = {}): CameraWaypoint {
    return { ...createDefaultCameraWaypoint(0, 0, 2), holdSec: 0, travelSec: 0, ...overrides }
  }

  it('lays out a 2-waypoint chain with percentages summing to 100', () => {
    const waypoints = [wp({ holdSec: 1 }), wp({ holdSec: 2, travelSec: 4 })]
    const ctx: TimingContext = { totalSec: 7 } // 1 + 4 + 2
    const layout = chainSegmentsLayout(waypoints, ctx, MIN_TRAVEL_SEC)
    expect(layout).toHaveLength(3)
    const totalPct = layout.reduce((sum, seg) => sum + seg.widthPct, 0)
    expect(totalPct).toBeCloseTo(100, 9)
    expect(layout[0].leftPct).toBeCloseTo(0, 9)
  })

  it('delegates duration clamping to the given minTravelSec floor', () => {
    const waypoints = [wp(), wp({ travelSec: 0.01 })]
    const ctx: TimingContext = { totalSec: 0.5 }
    const layout = chainSegmentsLayout(waypoints, ctx, MIN_TRAVEL_SEC)
    const travel = layout.find((s) => s.kind === 'travel')
    expect(travel?.durationSec).toBe(0.5)
    expect(travel?.widthPct).toBeCloseTo(100, 9)
  })

  it('defaults minTravelSec to 0 (routes: a true instant leg is valid, no artificial floor)', () => {
    const waypoints = [wp(), wp({ travelSec: 0 })]
    const ctx: TimingContext = { totalSec: 1 }
    const layout = chainSegmentsLayout(waypoints, ctx)
    const travel = layout.find((s) => s.kind === 'travel')
    expect(travel?.durationSec).toBe(0)
  })

  it('offsetSec shifts every segment in project time (routes: appear.startSec)', () => {
    const waypoints = [wp({ holdSec: 1 }), wp({ holdSec: 1, travelSec: 2 })]
    const ctx: TimingContext = { totalSec: 10 }
    const layout = chainSegmentsLayout(waypoints, ctx, 0, 4)
    expect(layout[0].startSec).toBe(4) // first hold, chain-local 0 + offset 4
    expect(layout[0].leftPct).toBeCloseTo(40, 9)
    expect(layout[1].startSec).toBe(5) // travel starts after the 1s hold
  })
})
