import { describe, expect, it } from 'vitest'
import { createDefaultProject } from './types'
import { migrate, UnsupportedProjectVersionError } from './migrations'

describe('migrate', () => {
  it('passes current-version data through unchanged', () => {
    const project = createDefaultProject()
    expect(migrate(project)).toEqual(project)
  })

  it('throws for data with no recognizable version', () => {
    expect(() => migrate({})).toThrow(UnsupportedProjectVersionError)
    expect(() => migrate(null)).toThrow(UnsupportedProjectVersionError)
  })

  it('throws for an unknown future version', () => {
    const project = { ...createDefaultProject(), version: 999 }
    expect(() => migrate(project)).toThrow(UnsupportedProjectVersionError)
  })

  it('migrates a v1 project (no areas/areaStyles/route) all the way to the current version', () => {
    const current = createDefaultProject()
    const v1 = { ...current, version: 1 } as Record<string, unknown>
    delete v1.areas
    delete v1.areaStyles
    delete v1.route

    const migrated = migrate(v1)

    expect(migrated.version).toBe(4)
    expect(migrated.areas).toEqual([])
    expect(migrated.areaStyles).toHaveLength(2)
    expect(migrated.route).toBeNull()
  })

  it('migrates a v2 project (no route) all the way to the current version', () => {
    const current = createDefaultProject()
    const v2 = { ...current, version: 2 } as Record<string, unknown>
    delete v2.route

    const migrated = migrate(v2)

    expect(migrated.version).toBe(4)
    expect(migrated.route).toBeNull()
  })

  it('migrates a v3 project with a route (old profile/drawSpeedKmh shape) to v4', () => {
    const current = createDefaultProject()
    const v3 = {
      ...current,
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

    expect(migrated.version).toBe(4)
    expect(migrated.route).not.toHaveProperty('profile')
    expect(migrated.route).not.toHaveProperty('drawSpeedKmh')
    expect(migrated.route?.drawDurationSec).toBe(3)
    expect(migrated.route?.waypoints).toEqual([{ lng: 0, lat: 0 }])
  })

  it('migrates a v3 project with no route (route: null) to v4', () => {
    const current = createDefaultProject()
    const v3 = { ...current, version: 3, route: null }

    const migrated = migrate(v3)

    expect(migrated.version).toBe(4)
    expect(migrated.route).toBeNull()
  })
})
