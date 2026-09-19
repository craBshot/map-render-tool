import { describe, expect, it } from 'vitest'
import { routeStateAt } from './routeAnimation'
import type { RouteObject } from '../state/types'

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
    geometry,
    osrmDurationSec: null,
    color: '#e6572f',
    widthPx: 4,
    visible: true,
    appear: { startSec: 1 },
    reveal: 'progressive',
    drawDurationSec: 4,
    ...overrides,
  }
}

describe('routeStateAt', () => {
  it('is hidden when there is no route', () => {
    expect(routeStateAt(null, 0)).toEqual({ visible: false, fraction: 0 })
    expect(routeStateAt(null, null)).toEqual({ visible: false, fraction: 0 })
  })

  it('is hidden when the route has no geometry yet', () => {
    expect(routeStateAt(route({ geometry: null }), 5)).toEqual({ visible: false, fraction: 0 })
  })

  it('is hidden when the route is not visible', () => {
    expect(routeStateAt(route({ visible: false }), 5)).toEqual({ visible: false, fraction: 0 })
  })

  it('is fully drawn for the null (editor) preview', () => {
    expect(routeStateAt(route(), null)).toEqual({ visible: true, fraction: 1 })
  })

  it('is hidden before the appear time', () => {
    expect(routeStateAt(route(), 0.5)).toEqual({ visible: false, fraction: 0 })
  })

  it('appears at exactly appear.startSec', () => {
    const r = route({ appear: { startSec: 2 }, reveal: 'instant' })
    expect(routeStateAt(r, 1.99).visible).toBe(false)
    expect(routeStateAt(r, 2).visible).toBe(true)
  })

  it('reveal "instant" shows the full route immediately at appear time', () => {
    const r = route({ reveal: 'instant' })
    expect(routeStateAt(r, 1)).toEqual({ visible: true, fraction: 1 })
    expect(routeStateAt(r, 100)).toEqual({ visible: true, fraction: 1 })
  })

  it('reveal "progressive" advances linearly over the fixed drawDurationSec', () => {
    const r = route({ reveal: 'progressive', drawDurationSec: 4 })
    // appearAt=1, drawDurationSec=4 -> fraction=0.5 at sec=3
    const state = routeStateAt(r, 3)
    expect(state.visible).toBe(true)
    expect(state.fraction).toBeCloseTo(0.5, 6)
  })

  it("two routes of different length draw over the same fixed duration, independent of their length", () => {
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
    const shortState = routeStateAt(route({ geometry: shortGeometry, drawDurationSec: 4 }), 3)
    const longState = routeStateAt(route({ geometry: longGeometry, drawDurationSec: 4 }), 3)
    expect(longState.fraction).toBeCloseTo(shortState.fraction, 6)
  })

  it('clamps fraction to 1 once the draw duration has fully elapsed', () => {
    const r = route({ reveal: 'progressive', drawDurationSec: 4 })
    expect(routeStateAt(r, 100000)).toEqual({ visible: true, fraction: 1 })
  })

  it('treats a non-positive draw duration as an instant reveal (avoids division by zero)', () => {
    const r = route({ reveal: 'progressive', drawDurationSec: 0 })
    expect(routeStateAt(r, 1)).toEqual({ visible: true, fraction: 1 })
  })
})
