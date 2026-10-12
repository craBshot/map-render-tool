import { migrate } from './migrations'
import type { ProjectFile } from './types'

/** Marks a JSON file as ours, so a renamed or random .json is rejected instead of half-loaded. */
export const PROJECT_FILE_APP = 'map-render-tool'
export const PROJECT_FILE_EXTENSION = '.maprender.json'

export type ProjectFileErrorKind = 'notJson' | 'notProjectFile' | 'unsupported'

export class ProjectFileError extends Error {
  readonly kind: ProjectFileErrorKind
  constructor(kind: ProjectFileErrorKind) {
    super(`Invalid project file (${kind})`)
    this.name = 'ProjectFileError'
    this.kind = kind
  }
}

/** File content: identification header first, then the project exactly as stored. */
export function serializeProjectFile(project: ProjectFile, appVersion: string): string {
  return JSON.stringify({ app: PROJECT_FILE_APP, savedWith: appVersion, ...project }, null, 2)
}

/** Parses + migrates a saved file; throws ProjectFileError if it isn't a (supported) project of this app. */
export function parseProjectFile(text: string): ProjectFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new ProjectFileError('notJson')
  }
  if (typeof data !== 'object' || data === null || (data as { app?: unknown }).app !== PROJECT_FILE_APP) {
    throw new ProjectFileError('notProjectFile')
  }
  const { app: _app, savedWith: _savedWith, ...project } = data as Record<string, unknown>
  try {
    return migrate(project)
  } catch {
    throw new ProjectFileError('unsupported')
  }
}

/** The project name made safe for a file name on Windows/macOS/Linux; '' if nothing usable is left. */
export function safeFileBaseName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)
}

export function projectFileName(name: string, untitled: string): string {
  return `${safeFileBaseName(name) || untitled}${PROJECT_FILE_EXTENSION}`
}

/** Prefix for exported videos/image sequences: the project name, or the app name for untitled projects. */
export function exportFileBaseName(name: string): string {
  return safeFileBaseName(name) || 'map-render'
}
