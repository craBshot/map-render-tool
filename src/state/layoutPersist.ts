/**
 * Sidebar width / Timeline height are a pure window-layout preference —
 * never part of ProjectFile, which is animation data meant to be exported/
 * shared, not a record of how one particular viewer likes their window
 * arranged. Persisted separately, mirroring persist.ts's project-persist
 * pattern but under its own localStorage key.
 */

export interface LayoutPrefs {
  sidebarWidthPx: number
  /** null = today's default auto/content-sized height. */
  timelineHeightPx: number | null
}

const STORAGE_KEY = 'map-render-tool:layout'

const DEFAULT_LAYOUT: LayoutPrefs = { sidebarWidthPx: 330, timelineHeightPx: null }

export function loadLayoutPrefs(): LayoutPrefs {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_LAYOUT
  try {
    const parsed = JSON.parse(raw) as Partial<LayoutPrefs>
    return {
      sidebarWidthPx: typeof parsed.sidebarWidthPx === 'number' ? parsed.sidebarWidthPx : DEFAULT_LAYOUT.sidebarWidthPx,
      timelineHeightPx: typeof parsed.timelineHeightPx === 'number' ? parsed.timelineHeightPx : null,
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function persistLayoutPrefs(prefs: LayoutPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}
