import type { CountryTier, EnumeratedAreaItem, EnumeratedCountry, LocalAreaKind } from '../src/map/overpassEnumeration.ts'

/**
 * Pure state machine for the area-db worker's queue: which countries are
 * known/enumerated, which items are pending/done, and in what order the
 * fetch loop should work through them. No fs/network here — see
 * queueStore.ts for persistence and fetchLoop.ts for the actual I/O.
 */

export interface CountryState {
  iso2: string
  name?: string
  tier: CountryTier
  isHome: boolean
  enumerated: boolean
  enumerationAttempts: number
  lastEnumerationAttemptAt?: string
  lastEnumerationError?: string
}

export type ItemStatus = 'pending' | 'done'

export interface QueueItemState {
  osmType: 'way' | 'relation'
  osmId: number
  name: string
  kind: LocalAreaKind
  adminLevel?: number
  countryIso2: string
  status: ItemStatus
  attempts: number
  lastAttemptAt?: string
  lastError?: string
}

export interface QueueState {
  bootstrapped: boolean
  consecutiveTickFailures: number
  countries: Record<string, CountryState>
  items: Record<string, QueueItemState>
}

export function createEmptyQueueState(): QueueState {
  return { bootstrapped: false, consecutiveTickFailures: 0, countries: {}, items: {} }
}

export function itemKey(osmType: string, osmId: number): string {
  return `${osmType}/${osmId}`
}

const BACKOFF_BASE_MS = 30_000
const BACKOFF_MAX_MS = 30 * 60_000

function backoffDelayMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_MAX_MS)
}

function isRetryEligible(attempts: number, lastAttemptAt: string | undefined, nowMs: number): boolean {
  if (attempts === 0 || !lastAttemptAt) return true
  return nowMs - Date.parse(lastAttemptAt) >= backoffDelayMs(attempts)
}

/** (home first) then (deep-tier Europe before coarse-tier rest of world) then alphabetical iso2. */
function countryRank(country: CountryState): [number, number, string] {
  return [country.isHome ? 0 : 1, country.tier === 'deep' ? 0 : 1, country.iso2]
}

/** administrative/national_park before protected_area/nature_reserve, within the same country. */
function kindRank(kind: LocalAreaKind): number {
  return kind === 'administrative' || kind === 'national_park' ? 0 : 1
}

function compareTuples(a: readonly (number | string)[], b: readonly (number | string)[]): number {
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    const cmp = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number)
    if (cmp !== 0) return cmp
  }
  return 0
}

/** Registers newly-discovered countries from the bootstrap query; idempotent, existing countries are untouched. */
export function applyBootstrap(
  state: QueueState,
  countries: EnumeratedCountry[],
  europeIso2: ReadonlySet<string>,
  homeIso2: string,
): QueueState {
  const nextCountries = { ...state.countries }
  for (const country of countries) {
    if (nextCountries[country.iso2]) continue
    nextCountries[country.iso2] = {
      iso2: country.iso2,
      name: country.name,
      tier: europeIso2.has(country.iso2) ? 'deep' : 'coarse',
      isHome: country.iso2 === homeIso2,
      enumerated: false,
      enumerationAttempts: 0,
    }
  }
  return { ...state, bootstrapped: true, countries: nextCountries }
}

/** Next not-yet-enumerated, backoff-eligible country to run the per-country enumeration query for. */
export function pickNextCountryToEnumerate(state: QueueState, nowMs: number): CountryState | null {
  const candidates = Object.values(state.countries).filter(
    (c) => !c.enumerated && isRetryEligible(c.enumerationAttempts, c.lastEnumerationAttemptAt, nowMs),
  )
  candidates.sort((a, b) => compareTuples(countryRank(a), countryRank(b)))
  return candidates[0] ?? null
}

export function markCountryEnumerated(state: QueueState, iso2: string): QueueState {
  const country = state.countries[iso2]
  if (!country) return state
  return { ...state, countries: { ...state.countries, [iso2]: { ...country, enumerated: true } } }
}

export function markCountryEnumerationFailed(state: QueueState, iso2: string, error: string, nowIso: string): QueueState {
  const country = state.countries[iso2]
  if (!country) return state
  return {
    ...state,
    countries: {
      ...state.countries,
      [iso2]: {
        ...country,
        enumerationAttempts: country.enumerationAttempts + 1,
        lastEnumerationAttemptAt: nowIso,
        lastEnumerationError: error,
      },
    },
  }
}

/** Adds newly-enumerated work items; items already known (done or pending) are left untouched. */
export function addItems(state: QueueState, items: EnumeratedAreaItem[]): QueueState {
  const nextItems = { ...state.items }
  for (const item of items) {
    const key = itemKey(item.osmType, item.osmId)
    if (nextItems[key]) continue
    nextItems[key] = { ...item, status: 'pending', attempts: 0 }
  }
  return { ...state, items: nextItems }
}

/** Next pending, backoff-eligible item to fetch geometry for. */
export function pickNextItem(state: QueueState, nowMs: number): QueueItemState | null {
  const candidates = Object.values(state.items).filter(
    (item) => item.status === 'pending' && isRetryEligible(item.attempts, item.lastAttemptAt, nowMs),
  )
  candidates.sort((a, b) => {
    const countryA = state.countries[a.countryIso2]
    const countryB = state.countries[b.countryIso2]
    const rankA: (number | string)[] = countryA ? countryRank(countryA) : [1, 1, a.countryIso2]
    const rankB: (number | string)[] = countryB ? countryRank(countryB) : [1, 1, b.countryIso2]
    return compareTuples([...rankA, kindRank(a.kind), a.osmId], [...rankB, kindRank(b.kind), b.osmId])
  })
  return candidates[0] ?? null
}

export function markItemDone(state: QueueState, key: string, nowIso: string): QueueState {
  const item = state.items[key]
  if (!item) return state
  return {
    ...state,
    items: { ...state.items, [key]: { ...item, status: 'done', lastAttemptAt: nowIso, lastError: undefined } },
  }
}

export function markItemFailed(state: QueueState, key: string, error: string, nowIso: string): QueueState {
  const item = state.items[key]
  if (!item) return state
  return {
    ...state,
    items: { ...state.items, [key]: { ...item, attempts: item.attempts + 1, lastAttemptAt: nowIso, lastError: error } },
  }
}

export function recordTickResult(state: QueueState, success: boolean): QueueState {
  return { ...state, consecutiveTickFailures: success ? 0 : state.consecutiveTickFailures + 1 }
}

const GLOBAL_BACKOFF_THRESHOLD = 3
const GLOBAL_BACKOFF_MAX_MS = 15 * 60_000

/** Scales the tick interval up after a run of consecutive failures (e.g. a sustained Overpass outage). */
export function nextTickDelayMs(state: QueueState, baseIntervalMs: number): number {
  if (state.consecutiveTickFailures < GLOBAL_BACKOFF_THRESHOLD) return baseIntervalMs
  const scaled = baseIntervalMs * 2 ** (state.consecutiveTickFailures - GLOBAL_BACKOFF_THRESHOLD + 1)
  return Math.min(scaled, GLOBAL_BACKOFF_MAX_MS)
}
