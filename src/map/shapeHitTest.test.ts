import { describe, expect, it } from 'vitest'
import type { AreaObject, ProjectFile, RouteObject, RouteWaypoint } from '../state/types'
import { waypointsToStraightLine } from './routeGeometry'
import { hitTestArea, hitTestRouteLeg, ROUTE_LEG_HIT_RADIUS_PX } from './shapeHitTest'
import type { Projector } from './pointHitTest'

// 1 lng/lat unit == 10px, no rotation/offset — matches pointHitTest.test.ts's convention.
const projector: Projector = { project: ([lng, lat]) => ({ x: lng * 10, y: lat * 10 }) }

// Point-in-polygon (incl. holes/MultiPolygon) is covered by overpassGeometry.test.ts's
// polygonContainsPoint tests already — hitTestArea just adds stacking-order/visibility on top.
const SQUARE: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
}

function area(id: string, geometry: AreaObject['geometry'], overrides: Partial<AreaObject> = {}): AreaObject {
  return {
    id,
    name: id,
    styleId: null,
    geometry,
    source: { osmType: 'way', osmId: 1 },
    visible: true,
    appear: { startSec: 0, fadeInSec: 0.5, holdSec: undefined, fadeOutSec: 0 },
    ...overrides,
  }
}

function project(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    version: 7,
    camera: { waypoints: [] },
    style: { id: 'positron', labelDensity: 1, germanNames: true, hideMinorLabels: false },
    markers: [],
    areas: [],
    areaStyles: [],
    routes: [],
    export: { resolution: { preset: '1920x1080', width: 1920, height: 1080 }, fps: 30, format: 'mp4', quality: 1, showAttribution: true },
    ...overrides,
  }
}

describe('hitTestArea', () => {
  it('returns null when the point is outside every area', () => {
    const p = project({ areas: [area('a1', SQUARE)] })
    expect(hitTestArea(p, { lng: 100, lat: 100 })).toBeNull()
  })

  it('returns the topmost (first) area when overlapping — order is stacking order', () => {
    const p = project({ areas: [area('top', SQUARE), area('bottom', SQUARE)] })
    expect(hitTestArea(p, { lng: 5, lat: 5 })?.id).toBe('top')
  })

  it('skips invisible areas', () => {
    const p = project({ areas: [area('hidden', SQUARE, { visible: false })] })
    expect(hitTestArea(p, { lng: 5, lat: 5 })).toBeNull()
  })
})

function wp(id: string, lng: number, lat: number, overrides: Partial<Pick<RouteWaypoint, 'holdSec' | 'travelSec'>> = {}): RouteWaypoint {
  return { id, lng, lat, holdSec: 0, travelSec: 3, ...overrides }
}

function straightRoute(waypoints: RouteWaypoint[]): RouteObject {
  return {
    id: 'r1',
    waypoints,
    routingMode: 'straight',
    geometry: waypointsToStraightLine(waypoints),
    osrmDurationSec: null,
    legDistancesM: null,
    color: '#e6572f',
    widthPx: 4,
    visible: true,
    appear: { startSec: 0 },
  }
}

describe('hitTestRouteLeg', () => {
  // A(0,0) -> B(10,0) -> C(20,0): equal-length legs (same lat, symmetric lng deltas) -> fractions [0.5, 0.5].
  const route = straightRoute([wp('a', 0, 0), wp('b', 10, 0), wp('c', 20, 0)])

  it('resolves a click near the middle of the first leg to leg 0', () => {
    expect(hitTestRouteLeg(route, projector, { x: 50, y: 0 })).toBe(0)
  })

  it('resolves a click near the middle of the second leg to leg 1', () => {
    expect(hitTestRouteLeg(route, projector, { x: 150, y: 0 })).toBe(1)
  })

  it('returns null when the click is farther than the radius from the line', () => {
    expect(hitTestRouteLeg(route, projector, { x: 50, y: 100 }, ROUTE_LEG_HIT_RADIUS_PX)).toBeNull()
  })

  it('returns null when there is no geometry yet (osrm mode, not calculated)', () => {
    const uncalculated = straightRoute([wp('a', 0, 0), wp('b', 10, 0)])
    uncalculated.geometry = null
    expect(hitTestRouteLeg(uncalculated, projector, { x: 50, y: 0 })).toBeNull()
  })

  it('returns null for a single-waypoint route (no legs)', () => {
    const single = straightRoute([wp('a', 0, 0)])
    expect(hitTestRouteLeg(single, projector, { x: 0, y: 0 })).toBeNull()
  })
})
