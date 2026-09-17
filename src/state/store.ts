import { create } from 'zustand'
import { loadPersistedProject, persistProject } from './persist'
import type { ProjectFile } from './types'

interface ProjectStore {
  project: ProjectFile
  setProject: (updater: (project: ProjectFile) => ProjectFile) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  project: loadPersistedProject(),
  setProject: (updater) =>
    set((state) => {
      const project = updater(state.project)
      persistProject(project)
      return { project }
    }),
}))
