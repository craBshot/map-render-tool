import { describe, expect, it } from 'vitest'
import {
  buildCountryBootstrapQuery,
  buildCountryEnumerationQuery,
  parseCountryBootstrapResponse,
  parseEnumerationResponse,
} from './overpassEnumeration'
import type { OverpassRawTagElement } from './overpassClient'

describe('buildCountryBootstrapQuery', () => {
  it('asks for every admin_level=2 relation with an ISO3166-1 tag, tags only', () => {
    const query = buildCountryBootstrapQuery()
    expect(query).toContain('admin_level=2')
    expect(query).toContain('"ISO3166-1"')
    expect(query).toContain('out tags;')
    expect(query).not.toContain('out geom')
  })
})

describe('parseCountryBootstrapResponse', () => {
  it('extracts iso2 codes and drops relations without an ISO3166-1 tag', () => {
    const elements: OverpassRawTagElement[] = [
      { type: 'relation', id: 51477, tags: { name: 'Deutschland', 'ISO3166-1': 'DE' } },
      { type: 'relation', id: 2202162, tags: { name: 'France', 'ISO3166-1': 'FR' } },
      { type: 'relation', id: 999, tags: { name: 'Some disputed territory' } },
    ]
    expect(parseCountryBootstrapResponse(elements)).toEqual([
      { iso2: 'DE', name: 'Deutschland' },
      { iso2: 'FR', name: 'France' },
    ])
  })
})

describe('buildCountryEnumerationQuery', () => {
  it('restricts admin levels to 2-6 for the deep (Europe) tier', () => {
    const query = buildCountryEnumerationQuery('DE', 'deep')
    expect(query).toContain('"ISO3166-1"="DE"')
    expect(query).toContain('^(2|3|4|5|6)$')
  })

  it('restricts admin levels to 2+4 for the coarse (rest of world) tier', () => {
    const query = buildCountryEnumerationQuery('US', 'coarse')
    expect(query).toContain('"ISO3166-1"="US"')
    expect(query).toContain('^(2|4)$')
  })

  it('always includes protected_area, national_park and nature_reserve regardless of tier', () => {
    for (const tier of ['deep', 'coarse'] as const) {
      const query = buildCountryEnumerationQuery('DE', tier)
      expect(query).toContain('boundary=protected_area')
      expect(query).toContain('boundary=national_park')
      expect(query).toContain('leisure=nature_reserve')
    }
  })
})

// Same real Wildeshausen-region shape used by overpassClient.test.ts, reused here
// as a stand-in for a country enumeration response.
const sampleElements: OverpassRawTagElement[] = [
  { type: 'way', id: 887824294 },
  {
    type: 'way',
    id: 1028919997,
    tags: { name: 'Naturpark Wildeshauser Geest', boundary: 'protected_area', protect_class: '5' },
  },
  { type: 'relation', id: 51477, tags: { name: 'Deutschland', boundary: 'administrative', admin_level: '2' } },
  { type: 'relation', id: 62771, tags: { name: 'Niedersachsen', boundary: 'administrative', admin_level: '4' } },
  { type: 'relation', id: 3379707, tags: { boundary: 'postal_code' } },
  { type: 'relation', id: 16819467, tags: { name: 'UTC+01:00 standard time', boundary: 'timezone' } },
]

describe('parseEnumerationResponse', () => {
  it('keeps only the four locally-stored kinds, tagging each with the country code', () => {
    const items = parseEnumerationResponse(sampleElements, 'DE')
    expect(items.map((i) => i.name).sort()).toEqual(['Deutschland', 'Naturpark Wildeshauser Geest', 'Niedersachsen'].sort())
    expect(items.every((i) => i.countryIso2 === 'DE')).toBe(true)
  })

  it('drops the untagged way and the nameless postal_code entry', () => {
    const items = parseEnumerationResponse(sampleElements, 'DE')
    expect(items.find((i) => i.osmId === 887824294)).toBeUndefined()
    expect(items.find((i) => i.osmId === 3379707)).toBeUndefined()
  })

  it('drops timezone even though it is a recognized category, since it is not a locally-stored kind', () => {
    const items = parseEnumerationResponse(sampleElements, 'DE')
    expect(items.find((i) => i.osmId === 16819467)).toBeUndefined()
  })

  it('parses adminLevel as a number', () => {
    const items = parseEnumerationResponse(sampleElements, 'DE')
    expect(items.find((i) => i.name === 'Niedersachsen')?.adminLevel).toBe(4)
  })
})
