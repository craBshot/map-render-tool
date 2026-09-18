import type { AreaCandidateTypeSettings } from '../state/areaCandidateTypeSettings.ts'
import { overpassElementToPolygon, type OverpassElement } from './overpassGeometry.ts'

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'

export interface OverpassRawTagElement {
  type: 'way' | 'relation' | 'node'
  id: number
  tags?: Record<string, string>
}

export interface OverpassCandidate {
  osmType: 'way' | 'relation'
  osmId: number
  name: string
  kind: keyof AreaCandidateTypeSettings
  adminLevel?: number
}

function classify(tags: Record<string, string>): keyof AreaCandidateTypeSettings {
  if (tags.boundary === 'administrative' && tags.admin_level) return 'administrative'
  if (tags.boundary === 'protected_area') return 'protected_area'
  if (tags.boundary === 'national_park') return 'national_park'
  if (tags.leisure === 'nature_reserve') return 'nature_reserve'
  if (tags.boundary === 'postal_code') return 'postal_code'
  if (tags.boundary === 'political') return 'political'
  if (tags.boundary === 'statistical') return 'statistical'
  if (tags.boundary === 'religious_administration') return 'religious_administration'
  if (tags.boundary === 'timezone') return 'timezone'
  if (tags.boundary === 'public_transport') return 'public_transport'
  return 'other'
}

/**
 * Turns a raw is_in()/out tags; response into candidates, gated by which
 * categories the user currently has enabled — nothing is ever excluded in
 * code, only by this configurable setting (see settingsStore.ts).
 */
export function filterOverpassCandidates(
  elements: OverpassRawTagElement[],
  enabled: AreaCandidateTypeSettings,
): OverpassCandidate[] {
  const candidates: OverpassCandidate[] = []
  for (const element of elements) {
    if (element.type !== 'way' && element.type !== 'relation') continue
    const name = element.tags?.name
    if (!name) continue

    const kind = classify(element.tags!)
    if (!enabled[kind]) continue

    candidates.push({
      osmType: element.type,
      osmId: element.id,
      name,
      kind,
      adminLevel: element.tags!.admin_level ? Number(element.tags!.admin_level) : undefined,
    })
  }
  return candidates
}

/** Cheap, tags-only lookup of every area containing (lng, lat) — the candidate list. */
export async function findAreaCandidates(
  lng: number,
  lat: number,
  enabled: AreaCandidateTypeSettings,
): Promise<OverpassCandidate[]> {
  const query = `[out:json][timeout:25];is_in(${lat},${lng})->.a;(way(pivot.a);relation(pivot.a);)->.b;.b out tags;`
  const res = await fetch(OVERPASS_ENDPOINT, { method: 'POST', body: `data=${encodeURIComponent(query)}` })
  if (!res.ok) throw new Error(`Overpass antwortet nicht (${res.status})`)
  const data: { elements: OverpassRawTagElement[] } = await res.json()
  return filterOverpassCandidates(data.elements, enabled)
}

/** Full geometry for exactly one picked candidate — never fetched for unpicked ones. */
export async function fetchAreaGeometry(candidate: OverpassCandidate): Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  const query = `[out:json][timeout:25];${candidate.osmType}(${candidate.osmId});out geom;`
  const res = await fetch(OVERPASS_ENDPOINT, { method: 'POST', body: `data=${encodeURIComponent(query)}` })
  if (!res.ok) throw new Error(`Overpass antwortet nicht (${res.status})`)
  const data: { elements: OverpassElement[] } = await res.json()
  const [element] = data.elements
  if (!element) throw new Error('Overpass hat keine Geometrie für dieses Gebiet geliefert.')
  return overpassElementToPolygon(element)
}
