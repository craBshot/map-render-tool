import { create } from 'zustand'

/**
 * Which Overpass candidate categories are offered when picking an area.
 * A tool preference, not project data — never part of ProjectFile (so it
 * doesn't travel with a shared/exported project), but persisted across
 * reloads since it's a genuine, lasting user choice. Nothing is ever
 * hardcoded out of reach here: every category the app knows about, plus
 * an "other" catch-all for anything unrecognized, stays toggleable.
 */
export interface AreaCandidateTypeSettings {
  administrative: boolean
  protected_area: boolean
  national_park: boolean
  nature_reserve: boolean
  postal_code: boolean
  political: boolean
  statistical: boolean
  religious_administration: boolean
  timezone: boolean
  public_transport: boolean
  other: boolean
}

const STORAGE_KEY = 'map-render-tool:settings'

export function defaultAreaCandidateTypeSettings(): AreaCandidateTypeSettings {
  return {
    administrative: true,
    protected_area: true,
    national_park: true,
    nature_reserve: true,
    postal_code: false,
    political: false,
    statistical: false,
    religious_administration: false,
    timezone: false,
    public_transport: false,
    other: false,
  }
}

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
