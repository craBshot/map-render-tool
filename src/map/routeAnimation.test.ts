import { describe, expect, it } from 'vitest'
import { routeStateAt } from './routeAnimation'
import type { RouteObject, RouteWaypoint } from '../state/types'

const geometry: GeoJSON.LineString = {
  type: 'LineString',
  coordinates: [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
}

function wp(id: string, lng: number, lat: number, overrides: Partial<Pick<RouteWaypoint, 'holdSec' | 'travelSec'>> = {}): RouteWaypoint {
  return { id, lng, lat, holdSec: 0, travelSec: 0, ...overrides }
}

function route(overrides: Partial<RouteObject> = {}): RouteObject {
  return {
    id: 'r1',
    waypoints: [wp('w0', 0, 0), wp('w1', 0, 2, { travelSec: 4 })],
    routingMode: 'osrm',
    geometry,
    osrmDurationSec: null,
    legDistancesM: null,
    color: '#e6572f',
    widthPx: 4,
    visible: true,
    appear: { startSec: 1 },
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
    const r = route({ appear: { startSec: 2 } })
    expect(routeStateAt(r, 1.99).visible).toBe(false)
    expect(routeStateAt(r, 2).visible).toBe(true)
  })

  it('travelSec 0 on every leg shows the full route immediately at appear time (old "instant" reveal)', () => {
    const r = route({ waypoints: [wp('w0', 0, 0), wp('w1', 0, 2, { travelSec: 0 })] })
    expect(routeStateAt(r, 1)).toEqual({ visible: true, fraction: 1 })
    expect(routeStateAt(r, 100)).toEqual({ visible: true, fraction: 1 })
  })

  it('single-leg route advances linearly over the leg\'s travelSec (regression: matches the old fixed-duration ramp)', () => {
    const r = route({ waypoints: [wp('w0', 0, 0), wp('w1', 0, 2, { travelSec: 4 })] })
    // appearAt=1, travelSec=4 -> fraction=0.5 at sec=3
    const state = routeStateAt(r, 3)
    expect(state.visible).toBe(true)
    expect(state.fraction).toBeCloseTo(0.5, 6)
  })

  it("two single-leg routes of different length draw over the same fixed travelSec, independent of their length", () => {
    const shortGeometry: GeoJSON.LineString = { type: 'LineString', coordinates: [[0, 0], [0, 1]] }
    const longGeometry: GeoJSON.LineString = { type: 'LineString', coordinates: [[0, 0], [0, 4]] }
    const waypoints = [wp('w0', 0, 0), wp('w1', 0, 2, { travelSec: 4 })]
    const shortState = routeStateAt(route({ geometry: shortGeometry, waypoints }), 3)
    const longState = routeStateAt(route({ geometry: longGeometry, waypoints }), 3)
    expect(longState.fraction).toBeCloseTo(shortState.fraction, 6)
  })

  it('clamps fraction to 1 once the last leg has fully elapsed', () => {
    const r = route({ waypoints: [wp('w0', 0, 0), wp('w1', 0, 2, { travelSec: 4 })] })
    expect(routeStateAt(r, 100000)).toEqual({ visible: true, fraction: 1 })
  })

  it('treats a 0 travelSec leg as an instant reveal for that leg (avoids division by zero)', () => {
    const r = route({ waypoints: [wp('w0', 0, 0), wp('w1', 0, 2, { travelSec: 0 })] })
    expect(routeStateAt(r, 1)).toEqual({ visible: true, fraction: 1 })
  })

  describe('multi-waypoint chain (per-leg hold/travel)', () => {
    // start -> hold 2s -> travel 4s -> mid -> hold 3s -> travel 2s -> end. appear at 0.
    const waypoints = [
      wp('w0', 0, 0, { holdSec: 2 }),
      wp('w1', 0, 1, { travelSec: 4, holdSec: 3 }),
      wp('w2', 0, 2, { travelSec: 2 }),
    ]

    it('keeps fraction at 0 during the first hold (nothing drawn yet)', () => {
      const r = route({ waypoints, appear: { startSec: 0 } })
      expect(routeStateAt(r, 0)).toEqual({ visible: true, fraction: 0 })
      expect(routeStateAt(r, 1.9)).toEqual({ visible: true, fraction: 0 })
    })

    it('reaches exactly the first leg\'s length-fraction the instant the middle waypoint arrives', () => {
      const r = route({ waypoints, appear: { startSec: 0 }, legDistancesM: [3000, 1000] }) // leg fractions 0.75/0.25
      // hold(2) + travel(4) = 6s to arrive at w1
      const state = routeStateAt(r, 6)
      expect(state.fraction).toBeCloseTo(0.75, 9)
    })

    it('keeps fraction flat during the middle hold', () => {
      const r = route({ waypoints, appear: { startSec: 0 }, legDistancesM: [3000, 1000] })
      const atArrival = routeStateAt(r, 6).fraction
      const midHold = routeStateAt(r, 7.5).fraction
      const endHold = routeStateAt(r, 9).fraction // hold(2)+travel(4)+hold(3) = 9s, about to start the last travel
      expect(midHold).toBeCloseTo(atArrival, 9)
      expect(endHold).toBeCloseTo(atArrival, 9)
    })

    it('reaches fraction 1 once the last leg completes', () => {
      const r = route({ waypoints, appear: { startSec: 0 }, legDistancesM: [3000, 1000] })
      // hold(2)+travel(4)+hold(3)+travel(2) = 11s total
      expect(routeStateAt(r, 11)).toEqual({ visible: true, fraction: 1 })
      expect(routeStateAt(r, 500)).toEqual({ visible: true, fraction: 1 })
    })

    it('unequal leg lengths produce a proportionally different fraction-per-second within each leg', () => {
      const r = route({ waypoints, appear: { startSec: 0 }, legDistancesM: [3000, 1000] }) // 0.75 over 4s, 0.25 over 2s
      const midFirstLeg = routeStateAt(r, 2 + 2).fraction // 2s into the 4s first travel leg
      expect(midFirstLeg).toBeCloseTo(0.375, 9) // half of 0.75
    })
  })

  describe('with real OSRM leg distances vs. straight-line fallback', () => {
    const waypoints = [wp('w0', 0, 0), wp('w1', 0, 1, { travelSec: 2 }), wp('w2', 0, 2, { travelSec: 2 })]

    it('OSRM-mode fixture (legDistancesM present, unequal) uses real proportions', () => {
      const r = route({ waypoints, appear: { startSec: 0 }, legDistancesM: [1000, 3000] })
      // arrival at w1 (2s in) should be fraction 0.25, not 0.5
      expect(routeStateAt(r, 2).fraction).toBeCloseTo(0.25, 9)
    })

    it('straight-mode fixture (legDistancesM null, equal-length meridian legs) falls back to haversine, giving equal proportions', () => {
      const r = route({ waypoints, appear: { startSec: 0 }, legDistancesM: null, routingMode: 'straight' })
      expect(routeStateAt(r, 2).fraction).toBeCloseTo(0.5, 9)
    })
  })
})
