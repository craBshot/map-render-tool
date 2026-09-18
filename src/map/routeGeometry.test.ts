import { describe, expect, it } from 'vitest'
import {
  haversineDistanceMeters,
  insertRouteWaypoint,
  sliceLineByFraction,
  totalLineLengthMeters,
  waypointsToStraightLine,
} from './routeGeometry'

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
    const line = waypointsToStraightLine([
      { lng: 13.4, lat: 52.5 },
      { lng: 11.6, lat: 48.1 },
    ])
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
  const a = { lng: 0, lat: 0 }
  const b = { lng: 1, lat: 1 }
  const c = { lng: 2, lat: 2 }
  const d = { lng: 3, lat: 3 }

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
