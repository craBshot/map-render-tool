import { create } from 'zustand'
import type { MapController } from '../map/MapController'
import { loadLayoutPrefs, persistLayoutPrefs } from './layoutPersist'

const SIDEBAR_WIDTH_MIN = 260
const SIDEBAR_WIDTH_MAX = 600
const TIMELINE_HEIGHT_MIN = 120
const TIMELINE_HEIGHT_MAX = 500

export type PointInteractionMode = 'marker' | 'area' | 'route' | 'camera'

/** A point being placed or dragged on the map — the 3 types drag/snap operate over (areas are polygons, not points, so excluded). */
export type DraggablePointKind = 'marker' | 'route' | 'camera'

/** One entry per collapsible Sidebar section (see CollapsibleSection.tsx) — keyed by the panel it belongs to. */
export type SidebarSectionKey = 'search' | 'camera' | 'style' | 'marker' | 'areas' | 'areaStyles' | 'route' | 'export' | 'areaTypes' | 'project'

/** Everything double-click-to-edit (pointDoubleClick.ts) can land on — a superset of DraggablePointKind, since areas (and the route line itself) are double-click targets too despite not being draggable points. */
export type EditableKind = DraggablePointKind | 'area'

const DEFAULT_OPEN_SIDEBAR_SECTIONS: Record<SidebarSectionKey, boolean> = {
  search: false,
  // Sidebar.tsx only ever renders one of camera/marker/route (or the 3 area panels) at a time,
  // matching the current interaction mode — so each mode's PRIMARY panel defaults open (no extra
  // click needed for the one thing that's already contextually relevant). areaStyles/areaTypes
  // are secondary/config panels within the area-mode group and stay collapsed either way.
  camera: true,
  style: false,
  marker: true,
  areas: true,
  areaStyles: false,
  route: true,
  export: false,
  areaTypes: false,
  project: false,
}

/**
 * Ephemeral editor/UI state that must never end up in ProjectFile — it has
 * no bearing on a rendered frame (crosshair visibility, current playback
 * position, whether export currently has the UI locked, the live
 * MapController instance sidebar panels use for imperative actions like
 * "use current view" or "go to").
 */
interface EditorStore {
  playbackTimeSec: number
  setPlaybackTimeSec: (sec: number) => void
  /** True while the preview is animating — hides crosshair/readout, unlike locked. */
  playing: boolean
  setPlaying: (playing: boolean) => void
  crosshairVisible: boolean
  setCrosshairVisible: (visible: boolean) => void
  /** True during export — also disables pointer interaction with the map. */
  locked: boolean
  setLocked: (locked: boolean) => void
  controller: MapController | null
  setController: (controller: MapController | null) => void
  /** What a right-click on the map currently does — set/move the marker, look up an area, extend the route, or add a camera waypoint. */
  pointInteractionMode: PointInteractionMode
  setPointInteractionMode: (mode: PointInteractionMode) => void
  /** Set by a right-click while in 'area' mode; AreaListPanel reacts to it and clears it when done. */
  pendingAreaPick: { lng: number; lat: number } | null
  setPendingAreaPick: (pick: { lng: number; lat: number } | null) => void
  /** Set by clicking a Timeline bar — the matching sidebar card highlights/scrolls into view. */
  selectedObjectId: string | null
  setSelectedObjectId: (id: string | null) => void
  /**
   * Live position of a point currently being dragged on the map canvas —
   * set on mousedown-hit, updated on every mousemove, cleared on mouseup.
   * Deliberately not project state: written once per gesture (on drop),
   * not once per frame (see pointDrag.ts) — the project store's setProject
   * synchronously persists to localStorage on every call.
   */
  dragPreview: { kind: DraggablePointKind; id: string; lng: number; lat: number; snapped: boolean } | null
  setDragPreview: (preview: EditorStore['dragPreview']) => void
  /** Result of the last project save/open (button or drag & drop), shown in ProjectPanel. */
  projectFileMessage: { text: string; isError: boolean } | null
  setProjectFileMessage: (message: EditorStore['projectFileMessage']) => void
  /** Which Sidebar sections are expanded — not persisted, resets to DEFAULT_OPEN_SIDEBAR_SECTIONS on reload. */
  openSidebarSections: Record<SidebarSectionKey, boolean>
  setSidebarSectionOpen: (key: SidebarSectionKey, open: boolean) => void
  /**
   * Set by double-clicking a map point/area/route-leg (see pointDoubleClick.ts)
   * — the matching field in the matching panel focuses itself and selects its
   * current text, then clears this back to null itself (a one-shot signal,
   * not a persistent "this field is focused" state). `field` distinguishes a
   * route waypoint hit (undefined -> hold time) from a route LEG hit
   * ('travelSec' -> the arriving waypoint's travel time); unused by the other
   * kinds, which each have only one field to jump to.
   */
  focusFieldRequest: { kind: EditableKind; id: string; field?: 'travelSec' } | null
  setFocusFieldRequest: (request: EditorStore['focusFieldRequest']) => void
  /** Window-layout preference (not project content) — persisted separately, see layoutPersist.ts. */
  sidebarWidthPx: number
  setSidebarWidthPx: (px: number) => void
  /** null = today's default auto/content-sized height. */
  timelineHeightPx: number | null
  setTimelineHeightPx: (px: number | null) => void
}

const initialLayout = loadLayoutPrefs()

export const useEditorStore = create<EditorStore>((set, get) => ({
  playbackTimeSec: 0,
  setPlaybackTimeSec: (sec) => set({ playbackTimeSec: sec }),
  playing: false,
  setPlaying: (playing) => set({ playing }),
  crosshairVisible: true,
  setCrosshairVisible: (visible) => set({ crosshairVisible: visible }),
  locked: false,
  setLocked: (locked) => set({ locked }),
  controller: null,
  setController: (controller) => set({ controller }),
  pointInteractionMode: 'marker',
  setPointInteractionMode: (mode) => set({ pointInteractionMode: mode }),
  pendingAreaPick: null,
  setPendingAreaPick: (pick) => set({ pendingAreaPick: pick }),
  selectedObjectId: null,
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),
  dragPreview: null,
  setDragPreview: (preview) => set({ dragPreview: preview }),
  projectFileMessage: null,
  setProjectFileMessage: (message) => set({ projectFileMessage: message }),
  openSidebarSections: DEFAULT_OPEN_SIDEBAR_SECTIONS,
  setSidebarSectionOpen: (key, open) => set((state) => ({ openSidebarSections: { ...state.openSidebarSections, [key]: open } })),
  focusFieldRequest: null,
  setFocusFieldRequest: (request) => set({ focusFieldRequest: request }),
  sidebarWidthPx: initialLayout.sidebarWidthPx,
  setSidebarWidthPx: (px) => {
    const sidebarWidthPx = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, px))
    set({ sidebarWidthPx })
    persistLayoutPrefs({ sidebarWidthPx, timelineHeightPx: get().timelineHeightPx })
  },
  timelineHeightPx: initialLayout.timelineHeightPx,
  setTimelineHeightPx: (px) => {
    const timelineHeightPx = px === null ? null : Math.min(TIMELINE_HEIGHT_MAX, Math.max(TIMELINE_HEIGHT_MIN, px))
    set({ timelineHeightPx })
    persistLayoutPrefs({ sidebarWidthPx: get().sidebarWidthPx, timelineHeightPx })
  },
}))
