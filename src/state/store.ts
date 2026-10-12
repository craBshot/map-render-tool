import { create } from 'zustand'
import { loadPersistedProject, persistProject } from './persist'
import type { ProjectFile } from './types'
import { emptyHistory, pushStep, redoStep, undoStep, type History } from './undoHistory'

/**
 * Changes this close together (and with no pointerdown in between, see breakUndoStep) merge into
 * one undo step — typing "12.5" into a field is one step, not four. A drag is one pointerdown
 * followed by a stream of changes, so it stays one step however long it takes.
 */
const COALESCE_MS = 1000

interface ProjectStore {
  project: ProjectFile
  history: History<ProjectFile>
  setProject: (updater: (project: ProjectFile) => ProjectFile) => void
  undo: () => void
  redo: () => void
  /** The next setProject starts a new undo step. Called on every pointerdown (App.tsx). */
  breakUndoStep: () => void
}

let stepOpen = false
let lastChangeAt = 0

export const useProjectStore = create<ProjectStore>((set) => ({
  project: loadPersistedProject(),
  history: emptyHistory(),
  setProject: (updater) =>
    set((state) => {
      const project = updater(state.project)
      if (project === state.project) return state
      const now = performance.now()
      const merge = stepOpen && now - lastChangeAt < COALESCE_MS
      stepOpen = true
      lastChangeAt = now
      persistProject(project)
      return { project, history: merge ? state.history : pushStep(state.history, state.project) }
    }),
  undo: () =>
    set((state) => {
      const result = undoStep(state.history, state.project)
      if (!result) return state
      stepOpen = false
      persistProject(result.state)
      return { project: result.state, history: result.history }
    }),
  redo: () =>
    set((state) => {
      const result = redoStep(state.history, state.project)
      if (!result) return state
      stepOpen = false
      persistProject(result.state)
      return { project: result.state, history: result.history }
    }),
  breakUndoStep: () => {
    stepOpen = false
  },
}))
