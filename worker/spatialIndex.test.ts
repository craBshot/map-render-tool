import { describe, expect, it } from 'vitest'
import { buildSpatialIndex, queryPoint, type IndexedArea } from './spatialIndex.ts'

function square(
  osmId: number,
  name: string,
  kind: IndexedArea['kind'],
  [minLng, minLat, maxLng, maxLat]: [number, number, number, number],
): IndexedArea {
  return {
    osmType: 'relation',
    osmId,
    name,
    kind,
    bbox: [minLng, minLat, maxLng, maxLat],
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

describe('buildSpatialIndex / queryPoint', () => {
  it('finds a point inside a single area', () => {
    const index = buildSpatialIndex([square(1, 'Niedersachsen', 'administrative', [6, 51, 11, 54])])
    expect(queryPoint(index, 8.4184, 52.8703).map((a) => a.name)).toEqual(['Niedersachsen'])
  })

  it('returns every containing area for a point inside overlapping bboxes (e.g. Kreis nested in Bundesland)', () => {
    const state = square(1, 'Niedersachsen', 'administrative', [6, 51, 11, 54])
    const county = square(2, 'Landkreis Oldenburg', 'administrative', [8, 52.5, 8.6, 53])
    const index = buildSpatialIndex([state, county])
    const names = queryPoint(index, 8.4184, 52.8703).map((a) => a.name).sort()
    expect(names).toEqual(['Landkreis Oldenburg', 'Niedersachsen'])
  })

  it('returns nothing for a point outside every area', () => {
    const index = buildSpatialIndex([square(1, 'Niedersachsen', 'administrative', [6, 51, 11, 54])])
    expect(queryPoint(index, 40, 40)).toEqual([])
  })

  it('excludes bbox-overlapping but not-actually-containing areas (bbox is a coarse pre-filter, not the final answer)', () => {
    const triangle: IndexedArea = {
      osmType: 'way',
      osmId: 2,
      name: 'Triangle',
      kind: 'nature_reserve',
      bbox: [0, 0, 2, 2],
      geometry: {
        type: 'Polygon',
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
    const triIndex = buildSpatialIndex([triangle])
    // (1.8, 1.8) is inside the bbox [0,0,2,2] but outside the triangle (which is cut off by the hypotenuse).
    expect(queryPoint(triIndex, 1.8, 1.8)).toEqual([])
    expect(queryPoint(triIndex, 0.3, 0.3)).toHaveLength(1)
  })

  it('filters by kind when requested', () => {
    const index = buildSpatialIndex([
      square(1, 'Niedersachsen', 'administrative', [6, 51, 11, 54]),
      square(2, 'Naturpark', 'protected_area', [6, 51, 11, 54]),
    ])
    const onlyProtected = queryPoint(index, 8.4184, 52.8703, new Set(['protected_area']))
    expect(onlyProtected.map((a) => a.name)).toEqual(['Naturpark'])
  })

  it('does not return an area whose bbox spans the cell but does not cover the point (large area, sparse grid cell)', () => {
    // A big country bbox spans many grid cells; a query in a far corner
    // cell it also spans, but whose polygon does not reach, must be excluded.
    const country = square(1, 'BigCountry', 'administrative', [0, 0, 10, 10])
    const index = buildSpatialIndex([country], 5) // coarse 5-degree cells so the bbox spans 4 cells
    expect(queryPoint(index, 9.9, 9.9).map((a) => a.name)).toEqual(['BigCountry'])
    expect(queryPoint(index, 20, 20)).toEqual([]) // outside the bbox and outside any populated cell
  })
})
