import { create } from 'zustand'
import { extendCameraToFit, type TimedObject } from '../timeline/autoExtend'
import { loadPersistedProject, persistProject } from './persist'
import type { ProjectFile } from './types'
import { emptyHistory, pushStep, redoStep, undoStep, type History } from './undoHistory'

/**
 * Changes this close together (and with no pointerdown in between, see pointerDown) merge into
 * one undo step — typing "12.5" into a field is one step, not four. A drag is one pointerdown
 * followed by a stream of changes, so it stays one step however long it takes.
 */
const COALESCE_MS = 1000

/** Shown as a toast: the camera flight was lengthened because `cause` ran past the old end. */
export interface AutoExtendNotice {
  /** Bumped on every extension, so the toast restarts its timer. */
  seq: number
  totalSec: number
  cause: TimedObject
}

interface ProjectStore {
  project: ProjectFile
  history: History<ProjectFile>
  autoExtendNotice: AutoExtendNotice | null
  setProject: (updater: (project: ProjectFile) => ProjectFile) => void
  /** Replaces the whole project (opened file) as one undo step, exactly as loaded — never auto-extended. */
  replaceProject: (project: ProjectFile) => void
  undo: () => void
  redo: () => void
  /** Pointer pressed: the next setProject starts a new undo step; auto-extend waits for pointerUp. */
  pointerDown: () => void
  /** Pointer released: applies a camera extension the gesture made necessary (same undo step). */
  pointerUp: () => void
  dismissAutoExtendNotice: () => void
}

let stepOpen = false
let lastChangeAt = 0
/**
 * Project at the last pointerdown, while the pointer is held. During a drag the camera flight must
 * not grow under the cursor (the Timeline's px->sec scale would shift and feed back into the drag),
 * so extending is deferred to pointerUp and judged against this starting point.
 */
let gestureStart: ProjectFile | null = null
let noticeSeq = 0

function notice(totalSec: number, cause: TimedObject): AutoExtendNotice {
  return { seq: ++noticeSeq, totalSec, cause }
}

export const useProjectStore = create<ProjectStore>((set) => ({
  project: loadPersistedProject(),
  history: emptyHistory(),
  autoExtendNotice: null,
  setProject: (updater) =>
    set((state) => {
      const updated = updater(state.project)
      if (updated === state.project) return state
      const extension = gestureStart ? null : extendCameraToFit(state.project, updated)
      const project = extension?.project ?? updated
      const now = performance.now()
      const merge = stepOpen && now - lastChangeAt < COALESCE_MS
      stepOpen = true
      lastChangeAt = now
      persistProject(project)
      return {
        project,
        history: merge ? state.history : pushStep(state.history, state.project),
        ...(extension && { autoExtendNotice: notice(extension.totalSec, extension.cause) }),
      }
    }),
  replaceProject: (project) =>
    set((state) => {
      stepOpen = false
      persistProject(project)
      return { project, history: pushStep(state.history, state.project), autoExtendNotice: null }
    }),
  undo: () =>
    set((state) => {
      const result = undoStep(state.history, state.project)
      if (!result) return state
      stepOpen = false
      persistProject(result.state)
      return { project: result.state, history: result.history, autoExtendNotice: null }
    }),
  redo: () =>
    set((state) => {
      const result = redoStep(state.history, state.project)
      if (!result) return state
      stepOpen = false
      persistProject(result.state)
      return { project: result.state, history: result.history }
    }),
  pointerDown: () => {
    stepOpen = false
    gestureStart = useProjectStore.getState().project
  },
  pointerUp: () => {
    const start = gestureStart
    gestureStart = null
    if (!start) return
    set((state) => {
      const extension = extendCameraToFit(start, state.project)
      if (!extension) return state
      persistProject(extension.project)
      // No pushStep: the extension belongs to the undo step the gesture's own edits already opened.
      return { project: extension.project, autoExtendNotice: notice(extension.totalSec, extension.cause) }
    })
  },
  dismissAutoExtendNotice: () => set({ autoExtendNotice: null }),
}))
