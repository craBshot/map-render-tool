import { describe, expect, it } from 'vitest'
import {
  exportFileBaseName,
  parseProjectFile,
  ProjectFileError,
  projectFileName,
  safeFileBaseName,
  serializeProjectFile,
} from './projectFile'
import { createDefaultMarker, createDefaultProject } from './types'

function errorKind(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (err) {
    return err instanceof ProjectFileError ? err.kind : 'other'
  }
  return undefined
}

describe('project files', () => {
  it('round-trips a project, with the identification header in the file but not in the loaded project', () => {
    const project = { ...createDefaultProject(), name: 'Harz', markers: [createDefaultMarker(10, 51)] }
    const text = serializeProjectFile(project, '0.9.0')
    expect(JSON.parse(text)).toMatchObject({ app: 'map-render-tool', savedWith: '0.9.0' })
    const loaded = parseProjectFile(text)
    expect(loaded).toEqual(project)
    expect(loaded).not.toHaveProperty('app')
    expect(loaded).not.toHaveProperty('savedWith')
  })

  it('migrates files saved by older versions', () => {
    const { name: _name, ...v8 } = createDefaultProject()
    const loaded = parseProjectFile(JSON.stringify({ app: 'map-render-tool', ...v8, version: 8 }))
    expect(loaded.name).toBe('')
  })

  it('rejects non-JSON, foreign JSON and unsupported versions with distinct errors', () => {
    expect(errorKind(() => parseProjectFile('not json {'))).toBe('notJson')
    expect(errorKind(() => parseProjectFile(JSON.stringify(createDefaultProject())))).toBe('notProjectFile') // no header
    expect(errorKind(() => parseProjectFile('[1, 2]'))).toBe('notProjectFile')
    expect(errorKind(() => parseProjectFile(JSON.stringify({ app: 'map-render-tool', version: 999 })))).toBe('unsupported')
  })

  it('builds safe file names', () => {
    expect(safeFileBaseName('  Harz: Tag 1/2  ')).toBe('Harz_ Tag 1_2')
    expect(safeFileBaseName('Reise...')).toBe('Reise')
    expect(projectFileName('Harz-Video', 'unbenannt')).toBe('Harz-Video.maprender.json')
    expect(projectFileName('  ', 'unbenannt')).toBe('unbenannt.maprender.json')
    expect(exportFileBaseName('')).toBe('map-render')
    expect(exportFileBaseName('Harz')).toBe('Harz')
  })
})
