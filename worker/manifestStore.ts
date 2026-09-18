import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LocalAreaKind } from '../src/map/overpassEnumeration.ts'

export interface ManifestEntry {
  osmType: 'way' | 'relation'
  osmId: number
  name: string
  kind: LocalAreaKind
  adminLevel?: number
  countryIso2: string
  bbox: [number, number, number, number]
  file: string
  fetchedAt: string
}

/** Bounding box [minLng, minLat, maxLng, maxLat] of a Polygon/MultiPolygon. Pure, no fs. */
export function computeBbox(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number, number, number] {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const rings of polygons) {
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng
        if (lat < minLat) minLat = lat
        if (lng > maxLng) maxLng = lng
        if (lat > maxLat) maxLat = lat
      }
    }
  }
  return [minLng, minLat, maxLng, maxLat]
}

export function rawFileName(osmType: 'way' | 'relation', osmId: number): string {
  return `${osmType}-${osmId}.geojson`
}

interface RawFeature {
  type: 'Feature'
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  properties: Omit<ManifestEntry, 'bbox' | 'file'>
}

/** Writes the raw GeoJSON feature file and appends its manifest line. Not atomic across the two files by
 * design — a crash between them just means the raw file is re-fetched (it isn't in the manifest yet, so
 * the queue still sees the item as pending and will retry). */
export async function storeArea(
  dataDir: string,
  properties: Omit<ManifestEntry, 'bbox' | 'file'>,
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): Promise<void> {
  const bbox = computeBbox(geometry)
  const file = rawFileName(properties.osmType, properties.osmId)
  const feature: RawFeature = { type: 'Feature', geometry, properties }

  await mkdir(join(dataDir, 'raw'), { recursive: true })
  await writeFile(join(dataDir, 'raw', file), JSON.stringify(feature), 'utf8')

  const entry: ManifestEntry = { ...properties, bbox, file }
  await appendFile(join(dataDir, 'manifest.ndjson'), `${JSON.stringify(entry)}\n`, 'utf8')
}

/** Reads the whole manifest into memory — fine at this project's scale (thousands, not millions, of entries). */
export async function readManifest(dataDir: string): Promise<ManifestEntry[]> {
  let raw: string
  try {
    raw = await readFile(join(dataDir, 'manifest.ndjson'), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ManifestEntry)
}

export async function readRawGeometry(
  dataDir: string,
  entry: ManifestEntry,
): Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  const raw = await readFile(join(dataDir, 'raw', entry.file), 'utf8')
  return (JSON.parse(raw) as RawFeature).geometry
}
