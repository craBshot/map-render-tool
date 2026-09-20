import { describe, expect, it } from 'vitest'
import { migrate, UnsupportedProjectVersionError } from './migrations'

/**
 * A full, hardcoded v4-shape project — the old camera (start/end/timing)
 * and old appear (mode/atSec/popDurationSec|fadeDurationSec) shapes,
 * exactly as they looked right before the v4->v5 migration. Deliberately
 * NOT built from createDefaultProject(), which now returns the *current*
 * (v5+) shape — reusing it here would silently mislabel new-shape data as
 * old-version data and break every test in this file the moment the
 * schema changes again.
 */
function oldV4Project(): Record<string, unknown> {
  return {
    version: 4,
    camera: {
      start: { lng: 10, lat: 51, zr: 4 },
      end: { lng: 10, lat: 51, zr: 10 },
      timing: { holdStartSec: 1, zoomDurationSec: 4, holdEndSec: 2 },
    },
    style: { id: 'positron', labelDensity: 1, germanNames: true, hideMinorLabels: true },
    markers: [
      {
        id: 'm1',
        lng: 1,
        lat: 2,
        color: '#2f6bff',
        sizePx: 9,
        pulse: { enabled: true, periodSec: 1.6, scale: 3.2, strength: 0.45 },
        appear: { mode: 'zoomEnd', popDurationSec: 0.4 },
        visible: true,
      },
    ],
    areas: [
      {
        id: 'a1',
        name: 'Test Area',
        styleId: 's1',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        source: { osmType: 'way', osmId: 123 },
        visible: true,
      },
      {
        id: 'a2',
        name: 'Unstyled Area',
        styleId: null,
        geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
        source: { osmType: 'way', osmId: 456 },
        visible: true,
      },
    ],
    areaStyles: [
      {
        id: 's1',
        name: 'Transparent gefüllt',
        fill: { enabled: true, color: '#2f6bff', opacity: 0.25 },
        outline: { enabled: true, color: '#2f6bff', widthPx: 2, dashed: false },
        // Deliberately not 'start'/0.6 (the fallback default's values below) — distinct startSec
        // so the styled-vs-unstyled tests actually assert different outputs, not the same value
        // reached via two different code paths.
        appear: { mode: 'zoomStart', fadeDurationSec: 0.8 },
      },
    ],
    route: null,
    export: {
      resolution: { preset: '1920x1080', width: 1920, height: 1080 },
      fps: 30,
      format: 'mp4',
      quality: 0.35,
      showAttribution: true,
    },
  }
}

