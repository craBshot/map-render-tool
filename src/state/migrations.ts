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
