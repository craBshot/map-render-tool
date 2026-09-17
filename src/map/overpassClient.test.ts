import { describe, expect, it } from 'vitest'
import { filterOverpassCandidates, type OverpassRawTagElement } from './overpassClient'
import { defaultAreaCandidateTypeSettings, type AreaCandidateTypeSettings } from '../state/areaCandidateTypeSettings'

function allCandidateTypesEnabled(): AreaCandidateTypeSettings {
  const defaults = defaultAreaCandidateTypeSettings()
  const entries = Object.keys(defaults).map((key) => [key, true])
  return Object.fromEntries(entries) as unknown as AreaCandidateTypeSettings
}

// Real is_in()/out tags; response captured live for Wildeshausen, Niedersachsen
// (52.8703, 8.4184) during the region-highlighting design discussion.
const wildeshausenResponse: OverpassRawTagElement[] = [
  { type: 'way', id: 887824294 },
  {
    type: 'way',
    id: 1028919997,
    tags: { name: 'Naturpark Wildeshauser Geest', boundary: 'protected_area', protect_class: '5' },
  },
  { type: 'relation', id: 51477, tags: { name: 'Deutschland', boundary: 'administrative', admin_level: '2' } },
  {
    type: 'relation',
    id: 62648,
    tags: { name: 'Landkreis Oldenburg', boundary: 'administrative', admin_level: '6' },
  },
  { type: 'relation', id: 62771, tags: { name: 'Niedersachsen', boundary: 'administrative', admin_level: '4' } },
  { type: 'relation', id: 1187315, tags: { name: 'Wildeshausen', boundary: 'administrative', admin_level: '8' } },
  {
    type: 'relation',
    id: 3133007,
    tags: { name: 'Delmenhorst - Wesermarsch - Oldenburg-Land', boundary: 'political' },
  },
  { type: 'relation', id: 3379707, tags: { boundary: 'postal_code' } },
  {
    type: 'relation',
    id: 4189513,
    tags: { name: 'Verkehrsverbund Bremen/Niedersachsen', boundary: 'public_transport' },
  },
  { type: 'relation', id: 12825427, tags: { name: 'Offizialat Vechta', boundary: 'religious_administration' } },
  { type: 'relation', id: 16819467, tags: { name: 'UTC+01:00 standard time', boundary: 'timezone' } },
  { type: 'relation', id: 17580093, tags: { name: 'Weser-Ems', boundary: 'statistical', admin_level: '5' } },
]

describe('filterOverpassCandidates', () => {
  it('keeps administrative levels and the protected area, drops noise, under default settings', () => {
    const candidates = filterOverpassCandidates(wildeshausenResponse, defaultAreaCandidateTypeSettings())
    const names = candidates.map((c) => c.name).sort()

    expect(names).toEqual(
      ['Deutschland', 'Landkreis Oldenburg', 'Naturpark Wildeshauser Geest', 'Niedersachsen', 'Wildeshausen'].sort(),
    )
  })

  it('drops the untagged way and the nameless postal_code entry regardless of settings', () => {
    const candidates = filterOverpassCandidates(wildeshausenResponse, allCandidateTypesEnabled())

    expect(candidates.find((c) => c.osmId === 887824294)).toBeUndefined()
    expect(candidates.find((c) => c.osmId === 3379707)).toBeUndefined()
    expect(candidates).toHaveLength(wildeshausenResponse.length - 2)
  })

  it('surfaces categories the user has enabled, e.g. timezone', () => {
    const settings = { ...defaultAreaCandidateTypeSettings(), timezone: true }
    const candidates = filterOverpassCandidates(wildeshausenResponse, settings)
    expect(candidates.some((c) => c.kind === 'timezone')).toBe(true)
  })

  it('classifies the protected area and administrative levels correctly', () => {
    const candidates = filterOverpassCandidates(wildeshausenResponse, allCandidateTypesEnabled())

    expect(candidates.find((c) => c.name === 'Naturpark Wildeshauser Geest')?.kind).toBe('protected_area')
    expect(candidates.find((c) => c.name === 'Wildeshausen')?.kind).toBe('administrative')
    expect(candidates.find((c) => c.name === 'Wildeshausen')?.adminLevel).toBe(8)
  })
})
