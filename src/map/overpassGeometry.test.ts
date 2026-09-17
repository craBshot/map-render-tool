import { describe, expect, it } from 'vitest'
import { GeometryAssemblyError, overpassElementToPolygon } from './overpassGeometry'
import { danglingRelation, naturparkWildeshauserGeestWay, squareWithHoleRelation } from './overpassGeometry.fixtures'

describe('overpassElementToPolygon', () => {
  it('converts a real, already self-closed way (Naturpark Wildeshauser Geest) to a single-ring polygon', () => {
    const polygon = overpassElementToPolygon(naturparkWildeshauserGeestWay)

    expect(polygon.type).toBe('Polygon')
    const [ring] = (polygon as GeoJSON.Polygon).coordinates
    // Already closed in the source data, so no extra closing point is added.
    expect(ring).toHaveLength(naturparkWildeshauserGeestWay.geometry.length)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    // [lon, lat] order, not [lat, lon].
    expect(ring[0]).toEqual([8.3688059, 53.1317657])
  })

  it('joins several out-of-order outer way segments into one ring and matches the inner hole to it', () => {
    const polygon = overpassElementToPolygon(squareWithHoleRelation)

    expect(polygon.type).toBe('Polygon')
    const { coordinates } = polygon as GeoJSON.Polygon
    expect(coordinates).toHaveLength(2) // outer + one hole

    const [outer, inner] = coordinates
    expect(outer[0]).toEqual(outer[outer.length - 1]) // closed
    expect(new Set(outer.map((p) => p.join(',')))).toEqual(
      new Set([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ].map((p) => p.join(','))),
    )
    expect(inner[0]).toEqual(inner[inner.length - 1])
    expect(new Set(inner.map((p) => p.join(',')))).toEqual(
      new Set([
        [3, 3],
        [7, 3],
        [7, 7],
        [3, 7],
      ].map((p) => p.join(','))),
    )
  })

  it('throws GeometryAssemblyError for a boundary that never closes', () => {
    expect(() => overpassElementToPolygon(danglingRelation)).toThrow(GeometryAssemblyError)
  })

  it('throws GeometryAssemblyError when a relation has no outer members', () => {
    expect(() =>
      overpassElementToPolygon({ type: 'relation', id: 1, members: [{ type: 'node', ref: 1, role: 'label' }] }),
    ).toThrow(GeometryAssemblyError)
  })
})
