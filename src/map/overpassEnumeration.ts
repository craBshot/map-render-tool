import { classifyAreaKind, type OverpassRawTagElement } from './overpassClient.ts'
import type { AreaCandidateTypeSettings } from '../state/areaCandidateTypeSettings.ts'

/**
 * Pure query-building/parsing for the area-db worker's country-scoped
 * enumeration step. Shared between the Vite build (unit tests) and the
 * plain-Node worker — no dependencies, no fetch calls of its own.
 */

export type CountryTier = 'deep' | 'coarse'

export interface EnumeratedCountry {
  iso2: string
  name?: string
}

/** The only kinds the local area database ever stores — everything else stays live-Overpass-only. */
export type LocalAreaKind = 'administrative' | 'protected_area' | 'national_park' | 'nature_reserve'

const LOCAL_AREA_KINDS: ReadonlySet<string> = new Set<LocalAreaKind>([
  'administrative',
  'protected_area',
  'national_park',
  'nature_reserve',
])

function isLocalAreaKind(kind: keyof AreaCandidateTypeSettings): kind is LocalAreaKind {
  return LOCAL_AREA_KINDS.has(kind)
}

export interface EnumeratedAreaItem {
  osmType: 'way' | 'relation'
  osmId: number
  name: string
  kind: LocalAreaKind
  adminLevel?: number
  countryIso2: string
}

/** Every country with a boundary=administrative/admin_level=2 relation and an ISO3166-1 tag — run once. */
export function buildCountryBootstrapQuery(): string {
  return '[out:json][timeout:60];relation[boundary=administrative][admin_level=2]["ISO3166-1"];out tags;'
}

export function parseCountryBootstrapResponse(elements: OverpassRawTagElement[]): EnumeratedCountry[] {
  const countries: EnumeratedCountry[] = []
  for (const element of elements) {
    const iso2 = element.tags?.['ISO3166-1']
    if (!iso2) continue
    countries.push({ iso2, name: element.tags?.name })
  }
  return countries
}

const ADMIN_LEVEL_PATTERN: Record<CountryTier, string> = {
  deep: '^(2|3|4|5|6)$',
  coarse: '^(2|4)$',
}

/** Cheap, tags-only query listing every candidate area in one country for the given coverage tier. */
export function buildCountryEnumerationQuery(iso2: string, tier: CountryTier): string {
  const adminLevels = ADMIN_LEVEL_PATTERN[tier]
  return (
    '[out:json][timeout:180];' +
    `area["ISO3166-1"="${iso2}"][admin_level=2]->.country;` +
    '(' +
    `relation(area.country)[boundary=administrative][admin_level~"${adminLevels}"];` +
    'relation(area.country)[boundary=protected_area];way(area.country)[boundary=protected_area];' +
    'relation(area.country)[boundary=national_park];way(area.country)[boundary=national_park];' +
    'relation(area.country)[leisure=nature_reserve];way(area.country)[leisure=nature_reserve];' +
    ');out tags;'
  )
}

/** Turns a country enumeration response into work items, dropping anything outside the local DB's 4 kinds. */
export function parseEnumerationResponse(elements: OverpassRawTagElement[], countryIso2: string): EnumeratedAreaItem[] {
  const items: EnumeratedAreaItem[] = []
  for (const element of elements) {
    if (element.type !== 'way' && element.type !== 'relation') continue
    const name = element.tags?.name
    if (!name) continue

    const kind = classifyAreaKind(element.tags!)
    if (!isLocalAreaKind(kind)) continue

    items.push({
      osmType: element.type,
      osmId: element.id,
      name,
      kind,
      adminLevel: element.tags!.admin_level ? Number(element.tags!.admin_level) : undefined,
      countryIso2,
    })
  }
  return items
}
