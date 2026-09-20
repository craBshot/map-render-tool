import { describe, expect, it } from 'vitest'
import type { RouteObject, RouteWaypoint } from '../state/types'
import {
  haversineDistanceMeters,
  insertRouteWaypoint,
  legLengthFractions,
  sliceLineByFraction,
  totalLineLengthMeters,
  waypointsToStraightLine,
} from './routeGeometry'

function wp(id: string, lng: number, lat: number, overrides: Partial<Pick<RouteWaypoint, 'holdSec' | 'travelSec'>> = {}): RouteWaypoint {
  return { id, lng, lat, holdSec: 0, travelSec: 3, ...overrides }
}

function route(overrides: Partial<RouteObject> = {}): RouteObject {
  return {
    id: 'r1',
    waypoints: [],
    routingMode: 'osrm',
    geometry: null,
    osrmDurationSec: null,
    legDistancesM: null,
    color: '#e6572f',
    widthPx: 4,
    visible: true,
    appear: { startSec: 0 },
    ...overrides,
  }
}

describe('haversineDistanceMeters', () => {
  it('matches the well-known ~111.2 km per degree of latitude', () => {
    const meters = haversineDistanceMeters([0, 0], [0, 1])
    expect(meters).toBeGreaterThan(111000)
    expect(meters).toBeLessThan(111400)
  })

  it('is zero for identical points', () => {
    expect(haversineDistanceMeters([8.4, 49.8], [8.4, 49.8])).toBeCloseTo(0, 6)
  })
})

describe('totalLineLengthMeters', () => {
  it('sums consecutive segment distances', () => {
    const total = totalLineLengthMeters([
      [0, 0],
      [0, 1],
      [0, 2],
    ])
    const oneSegment = haversineDistanceMeters([0, 0], [0, 1])
    expect(total).toBeCloseTo(oneSegment * 2, 3)
  })

  it('is zero for a single point or empty line', () => {
    expect(totalLineLengthMeters([[0, 0]])).toBe(0)
    expect(totalLineLengthMeters([])).toBe(0)
  })
})

// Two equal-length segments along a meridian (dLambda = 0), so distances are
// exactly equal regardless of latitude — makes the expected cut points exact.
const twoEqualSegments: GeoJSON.Position[] = [
  [0, 0],
  [0, 1],
  [0, 2],
]

describe('sliceLineByFraction', () => {
  it('returns just the first point for fraction <= 0', () => {
    expect(sliceLineByFraction(twoEqualSegments, 0)).toEqual([[0, 0]])
  })

  it('cuts halfway through the first segment at fraction 0.25', () => {
    expect(sliceLineByFraction(twoEqualSegments, 0.25)).toEqual([[0, 0], [0, 0.5]])
  })

  it('lands exactly on the middle point at fraction 0.5', () => {
    expect(sliceLineByFraction(twoEqualSegments, 0.5)).toEqual([[0, 0], [0, 1]])
  })

  it('cuts halfway through the second segment at fraction 0.75', () => {
    expect(sliceLineByFraction(twoEqualSegments, 0.75)).toEqual([[0, 0], [0, 1], [0, 1.5]])
  })

  it('returns the full line unchanged at fraction >= 1', () => {
    expect(sliceLineByFraction(twoEqualSegments, 1)).toEqual(twoEqualSegments)
    expect(sliceLineByFraction(twoEqualSegments, 1.5)).toEqual(twoEqualSegments)
  })

  it('returns an empty array for an empty line', () => {
    expect(sliceLineByFraction([], 0.5)).toEqual([])
  })
})

describe('waypointsToStraightLine', () => {
  it('connects waypoints in order as [lng, lat] pairs', () => {
    const line = waypointsToStraightLine([wp('a', 13.4, 52.5), wp('b', 11.6, 48.1)])
    expect(line).toEqual({
      type: 'LineString',
      coordinates: [
        [13.4, 52.5],
        [11.6, 48.1],
      ],
    })
  })
})

describe('insertRouteWaypoint', () => {
  const a = wp('a', 0, 0)
  const b = wp('b', 1, 1)
  const c = wp('c', 2, 2)
  const d = wp('d', 3, 3)

  it('appends the first click as the start (0 -> 1)', () => {
    expect(insertRouteWaypoint([], a)).toEqual([a])
  })

  it('appends the second click as the destination (1 -> 2)', () => {
    expect(insertRouteWaypoint([a], b)).toEqual([a, b])
  })

  it('inserts a third click before the destination, which stays last (2 -> 3)', () => {
    expect(insertRouteWaypoint([a, b], c)).toEqual([a, c, b])
  })

  it('inserts a fourth click before the destination too, after the first via-point (3 -> 4)', () => {
    expect(insertRouteWaypoint([a, c, b], d)).toEqual([a, c, d, b])
  })
})

describe('legLengthFractions', () => {
  it('returns an empty array for 0 or 1 waypoints', () => {
    expect(legLengthFractions(route({ waypoints: [] }))).toEqual([])
    expect(legLengthFractions(route({ waypoints: [wp('a', 0, 0)] }))).toEqual([])
  })

  it('uses legDistancesM (proportionally, not evenly) when present and length-matching', () => {
    const r = route({
      waypoints: [wp('a', 0, 0), wp('b', 1, 1), wp('c', 2, 2)],
      legDistancesM: [3000, 1000],
    })
    const fractions = legLengthFractions(r)
    expect(fractions[0]).toBeCloseTo(0.75, 9)
    expect(fractions[1]).toBeCloseTo(0.25, 9)
  })

  it('falls back to straight-line (haversine) distances when legDistancesM is missing', () => {
    // Two equal-length meridian segments -> equal fractions, verified against haversineDistanceMeters directly.
    const r = route({ waypoints: [wp('a', 0, 0), wp('b', 0, 1), wp('c', 0, 2)], legDistancesM: null })
    const fractions = legLengthFractions(r)
    expect(fractions[0]).toBeCloseTo(0.5, 9)
    expect(fractions[1]).toBeCloseTo(0.5, 9)
  })

  it('falls back to straight-line distances when legDistancesM is stale (length mismatch after a waypoint edit)', () => {
    const r = route({
      waypoints: [wp('a', 0, 0), wp('b', 0, 1), wp('c', 0, 2)],
      legDistancesM: [12345], // stale: only 1 entry for a 2-leg route
    })
    const fractions = legLengthFractions(r)
    expect(fractions).toHaveLength(2)
    expect(fractions[0]).toBeCloseTo(0.5, 9)
    expect(fractions[1]).toBeCloseTo(0.5, 9)
  })

  it('splits evenly when total length is 0 (degenerate: all waypoints coincide)', () => {
    const r = route({ waypoints: [wp('a', 5, 5), wp('b', 5, 5), wp('c', 5, 5)], legDistancesM: null })
    expect(legLengthFractions(r)).toEqual([0.5, 0.5])
  })

  it('fractions always sum to 1', () => {
    const r = route({ waypoints: [wp('a', 0, 0), wp('b', 1, 0.3), wp('c', 2, -1), wp('d', 2.5, 0.8)], legDistancesM: null })
    const fractions = legLengthFractions(r)
    expect(fractions.reduce((sum, f) => sum + f, 0)).toBeCloseTo(1, 9)
  })
})
