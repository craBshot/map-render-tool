import { create } from 'zustand'
import {
  defaultAreaCandidateTypeSettings,
  type AreaCandidateTypeSettings,
} from './areaCandidateTypeSettings'

export type { AreaCandidateTypeSettings } from './areaCandidateTypeSettings'
export { defaultAreaCandidateTypeSettings } from './areaCandidateTypeSettings'

const STORAGE_KEY = 'map-render-tool:settings'

function loadAreaCandidateTypeSettings(): AreaCandidateTypeSettings {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return defaultAreaCandidateTypeSettings()
  try {
    // Merged over the defaults so a category added later still gets a
    // sane value for users who already have a persisted settings blob.
    return { ...defaultAreaCandidateTypeSettings(), ...JSON.parse(raw) }
  } catch {
    return defaultAreaCandidateTypeSettings()
  }
}

function persistAreaCandidateTypeSettings(settings: AreaCandidateTypeSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

interface SettingsStore {
  areaCandidateTypes: AreaCandidateTypeSettings
  setAreaCandidateTypeEnabled: (kind: keyof AreaCandidateTypeSettings, enabled: boolean) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  areaCandidateTypes: loadAreaCandidateTypeSettings(),
  setAreaCandidateTypeEnabled: (kind, enabled) =>
    set((state) => {
      const areaCandidateTypes = { ...state.areaCandidateTypes, [kind]: enabled }
      persistAreaCandidateTypeSettings(areaCandidateTypes)
      return { areaCandidateTypes }
    }),
}))
