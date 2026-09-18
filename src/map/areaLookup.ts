import { fetchAreaGeometry, findAreaCandidates, type OverpassCandidate } from './overpassClient.ts'
import type { LocalAreaKind } from './overpassEnumeration.ts'
import type { AreaCandidateTypeSettings } from '../state/areaCandidateTypeSettings.ts'

/**
 * Local-first area lookup: tries the area-db worker (proxied by nginx at
 * /area-db/*) before falling back to the existing live Overpass path. Any
 * failure of the local call — network error, non-2xx, timeout, malformed
 * JSON — is treated uniformly as "local miss", so this degrades exactly to
 * today's live-only behavior whenever the worker is absent, unreachable, or
 * simply hasn't reached this point/country yet (including under `npm run
 * dev`, which has no nginx proxy at all).
 */

export interface AreaLookupCandidate extends OverpassCandidate {
  source: 'local' | 'live'
  /** Present only for local hits — the geometry is already on disk, no reason to fetch it again. */
  geometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

const LOCAL_AREA_KINDS: ReadonlySet<LocalAreaKind> = new Set(['administrative', 'protected_area', 'national_park', 'nature_reserve'])

function isLocalAreaKind(kind: keyof AreaCandidateTypeSettings): kind is LocalAreaKind {
  return LOCAL_AREA_KINDS.has(kind as LocalAreaKind)
}

interface LocalArea {
  osmType: 'way' | 'relation'
  osmId: number
  name: string
  kind: LocalAreaKind
  adminLevel?: number
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

async function queryLocalDatabase(lng: number, lat: number, kinds: LocalAreaKind[]): Promise<LocalArea[]> {
  const params = new URLSearchParams({ lng: String(lng), lat: String(lat), kinds: kinds.join(',') })
  const res = await fetch(`/area-db/candidates?${params.toString()}`, { signal: AbortSignal.timeout(1500) })
  if (!res.ok) throw new Error(`area-db antwortet nicht (${res.status})`)
  const data = (await res.json()) as { areas: LocalArea[] }
  return data.areas
}

function asLive(candidates: OverpassCandidate[]): AreaLookupCandidate[] {
  return candidates.map((c) => ({ ...c, source: 'live' as const }))
}

export async function findAreaCandidatesWithFallback(
  lng: number,
  lat: number,
  enabled: AreaCandidateTypeSettings,
): Promise<AreaLookupCandidate[]> {
  const localCoverableKinds = (Object.keys(enabled) as (keyof AreaCandidateTypeSettings)[]).filter(
    (kind) => enabled[kind] && isLocalAreaKind(kind),
  ) as LocalAreaKind[]

  if (localCoverableKinds.length === 0) {
    return asLive(await findAreaCandidates(lng, lat, enabled))
  }

  let localAreas: LocalArea[] = []
  try {
    localAreas = await queryLocalDatabase(lng, lat, localCoverableKinds)
  } catch {
    localAreas = [] // local DB absent/unreachable/not-yet-populated — same fallback as a genuine miss
  }

  if (localAreas.length === 0) {
    return asLive(await findAreaCandidates(lng, lat, enabled))
  }

  const localCandidates: AreaLookupCandidate[] = localAreas.map((a) => ({ ...a, source: 'local' as const }))

  const liveOnlyEnabled = { ...enabled }
  for (const kind of localCoverableKinds) liveOnlyEnabled[kind] = false
  if (!Object.values(liveOnlyEnabled).some(Boolean)) return localCandidates

  const localKeys = new Set(localCandidates.map((c) => `${c.osmType}/${c.osmId}`))
  const liveOnly = asLive(await findAreaCandidates(lng, lat, liveOnlyEnabled)).filter(
    (c) => !localKeys.has(`${c.osmType}/${c.osmId}`),
  )
  return [...localCandidates, ...liveOnly]
}

/** Returns a local hit's already-known geometry directly, otherwise fetches it live as before. */
export async function resolveAreaGeometry(candidate: AreaLookupCandidate): Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  if (candidate.source === 'local' && candidate.geometry) return candidate.geometry
  return fetchAreaGeometry(candidate)
}
