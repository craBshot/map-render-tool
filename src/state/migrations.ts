import { generateId, PROJECT_VERSION, type ProjectFile } from './types'

type Migration = (data: unknown) => unknown

/**
 * Keyed by the version a project is migrating *from*. Each migration
 * upgrades data one version forward; migrate() chains them until the data
 * reaches PROJECT_VERSION. Add a new entry here whenever the data format
 * changes so old project files keep loading.
 */
const migrations: Record<number, Migration> = {
  // v1 -> v2: added areas/areaStyles (region highlighting). Seeds the two
  // default styles in their AT-THE-TIME (v2-v5) shape, appear included —
  // deliberately NOT createDefaultAreaStyles() from types.ts, which now
  // returns the CURRENT (v6+) shape with no appear on the style at all.
  // Reusing that live factory here would seed a shape the later v4->v5
  // step (which still reads style.appear) can't process.
  1: (data) => ({
    ...(data as object),
    version: 2,
    areas: [],
    areaStyles: [
      {
        id: generateId(),
        name: 'Transparent gefüllt',
        fill: { enabled: true, color: '#2f6bff', opacity: 0.25 },
        outline: { enabled: true, color: '#2f6bff', widthPx: 2, dashed: false },
        appear: { mode: 'start', fadeDurationSec: 0.6 },
      },
      {
        id: generateId(),
        name: 'Gestrichelte Umrandung',
        fill: { enabled: false, color: '#2f6bff', opacity: 0.25 },
        outline: { enabled: true, color: '#2f6bff', widthPx: 2, dashed: true },
        appear: { mode: 'start', fadeDurationSec: 0.6 },
      },
    ],
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
  // v5 -> v6: area appear/hold/fade timing moved from the shared AreaStyle
  // onto each AreaObject individually — multiple areas sharing one style
  // used to share one timeline row/one set of timing, which reads wrong
  // for a per-object timeline. Resolves each area's style's OLD appear
  // onto the area, losslessly, before AreaStyle.appear is discarded.
  5: (data) => {
    const DEFAULT_APPEAR = { startSec: 0, fadeInSec: 0.6, holdSec: undefined, fadeOutSec: 0 }
    const d = data as {
      areas: Array<Record<string, unknown> & { styleId: string | null }>
      areaStyles: Array<Record<string, unknown> & { id: string; appear: unknown }>
    }
    const styleById = new Map(d.areaStyles.map((s) => [s.id, s]))

    const areas = d.areas.map((a) => {
      const style = a.styleId !== null ? styleById.get(a.styleId) : undefined
      return { ...a, appear: style ? style.appear : DEFAULT_APPEAR }
    })
    const areaStyles = d.areaStyles.map((s) => {
      const rest = { ...s }
      delete rest.appear
      return rest
    })

    return { ...(data as object), version: 6, areas, areaStyles }
  },
  // v6 -> v7: route waypoints gained per-leg hold/travel timing (id,
  // holdSec, travelSec), replacing the single combined reveal/
  // drawDurationSec pair — routes now draw as a waypoint chain, same model
  // as the camera, so a specific waypoint's arrival time is knowable (needed
  // to sync the route draw with the camera flight). travelSec is split
  // evenly across legs from the old drawDurationSec (a reasonable default,
  // not proportional to leg length — the OSRM leg distances needed for that
  // aren't in the old saved shape; users can retune via the new per-leg UI).
  // reveal === 'instant' maps exactly (every leg's travelSec: 0).
  6: (data) => {
    const d = data as {
      route:
        | (Record<string, unknown> & {
            waypoints: Array<{ lng: number; lat: number }>
            reveal: 'instant' | 'progressive'
            drawDurationSec: number
          })
        | null
    }
    let route: Record<string, unknown> | null = null
    if (d.route) {
      const legCount = Math.max(1, d.route.waypoints.length - 1)
      const perLegTravelSec = d.route.reveal === 'instant' ? 0 : d.route.drawDurationSec / legCount
      const waypoints = d.route.waypoints.map((w, i) => ({
        id: generateId(),
        lng: w.lng,
        lat: w.lat,
        holdSec: 0,
        travelSec: i === 0 ? 0 : perLegTravelSec,
      }))
      route = { ...d.route, waypoints, legDistancesM: null }
      delete route.reveal
      delete route.drawDurationSec
    }
    return { ...(data as object), version: 7, route }
  },
  // v7 -> v8: one route per project became a list (multiple routes, e.g. a street leg
  // followed by a straight-line leg in another color). The old single route becomes routes[0].
  7: (data) => {
    const { route, ...rest } = data as { route: Record<string, unknown> | null }
    return { ...rest, version: 8, routes: route ? [route] : [] }
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
