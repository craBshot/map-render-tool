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
  crosshairVisible: boolean
  setCrosshairVisible: (visible: boolean) => void
  locked: boolean
  setLocked: (locked: boolean) => void
  controller: MapController | null
  setController: (controller: MapController | null) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  playbackTimeSec: 0,
  setPlaybackTimeSec: (sec) => set({ playbackTimeSec: sec }),
  crosshairVisible: true,
  setCrosshairVisible: (visible) => set({ crosshairVisible: visible }),
  locked: false,
  setLocked: (locked) => set({ locked }),
  controller: null,
  setController: (controller) => set({ controller }),
}))
