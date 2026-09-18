import { createDefaultAreaStyles, PROJECT_VERSION, type ProjectFile } from './types'

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
