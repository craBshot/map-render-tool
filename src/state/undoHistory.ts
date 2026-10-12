/**
 * Snapshot undo/redo over the whole project state. Cheap because every edit produces a new
 * immutable ProjectFile that shares untouched parts (e.g. area geometries) with the previous one,
 * so keeping 100 snapshots doesn't copy 100 projects.
 */

export const HISTORY_LIMIT = 100

export interface History<T> {
  /** Oldest first; the last entry is the state right before the current one. */
  past: T[]
  /** Next redo first. */
  future: T[]
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] }
}

/** A new undo step whose "before" is `before`; any redo future is dropped. */
export function pushStep<T>(history: History<T>, before: T): History<T> {
  return { past: [...history.past, before].slice(-HISTORY_LIMIT), future: [] }
}

export function undoStep<T>(history: History<T>, current: T): { history: History<T>; state: T } | null {
  const previous = history.past.at(-1)
  if (previous === undefined) return null
  return { history: { past: history.past.slice(0, -1), future: [current, ...history.future] }, state: previous }
}

export function redoStep<T>(history: History<T>, current: T): { history: History<T>; state: T } | null {
  const [next, ...rest] = history.future
  if (next === undefined) return null
  return { history: { past: [...history.past, current].slice(-HISTORY_LIMIT), future: rest }, state: next }
}
