import { describe, expect, it } from 'vitest'
import { routeStateAt } from './routeAnimation'
import { totalLineLengthMeters } from './routeGeometry'
import type { RouteObject } from '../state/types'
import type { TimingTotals } from '../timeline/timing'

const timing: TimingTotals = { holdStartSec: 1, zoomDurationSec: 4, holdEndSec: 2, totalSec: 7 }

const geometry: GeoJSON.LineString = {
  type: 'LineString',
  coordinates: [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
}

function route(overrides: Partial<RouteObject> = {}): RouteObject {
  return {
    id: 'r1',
    waypoints: [
      { lng: 0, lat: 0 },
      { lng: 0, lat: 2 },
    ],
    routingMode: 'osrm',
    profile: 'driving',
    geometry,
    osrmDurationSec: null,
    color: '#e6572f',
    widthPx: 4,
    visible: true,
    appear: { mode: 'custom', atSec: 1 },
    reveal: 'progressive',
    drawSpeedKmh: 80,
    ...overrides,
  }
}

describe('routeStateAt', () => {
  it('is hidden when there is no route', () => {
    expect(routeStateAt(null, timing, 0)).toEqual({ visible: false, fraction: 0 })
    expect(routeStateAt(null, timing, null)).toEqual({ visible: false, fraction: 0 })
  })

  it('is hidden when the route has no geometry yet', () => {
    expect(routeStateAt(route({ geometry: null }), timing, 5)).toEqual({ visible: false, fraction: 0 })
  })

  it('is hidden when the route is not visible', () => {
    expect(routeStateAt(route({ visible: false }), timing, 5)).toEqual({ visible: false, fraction: 0 })
  })

  it('is fully drawn for the null (editor) preview', () => {
    expect(routeStateAt(route(), timing, null)).toEqual({ visible: true, fraction: 1 })
  })

  it('is hidden before the appear time', () => {
    expect(routeStateAt(route(), timing, 0.5)).toEqual({ visible: false, fraction: 0 })
  })

  it('reveal "instant" shows the full route immediately at appear time', () => {
    const r = route({ reveal: 'instant' })
    expect(routeStateAt(r, timing, 1)).toEqual({ visible: true, fraction: 1 })
    expect(routeStateAt(r, timing, 100)).toEqual({ visible: true, fraction: 1 })
  })

  it('reveal "progressive" derives the draw duration from length/speed, not a fixed number', () => {
    const r = route({ reveal: 'progressive', drawSpeedKmh: 80 })
    const totalKm = totalLineLengthMeters(geometry.coordinates) / 1000
    const durationSec = (totalKm / 80) * 3600
    const appearAt = 1
    const midSec = appearAt + durationSec / 2

    const state = routeStateAt(r, timing, midSec)
    expect(state.visible).toBe(true)
    expect(state.fraction).toBeCloseTo(0.5, 6)
  })

  it('a longer route takes proportionally longer to draw at the same speed', () => {
    const shortGeometry: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0, 1],
      ],
    }
    const longGeometry: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0, 4],
      ],
    }
    const secAfterAppear = 50
    const shortState = routeStateAt(route({ geometry: shortGeometry, drawSpeedKmh: 80 }), timing, 1 + secAfterAppear)
    const longState = routeStateAt(route({ geometry: longGeometry, drawSpeedKmh: 80 }), timing, 1 + secAfterAppear)
    expect(longState.fraction).toBeLessThan(shortState.fraction)
  })

  it('clamps fraction to 1 once the draw duration has fully elapsed', () => {
    const r = route({ reveal: 'progressive', drawSpeedKmh: 80 })
    expect(routeStateAt(r, timing, 100000)).toEqual({ visible: true, fraction: 1 })
  })

  it('treats a non-positive draw speed as an instant reveal (avoids division by zero)', () => {
    const r = route({ reveal: 'progressive', drawSpeedKmh: 0 })
    expect(routeStateAt(r, timing, 1)).toEqual({ visible: true, fraction: 1 })
  })

  it.each([
    ['start', 0],
    ['zoomStart', timing.holdStartSec],
    ['zoomEnd', timing.holdStartSec + timing.zoomDurationSec],
  ] as const)('resolves appear mode %s to the right appear time', (mode, expectedAppearAt) => {
    const r = route({ appear: { mode }, reveal: 'instant' })
    expect(routeStateAt(r, timing, expectedAppearAt - 0.01).visible).toBe(false)
    expect(routeStateAt(r, timing, expectedAppearAt).visible).toBe(true)
  })
})
