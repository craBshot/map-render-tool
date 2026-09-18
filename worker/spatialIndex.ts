import { polygonContainsPoint } from '../src/map/overpassGeometry.ts'
import type { LocalAreaKind } from '../src/map/overpassEnumeration.ts'

/**
 * Grid-bucketed point-in-polygon index over the locally stored areas.
 * Pure/in-memory — the worker rebuilds this from disk once at startup (and
 * after every successful fetch), no persistence of its own.
 */

export interface IndexedArea {
  osmType: 'way' | 'relation'
  osmId: number
  name: string
  kind: LocalAreaKind
  adminLevel?: number
  bbox: [number, number, number, number]
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

export interface SpatialIndex {
  cellSizeDeg: number
  cells: Map<string, IndexedArea[]>
}

const DEFAULT_CELL_SIZE_DEG = 0.5

function cellKey(x: number, y: number): string {
  return `${x}:${y}`
}

function cellRangeForBbox(bbox: [number, number, number, number], cellSizeDeg: number): [number, number][] {
  const [minLng, minLat, maxLng, maxLat] = bbox
  const minX = Math.floor(minLng / cellSizeDeg)
  const maxX = Math.floor(maxLng / cellSizeDeg)
  const minY = Math.floor(minLat / cellSizeDeg)
  const maxY = Math.floor(maxLat / cellSizeDeg)
  const cells: [number, number][] = []
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) cells.push([x, y])
  }
  return cells
}

export function buildSpatialIndex(areas: IndexedArea[], cellSizeDeg = DEFAULT_CELL_SIZE_DEG): SpatialIndex {
  const cells = new Map<string, IndexedArea[]>()
  for (const area of areas) {
    for (const [x, y] of cellRangeForBbox(area.bbox, cellSizeDeg)) {
      const key = cellKey(x, y)
      const bucket = cells.get(key)
      if (bucket) bucket.push(area)
      else cells.set(key, [area])
    }
  }
  return { cellSizeDeg, cells }
}

/** All indexed areas (optionally restricted to `kinds`) whose polygon actually contains (lng, lat). */
export function queryPoint(
  index: SpatialIndex,
  lng: number,
  lat: number,
  kinds?: ReadonlySet<LocalAreaKind>,
): IndexedArea[] {
  const x = Math.floor(lng / index.cellSizeDeg)
  const y = Math.floor(lat / index.cellSizeDeg)
  const candidates = index.cells.get(cellKey(x, y)) ?? []

  const results: IndexedArea[] = []
  for (const area of candidates) {
    if (kinds && !kinds.has(area.kind)) continue
    const [minLng, minLat, maxLng, maxLat] = area.bbox
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue
    if (!polygonContainsPoint(area.geometry, [lng, lat])) continue
    results.push(area)
  }
  return results
}
