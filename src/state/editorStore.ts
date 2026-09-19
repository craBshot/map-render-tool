import { create } from 'zustand'
import type { MapController } from '../map/MapController'

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
  pointInteractionMode: 'marker' | 'area' | 'route' | 'camera'
  setPointInteractionMode: (mode: 'marker' | 'area' | 'route' | 'camera') => void
  /** Set by a right-click while in 'area' mode; AreaListPanel reacts to it and clears it when done. */
  pendingAreaPick: { lng: number; lat: number } | null
  setPendingAreaPick: (pick: { lng: number; lat: number } | null) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
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
}))
