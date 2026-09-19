import { polygonContainsPoint } from '../src/map/overpassGeometry.ts'
import type { LocalAreaKind } from '../src/map/overpassEnumeration.ts'
import type { ManifestEntry } from './manifestStore.ts'

/**
 * Grid-bucketed point-in-polygon index over the locally stored areas.
 * Pure/in-memory — the worker rebuilds this from the manifest once at
 * startup (and after every successful fetch), no persistence of its own.
 *
 * Holds only metadata (bbox etc.), never geometry: at this dataset's scale
 * (tens of thousands of areas, some with multi-MB boundaries) keeping every
 * geometry resident permanently doesn't fit in memory. `queryPoint` loads
 * geometry lazily, only for the handful of candidates a given point's grid
 * cell and bbox actually narrow it down to.
 */

export interface SpatialIndex {
  cellSizeDeg: number
  cells: Map<string, ManifestEntry[]>
}

export type GeometryLoader = (entry: ManifestEntry) => Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon>

export interface AreaMatch {
  osmType: ManifestEntry['osmType']
  osmId: number
  name: string
  kind: LocalAreaKind
  adminLevel?: number
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
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

export function buildSpatialIndex(entries: ManifestEntry[], cellSizeDeg = DEFAULT_CELL_SIZE_DEG): SpatialIndex {
  const cells = new Map<string, ManifestEntry[]>()
  for (const entry of entries) {
    for (const [x, y] of cellRangeForBbox(entry.bbox, cellSizeDeg)) {
      const key = cellKey(x, y)
      const bucket = cells.get(key)
      if (bucket) bucket.push(entry)
      else cells.set(key, [entry])
    }
  }
  return { cellSizeDeg, cells }
}

/**
 * All indexed areas (optionally restricted to `kinds`) whose polygon actually contains (lng, lat).
 * `loadGeometry` is only called for entries that already pass the cheap kind/bbox pre-filter.
 */
export async function queryPoint(
  index: SpatialIndex,
  lng: number,
  lat: number,
  loadGeometry: GeometryLoader,
  kinds?: ReadonlySet<LocalAreaKind>,
): Promise<AreaMatch[]> {
  const x = Math.floor(lng / index.cellSizeDeg)
  const y = Math.floor(lat / index.cellSizeDeg)
  const candidates = index.cells.get(cellKey(x, y)) ?? []

  const results: AreaMatch[] = []
  for (const entry of candidates) {
    if (kinds && !kinds.has(entry.kind)) continue
    const [minLng, minLat, maxLng, maxLat] = entry.bbox
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue
    const geometry = await loadGeometry(entry)
    if (!polygonContainsPoint(geometry, [lng, lat])) continue
    results.push({
      osmType: entry.osmType,
      osmId: entry.osmId,
      name: entry.name,
      kind: entry.kind,
      adminLevel: entry.adminLevel,
      geometry,
    })
  }
  return results
}
