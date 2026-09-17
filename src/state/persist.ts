import { migrate } from './migrations'
import { createDefaultProject, type ProjectFile } from './types'

const STORAGE_KEY = 'map-render-tool:project'

export function loadPersistedProject(): ProjectFile {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return createDefaultProject()

  try {
    return migrate(JSON.parse(raw))
  } catch {
    return createDefaultProject()
  }
}

export function persistProject(project: ProjectFile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
}
