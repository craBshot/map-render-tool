import { describe, expect, it } from 'vitest'
import { computeBbox, rawFileName } from './manifestStore.ts'

describe('computeBbox', () => {
  it('computes the bounding box of a simple Polygon', () => {
    const polygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 5],
          [0, 5],
          [0, 0],
        ],
      ],
    }
    expect(computeBbox(polygon)).toEqual([0, 0, 10, 5])
  })

  it('spans across all parts of a MultiPolygon', () => {
    const multi: GeoJSON.MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [10, 10],
            [11, 10],
            [11, 11],
            [10, 11],
            [10, 10],
          ],
        ],
      ],
    }
    expect(computeBbox(multi)).toEqual([0, 0, 11, 11])
  })

  it('ignores hole rings when computing the outer bbox (holes never extend beyond the outer ring)', () => {
    const withHole: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [3, 3],
          [7, 3],
          [7, 7],
          [3, 7],
          [3, 3],
        ],
      ],
    }
    expect(computeBbox(withHole)).toEqual([0, 0, 10, 10])
  })
})

describe('rawFileName', () => {
  it('names files by osmType and osmId', () => {
    expect(rawFileName('relation', 62771)).toBe('relation-62771.geojson')
    expect(rawFileName('way', 1028919997)).toBe('way-1028919997.geojson')
  })
})
