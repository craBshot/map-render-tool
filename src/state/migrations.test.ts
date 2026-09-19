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
    areas: [],
    areaStyles: [
      {
        id: 's1',
        name: 'Transparent gefüllt',
        fill: { enabled: true, color: '#2f6bff', opacity: 0.25 },
        outline: { enabled: true, color: '#2f6bff', widthPx: 2, dashed: false },
        appear: { mode: 'start', fadeDurationSec: 0.6 },
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

    expect(migrated.version).toBe(5)
    expect(migrated.areas).toEqual([])
    expect(migrated.areaStyles).toHaveLength(2)
    expect(migrated.route).toBeNull()
  })

  it('migrates a v2 project (no route) all the way to the current version', () => {
    const v2 = { ...oldV4Project(), version: 2 } as Record<string, unknown>
    delete v2.route

    const migrated = migrate(v2)

    expect(migrated.version).toBe(5)
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

    expect(migrated.version).toBe(5)
    expect(migrated.route).not.toHaveProperty('profile')
    expect(migrated.route).not.toHaveProperty('drawSpeedKmh')
    expect(migrated.route?.drawDurationSec).toBe(3)
    expect(migrated.route?.waypoints).toEqual([{ lng: 0, lat: 0 }])
    expect(migrated.route?.appear).toEqual({ startSec: 1 }) // zoomStart resolved against holdStartSec=1
  })

  it('migrates a v3 project with no route (route: null) to the current version', () => {
    const v3 = { ...oldV4Project(), version: 3, route: null }
    const migrated = migrate(v3)
    expect(migrated.version).toBe(5)
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

    it('maps area style fadeDurationSec to fadeInSec, losslessly', () => {
      const migrated = migrate(oldV4Project())
      expect(migrated.areaStyles[0].appear).toEqual({ startSec: 0, fadeInSec: 0.6, holdSec: undefined, fadeOutSec: 0 })
    })

    it('every migrated marker/area appear has holdSec undefined and fadeOutSec 0 (lossless: stays visible exactly as before)', () => {
      const migrated = migrate(oldV4Project())
      expect(migrated.markers[0].appear.holdSec).toBeUndefined()
      expect(migrated.markers[0].appear.fadeOutSec).toBe(0)
      expect(migrated.areaStyles[0].appear.holdSec).toBeUndefined()
      expect(migrated.areaStyles[0].appear.fadeOutSec).toBe(0)
    })

    it('bumps the version to 5', () => {
      expect(migrate(oldV4Project()).version).toBe(5)
    })
  })
})
