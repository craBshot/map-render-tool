import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findAreaCandidatesWithFallback, resolveAreaGeometry } from './areaLookup'
import * as overpassClient from './overpassClient'
import { defaultAreaCandidateTypeSettings } from '../state/areaCandidateTypeSettings'

vi.mock('./overpassClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./overpassClient')>()
  return { ...actual, findAreaCandidates: vi.fn(), fetchAreaGeometry: vi.fn() }
})

const mockedFindAreaCandidates = vi.mocked(overpassClient.findAreaCandidates)
const mockedFetchAreaGeometry = vi.mocked(overpassClient.fetchAreaGeometry)

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

describe('findAreaCandidatesWithFallback', () => {
  beforeEach(() => {
    mockedFindAreaCandidates.mockReset()
    mockedFetchAreaGeometry.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns local candidates without calling live overpass when the local db has a hit', async () => {
    const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [] }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          areas: [{ osmType: 'relation', osmId: 1, name: 'Niedersachsen', kind: 'administrative', adminLevel: 4, geometry }],
        }),
      ),
    )

    const result = await findAreaCandidatesWithFallback(8.4, 52.8, defaultAreaCandidateTypeSettings())

    expect(result).toEqual([
      { osmType: 'relation', osmId: 1, name: 'Niedersachsen', kind: 'administrative', adminLevel: 4, geometry, source: 'local' },
    ])
    expect(mockedFindAreaCandidates).not.toHaveBeenCalled()
  })

  it('falls back to live overpass with the full enabled set when the local db returns empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ areas: [] })))
    mockedFindAreaCandidates.mockResolvedValue([{ osmType: 'way', osmId: 2, name: 'Naturpark', kind: 'protected_area' }])

    const enabled = defaultAreaCandidateTypeSettings()
    const result = await findAreaCandidatesWithFallback(8.4, 52.8, enabled)

    expect(mockedFindAreaCandidates).toHaveBeenCalledWith(8.4, 52.8, enabled)
    expect(result).toEqual([{ osmType: 'way', osmId: 2, name: 'Naturpark', kind: 'protected_area', source: 'live' }])
  })

  it('falls back to live overpass when the local db call throws or times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    mockedFindAreaCandidates.mockResolvedValue([])

    const enabled = defaultAreaCandidateTypeSettings()
    await findAreaCandidatesWithFallback(8.4, 52.8, enabled)

    expect(mockedFindAreaCandidates).toHaveBeenCalledWith(8.4, 52.8, enabled)
  })

  it('merges local hits with live results for categories the local db never stores, deduping by id', async () => {
    const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [] }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ areas: [{ osmType: 'relation', osmId: 1, name: 'Niedersachsen', kind: 'administrative', geometry }] }),
      ),
    )
    mockedFindAreaCandidates.mockResolvedValue([{ osmType: 'relation', osmId: 9, name: 'UTC+01:00', kind: 'timezone' }])

    const enabled = { ...defaultAreaCandidateTypeSettings(), timezone: true }
    const result = await findAreaCandidatesWithFallback(8.4, 52.8, enabled)

    expect(mockedFindAreaCandidates).toHaveBeenCalledWith(
      8.4,
      52.8,
      expect.objectContaining({ timezone: true, administrative: false }),
    )
    expect(result.map((r) => r.name).sort()).toEqual(['Niedersachsen', 'UTC+01:00'])
  })

  it('skips the local call entirely when no enabled category is locally coverable', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    mockedFindAreaCandidates.mockResolvedValue([])

    const enabled = {
      ...defaultAreaCandidateTypeSettings(),
      administrative: false,
      protected_area: false,
      national_park: false,
      nature_reserve: false,
      timezone: true,
    }
    await findAreaCandidatesWithFallback(8.4, 52.8, enabled)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockedFindAreaCandidates).toHaveBeenCalledWith(8.4, 52.8, enabled)
  })
})

describe('resolveAreaGeometry', () => {
  it('returns the embedded geometry for a local candidate without a network call', async () => {
    const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [] }
    const candidate = {
      osmType: 'relation' as const,
      osmId: 1,
      name: 'x',
      kind: 'administrative' as const,
      source: 'local' as const,
      geometry,
    }

    const result = await resolveAreaGeometry(candidate)

    expect(result).toBe(geometry)
    expect(mockedFetchAreaGeometry).not.toHaveBeenCalled()
  })

  it('fetches live geometry for a live candidate', async () => {
    const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [] }
    mockedFetchAreaGeometry.mockResolvedValue(geometry)
    const candidate = { osmType: 'way' as const, osmId: 2, name: 'y', kind: 'protected_area' as const, source: 'live' as const }

    const result = await resolveAreaGeometry(candidate)

    expect(result).toBe(geometry)
    expect(mockedFetchAreaGeometry).toHaveBeenCalledWith(candidate)
  })
})
