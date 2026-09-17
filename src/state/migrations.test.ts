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

  it('migrates a v1 project (no areas/areaStyles) to v2', () => {
    const current = createDefaultProject()
    const v1 = { ...current, version: 1 } as Record<string, unknown>
    delete v1.areas
    delete v1.areaStyles

    const migrated = migrate(v1)

    expect(migrated.version).toBe(2)
    expect(migrated.areas).toEqual([])
    expect(migrated.areaStyles).toHaveLength(2)
  })
})
