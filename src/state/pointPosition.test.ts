import { describe, expect, it } from 'vitest'
import { withCameraWaypointPosition, withMarkerPosition, withRouteWaypointPosition } from './pointPosition'
import type { ProjectFile } from './types'

function baseProject(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    version: 7,
    camera: {
      waypoints: [
        { id: 'c1', lng: 10, lat: 51, zr: 4, holdSec: 1, travelSec: 0 },
        { id: 'c2', lng: 10, lat: 51, zr: 10, holdSec: 2, travelSec: 4 },
      ],
    },
    style: { id: 'positron', labelDensity: 1, germanNames: true, hideMinorLabels: false },
    markers: [
      {
        id: 'm1',
        lng: 1,
        lat: 1,
        color: '#2f6bff',
        sizePx: 9,
        pulse: { enabled: true, periodSec: 1.6, scale: 3.2, strength: 0.45 },
        appear: { startSec: 0, fadeInSec: 0.4, holdSec: undefined, fadeOutSec: 0 },
        visible: true,
      },
    ],
    areas: [],
    areaStyles: [],
    routes: [
      {
        id: 'route1',
        waypoints: [
          { id: 'r1', lng: 0, lat: 0, holdSec: 0, travelSec: 0 },
          { id: 'r2', lng: 1, lat: 1, holdSec: 0, travelSec: 3 },
        ],
        routingMode: 'straight',
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        osrmDurationSec: null,
        legDistancesM: [100],
        color: '#e6572f',
        widthPx: 4,
        visible: true,
        appear: { startSec: 0 },
      },
    ],
    export: { resolution: { preset: '1920x1080', width: 1920, height: 1080 }, fps: 30, format: 'mp4', quality: 1, showAttribution: true },
    ...overrides,
  }
}

describe('withMarkerPosition', () => {
  it("only changes the targeted marker's lng/lat", () => {
    const result = withMarkerPosition(baseProject(), 'm1', 5, 6)
    expect(result.markers).toEqual([{ ...baseProject().markers[0], lng: 5, lat: 6 }])
  })
})

describe('withCameraWaypointPosition', () => {
  it("only changes the targeted waypoint's lng/lat, sibling untouched", () => {
    const result = withCameraWaypointPosition(baseProject(), 'c1', 5, 6)
    expect(result.camera.waypoints[0]).toEqual({ ...baseProject().camera.waypoints[0], lng: 5, lat: 6 })
    expect(result.camera.waypoints[1]).toEqual(baseProject().camera.waypoints[1])
  })
})

describe('withRouteWaypointPosition', () => {
  it('straight mode: recomputes geometry and nulls legDistancesM', () => {
    const result = withRouteWaypointPosition(baseProject(), 'r2', 9, 9)
    expect(result.routes[0].waypoints[1]).toMatchObject({ lng: 9, lat: 9 })
    expect(result.routes[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [9, 9],
      ],
    })
    expect(result.routes[0].legDistancesM).toBeNull()
  })

  it('osrm mode: leaves geometry stale (no OSRM request), still nulls legDistancesM', () => {
    const p = baseProject({ routes: [{ ...baseProject().routes[0], routingMode: 'osrm' }] })
    const staleGeometry = p.routes[0].geometry
    const result = withRouteWaypointPosition(p, 'r2', 9, 9)
    expect(result.routes[0].waypoints[1]).toMatchObject({ lng: 9, lat: 9 })
    expect(result.routes[0].geometry).toBe(staleGeometry) // untouched, deliberately stale
    expect(result.routes[0].legDistancesM).toBeNull()
  })

  it('no-op when there is no route', () => {
    const p = baseProject({ routes: [] })
    expect(withRouteWaypointPosition(p, 'r1', 9, 9)).toBe(p)
  })
})
