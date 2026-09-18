import { describe, expect, it } from 'vitest'
import {
  addItems,
  applyBootstrap,
  createEmptyQueueState,
  itemKey,
  markCountryEnumerated,
  markCountryEnumerationFailed,
  markItemDone,
  markItemFailed,
  nextTickDelayMs,
  pickNextCountryToEnumerate,
  pickNextItem,
  recordTickResult,
} from './queueLogic.ts'
import type { EnumeratedAreaItem, EnumeratedCountry } from '../src/map/overpassEnumeration.ts'

const EUROPE: ReadonlySet<string> = new Set(['DE', 'FR', 'AT'])

const bootstrapCountries: EnumeratedCountry[] = [
  { iso2: 'DE', name: 'Deutschland' },
  { iso2: 'FR', name: 'France' },
  { iso2: 'US', name: 'United States' },
]

describe('applyBootstrap', () => {
  it('tiers countries by the europe set and marks the home country', () => {
    const state = applyBootstrap(createEmptyQueueState(), bootstrapCountries, EUROPE, 'DE')
    expect(state.bootstrapped).toBe(true)
    expect(state.countries.DE).toMatchObject({ tier: 'deep', isHome: true, enumerated: false })
    expect(state.countries.FR).toMatchObject({ tier: 'deep', isHome: false })
    expect(state.countries.US).toMatchObject({ tier: 'coarse', isHome: false })
  })

  it('is idempotent — re-bootstrapping does not reset already-enumerated countries', () => {
    let state = applyBootstrap(createEmptyQueueState(), bootstrapCountries, EUROPE, 'DE')
    state = markCountryEnumerated(state, 'DE')
    state = applyBootstrap(state, bootstrapCountries, EUROPE, 'DE')
    expect(state.countries.DE.enumerated).toBe(true)
  })
})

describe('pickNextCountryToEnumerate', () => {
  it('prioritizes the home country, then deep tier, then coarse tier', () => {
    const state = applyBootstrap(createEmptyQueueState(), bootstrapCountries, EUROPE, 'DE')
    expect(pickNextCountryToEnumerate(state, 0)?.iso2).toBe('DE')

    const withoutDe = markCountryEnumerated(state, 'DE')
    expect(pickNextCountryToEnumerate(withoutDe, 0)?.iso2).toBe('FR')

    const withoutDeFr = markCountryEnumerated(withoutDe, 'FR')
    expect(pickNextCountryToEnumerate(withoutDeFr, 0)?.iso2).toBe('US')
  })

  it('returns null once every country is enumerated', () => {
    let state = applyBootstrap(createEmptyQueueState(), bootstrapCountries, EUROPE, 'DE')
    for (const iso2 of ['DE', 'FR', 'US']) state = markCountryEnumerated(state, iso2)
    expect(pickNextCountryToEnumerate(state, 0)).toBeNull()
  })

  it('skips a country still in its enumeration backoff window after a failure', () => {
    let state = applyBootstrap(createEmptyQueueState(), bootstrapCountries, EUROPE, 'DE')
    state = markCountryEnumerationFailed(state, 'DE', '504', new Date(1_000_000).toISOString())
    // Immediately after the failure, DE is not yet eligible again (30s base backoff).
    expect(pickNextCountryToEnumerate(state, 1_000_000)?.iso2).toBe('FR')
    // Far enough in the future, DE becomes eligible again and still outranks FR.
    expect(pickNextCountryToEnumerate(state, 1_000_000 + 60_000)?.iso2).toBe('DE')
  })
})

const sampleItems: EnumeratedAreaItem[] = [
  { osmType: 'relation', osmId: 1, name: 'Niedersachsen', kind: 'administrative', adminLevel: 4, countryIso2: 'DE' },
  { osmType: 'way', osmId: 2, name: 'Ein Naturschutzgebiet', kind: 'nature_reserve', countryIso2: 'DE' },
  { osmType: 'relation', osmId: 3, name: 'Île-de-France', kind: 'administrative', adminLevel: 4, countryIso2: 'FR' },
]

function stateWithItems(): ReturnType<typeof addItems> {
  const state = applyBootstrap(createEmptyQueueState(), bootstrapCountries, EUROPE, 'DE')
  return addItems(state, sampleItems)
}

describe('addItems', () => {
  it('adds new items as pending and leaves existing ones untouched', () => {
    let state = stateWithItems()
    state = markItemDone(state, itemKey('relation', 1), '2026-01-01T00:00:00Z')
    state = addItems(state, sampleItems) // re-enumeration, same items
    expect(state.items[itemKey('relation', 1)].status).toBe('done')
  })
})

describe('pickNextItem', () => {
  it('prefers administrative/national_park over protected_area/nature_reserve within the same country', () => {
    const state = stateWithItems()
    const next = pickNextItem(state, 0)
    expect(next).toMatchObject({ osmId: 1, kind: 'administrative' })
  })

  it('does not let a coarse/deep-tier-other-country item jump ahead of the home country nature reserve', () => {
    const state = stateWithItems()
    const afterAdmin = markItemDone(state, itemKey('relation', 1), '2026-01-01T00:00:00Z')
    const next = pickNextItem(afterAdmin, 0)
    expect(next).toMatchObject({ osmId: 2, countryIso2: 'DE' })
  })

  it('returns null once every item is done', () => {
    let state = stateWithItems()
    for (const item of sampleItems) state = markItemDone(state, itemKey(item.osmType, item.osmId), '2026-01-01T00:00:00Z')
    expect(pickNextItem(state, 0)).toBeNull()
  })

  it('respects per-item exponential backoff after a failure', () => {
    let state = stateWithItems()
    state = markItemFailed(state, itemKey('relation', 1), '504', new Date(1_000_000).toISOString())
    expect(pickNextItem(state, 1_000_000)?.osmId).not.toBe(1)
    expect(pickNextItem(state, 1_000_000 + 60_000)?.osmId).toBe(1)
  })
})

describe('recordTickResult / nextTickDelayMs', () => {
  it('keeps the base interval below the failure threshold', () => {
    let state = createEmptyQueueState()
    state = recordTickResult(state, false)
    state = recordTickResult(state, false)
    expect(nextTickDelayMs(state, 90_000)).toBe(90_000)
  })

  it('scales up after repeated consecutive failures, capped at 15 minutes', () => {
    let state = createEmptyQueueState()
    for (let i = 0; i < 10; i++) state = recordTickResult(state, false)
    expect(nextTickDelayMs(state, 90_000)).toBe(15 * 60_000)
  })

  it('resets to the base interval as soon as a tick succeeds', () => {
    let state = createEmptyQueueState()
    for (let i = 0; i < 10; i++) state = recordTickResult(state, false)
    state = recordTickResult(state, true)
    expect(nextTickDelayMs(state, 90_000)).toBe(90_000)
  })
})
