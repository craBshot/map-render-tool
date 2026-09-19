import { describe, expect, it } from 'vitest'
import { buildSpatialIndex, queryPoint, type GeometryLoader } from './spatialIndex.ts'
import type { ManifestEntry } from './manifestStore.ts'

function square(
  osmId: number,
  name: string,
  kind: ManifestEntry['kind'],
  [minLng, minLat, maxLng, maxLat]: [number, number, number, number],
): { entry: ManifestEntry; geometry: GeoJSON.Polygon } {
  return {
    entry: {
      osmType: 'relation',
      osmId,
      name,
      kind,
      countryIso2: 'XX',
      bbox: [minLng, minLat, maxLng, maxLat],
      file: `relation-${osmId}.geojson`,
      fetchedAt: '2026-01-01T00:00:00.000Z',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    },
  }
}

/** Builds a loader over an in-memory geometry map and counts how often it's actually called. */
function fakeLoader(shapes: { entry: ManifestEntry; geometry: GeoJSON.Polygon }[]): {
  load: GeometryLoader
  calls: () => number
} {
  const byFile = new Map(shapes.map((s) => [s.entry.file, s.geometry]))
  let calls = 0
  return {
    load: async (entry) => {
      calls++
      const geometry = byFile.get(entry.file)
      if (!geometry) throw new Error(`no geometry for ${entry.file}`)
      return geometry
    },
    calls: () => calls,
  }
}

describe('buildSpatialIndex / queryPoint', () => {
  it('finds a point inside a single area', async () => {
    const niedersachsen = square(1, 'Niedersachsen', 'administrative', [6, 51, 11, 54])
    const index = buildSpatialIndex([niedersachsen.entry])
    const { load } = fakeLoader([niedersachsen])
    const results = await queryPoint(index, 8.4184, 52.8703, load)
    expect(results.map((a) => a.name)).toEqual(['Niedersachsen'])
  })

  it('returns every containing area for a point inside overlapping bboxes (e.g. Kreis nested in Bundesland)', async () => {
    const state = square(1, 'Niedersachsen', 'administrative', [6, 51, 11, 54])
    const county = square(2, 'Landkreis Oldenburg', 'administrative', [8, 52.5, 8.6, 53])
    const index = buildSpatialIndex([state.entry, county.entry])
    const { load } = fakeLoader([state, county])
    const names = (await queryPoint(index, 8.4184, 52.8703, load)).map((a) => a.name).sort()
    expect(names).toEqual(['Landkreis Oldenburg', 'Niedersachsen'])
  })

  it('returns nothing for a point outside every area', async () => {
    const niedersachsen = square(1, 'Niedersachsen', 'administrative', [6, 51, 11, 54])
    const index = buildSpatialIndex([niedersachsen.entry])
    const { load } = fakeLoader([niedersachsen])
    expect(await queryPoint(index, 40, 40, load)).toEqual([])
  })

  it('excludes bbox-overlapping but not-actually-containing areas (bbox is a coarse pre-filter, not the final answer)', async () => {
    const triangleEntry: ManifestEntry = {
      osmType: 'way',
      osmId: 2,
      name: 'Triangle',
      kind: 'nature_reserve',
      countryIso2: 'XX',
      bbox: [0, 0, 2, 2],
      file: 'way-2.geojson',
      fetchedAt: '2026-01-01T00:00:00.000Z',
    }
    const triangle = {
      entry: triangleEntry,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [0, 2],
            [0, 0],
          ],
        ],
      },
    }
    const triIndex = buildSpatialIndex([triangle.entry])
    const { load } = fakeLoader([triangle])
    // (1.8, 1.8) is inside the bbox [0,0,2,2] but outside the triangle (which is cut off by the hypotenuse).
    expect(await queryPoint(triIndex, 1.8, 1.8, load)).toEqual([])
    expect(await queryPoint(triIndex, 0.3, 0.3, load)).toHaveLength(1)
  })

  it('filters by kind when requested', async () => {
    const state = square(1, 'Niedersachsen', 'administrative', [6, 51, 11, 54])
    const park = square(2, 'Naturpark', 'protected_area', [6, 51, 11, 54])
    const index = buildSpatialIndex([state.entry, park.entry])
    const { load } = fakeLoader([state, park])
    const onlyProtected = await queryPoint(index, 8.4184, 52.8703, load, new Set(['protected_area']))
    expect(onlyProtected.map((a) => a.name)).toEqual(['Naturpark'])
  })

  it('does not return an area whose bbox spans the cell but does not cover the point (large area, sparse grid cell)', async () => {
    // A big country bbox spans many grid cells; a query in a far corner
    // cell it also spans, but whose polygon does not reach, must be excluded.
    const country = square(1, 'BigCountry', 'administrative', [0, 0, 10, 10])
    const index = buildSpatialIndex([country.entry], 5) // coarse 5-degree cells so the bbox spans 4 cells
    const { load } = fakeLoader([country])
    expect((await queryPoint(index, 9.9, 9.9, load)).map((a) => a.name)).toEqual(['BigCountry'])
    expect(await queryPoint(index, 20, 20, load)).toEqual([]) // outside the bbox and outside any populated cell
  })

  it('is lazy: never loads geometry for entries the kind/bbox pre-filter already rejects', async () => {
    const match = square(1, 'Match', 'administrative', [6, 51, 11, 54])
    const wrongKind = square(2, 'WrongKind', 'protected_area', [6, 51, 11, 54]) // same bbox, filtered by kind
    const wrongCell = square(3, 'WrongCell', 'administrative', [100, 80, 101, 81]) // far away, different grid cell
    const index = buildSpatialIndex([match.entry, wrongKind.entry, wrongCell.entry])
    const { load, calls } = fakeLoader([match, wrongKind, wrongCell])

    const results = await queryPoint(index, 8.4184, 52.8703, load, new Set(['administrative']))

    expect(results.map((a) => a.name)).toEqual(['Match'])
    expect(calls()).toBe(1) // only the actual candidate's geometry was ever read
  })
})