describe('migrate', () => {
  it('passes current-version data through unchanged', () => {
    // The current shape must migrate to itself as a no-op — build it via one full run of migrate()
    // on the old fixture rather than createDefaultProject(), so this test stays decoupled too.
    const current = migrate(oldV4Project())
    expect(migrate(current)).toEqual(current)
  })

  it('throws for data with no recognizable version', () => {
    expect(() => migrate({})).toThrow(UnsupportedProjectVersionError)
    expect(() => migrate(null)).toThrow(UnsupportedProjectVersionError)
  })

  it('throws for an unknown future version', () => {
    const project = { ...oldV4Project(), version: 999 }
    expect(() => migrate(project)).toThrow(UnsupportedProjectVersionError)
  })

  it('migrates a v1 project (no areas/areaStyles/route) all the way to the current version', () => {
    const v1 = { ...oldV4Project(), version: 1 } as Record<string, unknown>
    delete v1.areas
    delete v1.areaStyles
    delete v1.route

    const migrated = migrate(v1)

    expect(migrated.version).toBe(7)
    expect(migrated.areas).toEqual([])
    expect(migrated.areaStyles).toHaveLength(2)
    expect(migrated.route).toBeNull()
  })

  it('migrates a v2 project (no route) all the way to the current version', () => {
    const v2 = { ...oldV4Project(), version: 2 } as Record<string, unknown>
    delete v2.route

    const migrated = migrate(v2)

    expect(migrated.version).toBe(7)
    expect(migrated.route).toBeNull()
  })

  it('migrates a v3 project with a route (old profile/drawSpeedKmh shape) to the current version', () => {
    const v3 = {
      ...oldV4Project(),
      version: 3,
      route: {
        id: 'r1',
        waypoints: [{ lng: 0, lat: 0 }],
        routingMode: 'osrm',
        profile: 'walking',
        geometry: null,
        osrmDurationSec: null,
        color: '#e6572f',
        widthPx: 4,
        visible: true,
        appear: { mode: 'zoomStart' },
        reveal: 'progressive',
        drawSpeedKmh: 80,
      },
    }

    const migrated = migrate(v3)

    expect(migrated.version).toBe(7)
    expect(migrated.route).not.toHaveProperty('profile')
    expect(migrated.route).not.toHaveProperty('drawSpeedKmh')
    expect(migrated.route).not.toHaveProperty('reveal')
    expect(migrated.route).not.toHaveProperty('drawDurationSec')
    expect(migrated.route?.legDistancesM).toBeNull()
    expect(migrated.route?.waypoints).toHaveLength(1)
    expect(migrated.route?.waypoints[0]).toMatchObject({ lng: 0, lat: 0, holdSec: 0, travelSec: 0 })
    expect(typeof migrated.route?.waypoints[0].id).toBe('string')
    expect(migrated.route?.appear).toEqual({ startSec: 1 }) // zoomStart resolved against holdStartSec=1
  })

  it('migrates a v3 project with no route (route: null) to the current version', () => {
    const v3 = { ...oldV4Project(), version: 3, route: null }
    const migrated = migrate(v3)
    expect(migrated.version).toBe(7)
    expect(migrated.route).toBeNull()
  })

  describe('v4 -> v5: camera waypoints + plain-seconds appear timing', () => {
    it('converts camera {start,end,timing} into two waypoints carrying the old hold/travel split', () => {
      const migrated = migrate(oldV4Project())
      expect(migrated.camera.waypoints).toHaveLength(2)
      expect(migrated.camera.waypoints[0]).toMatchObject({ lng: 10, lat: 51, zr: 4, holdSec: 1, travelSec: 0 })
      expect(migrated.camera.waypoints[1]).toMatchObject({ lng: 10, lat: 51, zr: 10, holdSec: 2, travelSec: 4 })
      expect(typeof migrated.camera.waypoints[0].id).toBe('string')
      expect(migrated.camera.waypoints[0].id).not.toBe(migrated.camera.waypoints[1].id)
    })

    it.each([
      ['start', 0],
      ['zoomStart', 1], // holdStartSec
      ['zoomEnd', 5], // holdStartSec + zoomDurationSec
    ] as const)('resolves marker appear mode %s to startSec %d using the OLD camera timing', (mode, expectedStartSec) => {
      const data = oldV4Project()
      ;(data.markers as Array<Record<string, unknown>>)[0].appear = { mode, popDurationSec: 0.4 }
      const migrated = migrate(data)
      expect(migrated.markers[0].appear).toEqual({ startSec: expectedStartSec, fadeInSec: 0.4, holdSec: undefined, fadeOutSec: 0 })
    })

    it('resolves a custom atSec appear mode to that exact second', () => {
      const data = oldV4Project()
      ;(data.markers as Array<Record<string, unknown>>)[0].appear = { mode: 'custom', atSec: 2.5, popDurationSec: 0.2 }
      const migrated = migrate(data)
      expect(migrated.markers[0].appear.startSec).toBe(2.5)
    })

    it('every migrated marker appear has holdSec undefined and fadeOutSec 0 (lossless: stays visible exactly as before)', () => {
      const migrated = migrate(oldV4Project())
      expect(migrated.markers[0].appear.holdSec).toBeUndefined()
      expect(migrated.markers[0].appear.fadeOutSec).toBe(0)
    })
  })

  describe('v5 -> v6: area appear timing moved from the shared style to each area', () => {
    it("gives a styled area its style's exact old appear (fadeDurationSec -> fadeInSec, losslessly)", () => {
      const migrated = migrate(oldV4Project())
      const a1 = migrated.areas.find((a) => a.id === 'a1')
      // zoomStart resolved against holdStartSec=1 — distinct from the 0/0.6 default below.
      expect(a1?.appear).toEqual({ startSec: 1, fadeInSec: 0.8, holdSec: undefined, fadeOutSec: 0 })
    })

    it('gives an unstyled (styleId: null) area the default appear', () => {
      const migrated = migrate(oldV4Project())
      const a2 = migrated.areas.find((a) => a.id === 'a2')
      expect(a2?.appear).toEqual({ startSec: 0, fadeInSec: 0.6, holdSec: undefined, fadeOutSec: 0 })
    })

    it('falls back to the default appear when styleId points at a missing style (defensive)', () => {
      const data = oldV4Project()
      ;(data.areas as Array<Record<string, unknown>>)[0].styleId = 'does-not-exist'
      const migrated = migrate(data)
      const a1 = migrated.areas.find((a) => a.id === 'a1')
      expect(a1?.appear).toEqual({ startSec: 0, fadeInSec: 0.6, holdSec: undefined, fadeOutSec: 0 })
    })

    it('strips appear off every migrated areaStyles entry', () => {
      const migrated = migrate(oldV4Project())
      expect(migrated.areaStyles[0]).not.toHaveProperty('appear')
    })

    it('bumps the version to the current version', () => {
      expect(migrate(oldV4Project()).version).toBe(7)
    })
  })

  describe('v6 -> v7: route waypoints gain per-leg hold/travel timing', () => {
    function v6WithRoute(route: Record<string, unknown> | null): Record<string, unknown> {
      return { ...oldV4Project(), version: 6, route }
    }

    it('splits an old progressive route\'s drawDurationSec evenly across legs, first waypoint travelSec 0', () => {
      const migrated = migrate(
        v6WithRoute({
          id: 'r1',
          waypoints: [{ lng: 0, lat: 0 }, { lng: 1, lat: 1 }, { lng: 2, lat: 2 }],
          routingMode: 'osrm',
          geometry: null,
          osrmDurationSec: null,
          color: '#e6572f',
          widthPx: 4,
          visible: true,
          appear: { startSec: 1 },
          reveal: 'progressive',
          drawDurationSec: 6,
        }),
      )

      expect(migrated.version).toBe(7)
      expect(migrated.route?.waypoints).toHaveLength(3)
      expect(migrated.route?.waypoints[0]).toMatchObject({ lng: 0, lat: 0, holdSec: 0, travelSec: 0 })
      expect(migrated.route?.waypoints[1]).toMatchObject({ lng: 1, lat: 1, holdSec: 0, travelSec: 3 })
      expect(migrated.route?.waypoints[2]).toMatchObject({ lng: 2, lat: 2, holdSec: 0, travelSec: 3 })
      const ids = migrated.route?.waypoints.map((w) => w.id) ?? []
      expect(new Set(ids).size).toBe(3)
    })

    it("gives every leg travelSec 0 for an old instant-reveal route (exact behavioral match)", () => {
      const migrated = migrate(
        v6WithRoute({
          id: 'r1',
          waypoints: [{ lng: 0, lat: 0 }, { lng: 1, lat: 1 }],
          routingMode: 'straight',
          geometry: null,
          osrmDurationSec: null,
          color: '#e6572f',
          widthPx: 4,
          visible: true,
          appear: { startSec: 0 },
          reveal: 'instant',
          drawDurationSec: 3,
        }),
      )

      expect(migrated.route?.waypoints[1].travelSec).toBe(0)
    })

    it('sets legDistancesM to null and drops reveal/drawDurationSec', () => {
      const migrated = migrate(
        v6WithRoute({
          id: 'r1',
          waypoints: [{ lng: 0, lat: 0 }, { lng: 1, lat: 1 }],
          routingMode: 'osrm',
          geometry: null,
          osrmDurationSec: null,
          color: '#e6572f',
          widthPx: 4,
          visible: true,
          appear: { startSec: 0 },
          reveal: 'progressive',
          drawDurationSec: 4,
        }),
      )

      expect(migrated.route?.legDistancesM).toBeNull()
      expect(migrated.route).not.toHaveProperty('reveal')
      expect(migrated.route).not.toHaveProperty('drawDurationSec')
    })

    it('passes route: null through unchanged', () => {
      const migrated = migrate(v6WithRoute(null))
      expect(migrated.version).toBe(7)
      expect(migrated.route).toBeNull()
    })

    it('bumps the version to 7', () => {
      expect(migrate(v6WithRoute(null)).version).toBe(7)
    })
  })
})
