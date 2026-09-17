/**
 * Which Overpass candidate categories are offered when picking an area.
 * Kept in its own dependency-free module (no localStorage/Zustand) so pure
 * consumers like overpassClient.ts and its tests can import the type/
 * defaults without pulling in settingsStore.ts's browser-only side effects.
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
