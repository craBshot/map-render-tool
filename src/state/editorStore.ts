import { create } from 'zustand'

/**
 * Ephemeral editor/UI state that must never end up in ProjectFile — it has
 * no bearing on a rendered frame (crosshair visibility, current playback
 * position, whether export currently has the UI locked).
 */
interface EditorStore {
  playbackTimeSec: number
  setPlaybackTimeSec: (sec: number) => void
  crosshairVisible: boolean
  setCrosshairVisible: (visible: boolean) => void
  locked: boolean
  setLocked: (locked: boolean) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  playbackTimeSec: 0,
  setPlaybackTimeSec: (sec) => set({ playbackTimeSec: sec }),
  crosshairVisible: false,
  setCrosshairVisible: (visible) => set({ crosshairVisible: visible }),
  locked: false,
  setLocked: (locked) => set({ locked }),
}))
