import { createDefaultAreaStyles, generateId, PROJECT_VERSION, type ProjectFile } from './types'

type Migration = (data: unknown) => unknown

/**
 * Keyed by the version a project is migrating *from*. Each migration
 * upgrades data one version forward; migrate() chains them until the data
 * reaches PROJECT_VERSION. Add a new entry here whenever the data format
 * changes so old project files keep loading.
 */
const migrations: Record<number, Migration> = {
  // v1 -> v2: added areas/areaStyles (region highlighting).
  1: (data) => ({
    ...(data as object),
    version: 2,
    areas: [],
    areaStyles: createDefaultAreaStyles(),
  }),
  // v2 -> v3: added route (single route, drawn progressively).
  2: (data) => ({
    ...(data as object),
    version: 3,
    route: null,
  }),
  // v3 -> v4: dropped the route profile (driving/walking/cycling made no
  // difference on the public OSRM demo server — verified live), and
  // switched the progressive draw from a simulated speed (km/h) to a fixed
  // duration in seconds.
  3: (data) => {
    const d = data as { route: Record<string, unknown> | null }
    let route: Record<string, unknown> | null = null
    if (d.route) {
      route = { ...d.route, drawDurationSec: 3 }
      delete route.profile
      delete route.drawSpeedKmh
    }
    return { ...(data as object), version: 4, route }
  },
  // v4 -> v5: camera became a waypoint chain instead of a fixed start/end +
  // three timing fields; marker/area appear.mode was replaced by plain
  // absolute-second timing (startSec/fadeInSec/holdSec/fadeOutSec) since
  // 'zoomStart'/'zoomEnd' no longer name one canonical phase once the
  // camera can have any number of waypoints. Resolves every old appear
  // using the OLD mode-resolution logic against the OLD camera timing,
  // one last time, before those fields are discarded — lossless.
  4: (data) => {
    const d = data as {
      camera: {
        start: { lng: number; lat: number; zr: number }
        end: { lng: number; lat: number; zr: number }
        timing: { holdStartSec: number; zoomDurationSec: number; holdEndSec: number }
      }
      markers: Array<Record<string, unknown> & { appear: { mode: string; atSec?: number; popDurationSec: number } }>
      areaStyles: Array<Record<string, unknown> & { appear: { mode: string; atSec?: number; fadeDurationSec: number } }>
      route: (Record<string, unknown> & { appear: { mode: string; atSec?: number } }) | null
    }

    const { holdStartSec, zoomDurationSec, holdEndSec } = d.camera.timing
    const oldAppearTimeSec = (appear: { mode: string; atSec?: number }): number => {
      switch (appear.mode) {
        case 'start':
          return 0
        case 'zoomStart':
          return holdStartSec
        case 'zoomEnd':
          return holdStartSec + zoomDurationSec
        case 'custom':
          return Math.max(0, appear.atSec ?? 0)
        default:
          return 0
      }
    }

    const waypoints = [
      { id: generateId(), ...d.camera.start, holdSec: holdStartSec, travelSec: 0 },
      { id: generateId(), ...d.camera.end, holdSec: holdEndSec, travelSec: zoomDurationSec },
    ]

    const markers = d.markers.map((m) => ({
      ...m,
      appear: { startSec: oldAppearTimeSec(m.appear), fadeInSec: m.appear.popDurationSec, holdSec: undefined, fadeOutSec: 0 },
    }))
    const areaStyles = d.areaStyles.map((s) => ({
      ...s,
      appear: { startSec: oldAppearTimeSec(s.appear), fadeInSec: s.appear.fadeDurationSec, holdSec: undefined, fadeOutSec: 0 },
    }))
    const route = d.route ? { ...d.route, appear: { startSec: oldAppearTimeSec(d.route.appear) } } : null

    return { ...(data as object), version: 5, camera: { waypoints }, markers, areaStyles, route }
  },
}

export class UnsupportedProjectVersionError extends Error {
  constructor(version: unknown) {
    super(`Unsupported project version: ${String(version)}`)
    this.name = 'UnsupportedProjectVersionError'
  }
}

export function migrate(data: unknown): ProjectFile {
  if (typeof data !== 'object' || data === null || !('version' in data)) {
    throw new UnsupportedProjectVersionError(undefined)
  }

  let current = data as { version: number }
  while (current.version < PROJECT_VERSION) {
    const migration = migrations[current.version]
    if (!migration) {
      throw new UnsupportedProjectVersionError(current.version)
    }
    current = migration(current) as { version: number }
  }

  if (current.version !== PROJECT_VERSION) {
    throw new UnsupportedProjectVersionError(current.version)
  }

  return current as unknown as ProjectFile
}
