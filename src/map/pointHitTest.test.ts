import { describe, expect, it } from 'vitest'
import type { ProjectFile } from '../state/types'
import { findSnapTarget, hitTestAnyKind, hitTestDraggable, kindForInteractionMode, pickNearest, type HitPoint, type Projector } from './pointHitTest'

// 1 lng/lat unit == 10px, no rotation/offset — enough to reason about distances without a real map.
const projector: Projector = { project: ([lng, lat]) => ({ x: lng * 10, y: lat * 10 }) }

function pt(kind: HitPoint['kind'], id: string, index: number, lng: number, lat: number): HitPoint {
  return { kind, id, index, lng, lat }
}

function project(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    version: 8,
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

describe('kindForInteractionMode', () => {
  it('maps marker/route/camera 1:1, area to null', () => {
    expect(kindForInteractionMode('marker')).toBe('marker')
    expect(kindForInteractionMode('route')).toBe('route')
    expect(kindForInteractionMode('camera')).toBe('camera')
    expect(kindForInteractionMode('area')).toBeNull()
  })
})

describe('pickNearest', () => {
  it('returns null when nothing is within radius', () => {
    const points = [pt('marker', 'a', 0, 100, 100)]
    expect(pickNearest(projector, points, { x: 0, y: 0 }, 10)).toBeNull()
  })

  it('returns the single candidate within radius', () => {
    const points = [pt('marker', 'a', 0, 1, 0)] // projects to (10, 0)
    expect(pickNearest(projector, points, { x: 10, y: 0 }, 5)?.id).toBe('a')
  })

  it('on an exact-distance tie, the later array element wins', () => {
    const points = [pt('marker', 'first', 0, 1, 0), pt('marker', 'second', 1, 1, 0)] // same lng/lat -> identical distance
    expect(pickNearest(projector, points, { x: 10, y: 0 }, 5)?.id).toBe('second')
  })

  it('returns the nearest when distances differ', () => {
    const points = [pt('marker', 'far', 0, 2, 0), pt('marker', 'near', 1, 1, 0)]
    expect(pickNearest(projector, points, { x: 10, y: 0 }, 20)?.id).toBe('near')
  })
})

describe('hitTestDraggable', () => {
  it('only returns points of the current mode\'s kind, even when a closer point of another kind exists', () => {
    const p = project({
      markers: [{ ...markerAt('m1', 0, 0) }],
      routes: [routeWith([{ id: 'r1', lng: 5, lat: 0, holdSec: 0, travelSec: 0 }])],
    })
    // Pointer is right on the marker (0,0 -> px 0,0); the route waypoint is far away.
    expect(hitTestDraggable('route', p, projector, { x: 0, y: 0 }, 5))
      .toBeNull() // marker is closer but wrong kind for 'route' mode — must not be picked up
    expect(hitTestDraggable('marker', p, projector, { x: 0, y: 0 }, 5)?.id).toBe('m1')
  })

  it('returns null for area mode', () => {
    const p = project({ markers: [markerAt('m1', 0, 0)] })
    expect(hitTestDraggable('area', p, projector, { x: 0, y: 0 }, 50)).toBeNull()
  })
})

describe('hitTestAnyKind', () => {
  it('finds the nearest point regardless of kind — not mode-scoped like hitTestDraggable', () => {
    const p = project({
      markers: [markerAt('m1', 0, 0)],
      routes: [routeWith([{ id: 'r1', lng: 5, lat: 0, holdSec: 0, travelSec: 0 }])],
    })
    expect(hitTestAnyKind(p, projector, { x: 0, y: 0 }, 5)?.id).toBe('m1')
    expect(hitTestAnyKind(p, projector, { x: 50, y: 0 }, 5)?.id).toBe('r1')
  })

  it('returns null when nothing is within radius', () => {
    const p = project({ markers: [markerAt('m1', 100, 100)] })
    expect(hitTestAnyKind(p, projector, { x: 0, y: 0 }, 5)).toBeNull()
  })
})

describe('findSnapTarget', () => {
  it('never returns a same-kind candidate, even when it is the objectively closest point', () => {
    const p = project({
      markers: [markerAt('closeMarker', 1, 0), markerAt('otherMarker', 1, 0)],
      camera: { waypoints: [{ id: 'c1', lng: 1.01, lat: 0, zr: 5, holdSec: 1, travelSec: 0 }] },
    })
    const target = findSnapTarget({ kind: 'marker' }, p, projector, { lng: 1, lat: 0 }, 50)
    expect(target?.kind).not.toBe('marker')
    expect(target?.id).toBe('c1')
  })

  it('returns null when the nearest other-type point is outside the radius', () => {
    const p = project({ camera: { waypoints: [{ id: 'c1', lng: 10, lat: 10, zr: 5, holdSec: 1, travelSec: 0 }] } })
    expect(findSnapTarget({ kind: 'marker' }, p, projector, { lng: 0, lat: 0 }, 5)).toBeNull()
  })

  it("snaps a route point onto ANOTHER route's waypoint, never onto its own route's", () => {
    const p = project({
      routes: [
        routeWith([{ id: 'own', lng: 1, lat: 0, holdSec: 0, travelSec: 0 }], 'routeA'),
        routeWith([{ id: 'foreign', lng: 1.2, lat: 0, holdSec: 0, travelSec: 0 }], 'routeB'),
      ],
    })
    // Own waypoint is closer (distance 0) but excluded — the other route's end point wins.
    const target = findSnapTarget({ kind: 'route', ownerId: 'routeA' }, p, projector, { lng: 1, lat: 0 }, 50)
    expect(target).toMatchObject({ kind: 'route', id: 'foreign', ownerId: 'routeB' })
  })

  it('a brand-new route (no owner yet) can snap onto any existing route waypoint', () => {
    const p = project({ routes: [routeWith([{ id: 'w1', lng: 1, lat: 0, holdSec: 0, travelSec: 0 }], 'routeA')] })
    expect(findSnapTarget({ kind: 'route' }, p, projector, { lng: 1, lat: 0 }, 50)?.id).toBe('w1')
  })
})

function markerAt(id: string, lng: number, lat: number) {
  return {
    id,
    lng,
    lat,
    color: '#2f6bff',
    sizePx: 9,
    pulse: { enabled: true, periodSec: 1.6, scale: 3.2, strength: 0.45 },
    appear: { startSec: 0, fadeInSec: 0.4, holdSec: undefined, fadeOutSec: 0 },
    visible: true,
  }
}

function routeWith(waypoints: { id: string; lng: number; lat: number; holdSec: number; travelSec: number }[], id = 'route1') {
  return {
    id,
    waypoints,
    routingMode: 'straight' as const,
    geometry: null,
    osrmDurationSec: null,
    legDistancesM: null,
    color: '#e6572f',
    widthPx: 4,
    visible: true,
    appear: { startSec: 0 },
  }
}
