export interface OverpassLatLon {
  lat: number
  lon: number
}

export interface OverpassWayElement {
  type: 'way'
  id: number
  tags?: Record<string, string>
  geometry: OverpassLatLon[]
}

export interface OverpassRelationMember {
  type: 'way' | 'node' | 'relation'
  ref: number
  role: string
  geometry?: OverpassLatLon[]
}

export interface OverpassRelationElement {
  type: 'relation'
  id: number
  tags?: Record<string, string>
  members: OverpassRelationMember[]
}

export type OverpassElement = OverpassWayElement | OverpassRelationElement

export class GeometryAssemblyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeometryAssemblyError'
  }
}

type Ring = OverpassLatLon[]

// Shared nodes come back with byte-identical coordinates from Overpass, but
// compare with a tiny tolerance rather than strict equality to be safe.
const EPSILON = 1e-9

function samePoint(a: OverpassLatLon, b: OverpassLatLon): boolean {
  return Math.abs(a.lat - b.lat) < EPSILON && Math.abs(a.lon - b.lon) < EPSILON
}

/**
 * Joins way segments (in any order, any direction) into one or more closed
 * rings by matching shared endpoints. A boundary relation's ways are not
 * guaranteed to arrive pre-ordered or consistently wound.
 */
function assembleRings(ways: OverpassLatLon[][]): Ring[] {
  const remaining = ways.filter((w) => w.length > 0).map((w) => w.slice())
  const rings: Ring[] = []

  while (remaining.length > 0) {
    let ring = remaining.shift()!

    while (!samePoint(ring[0], ring[ring.length - 1])) {
      const tail = ring[ring.length - 1]
      const tailMatch = remaining.findIndex((w) => samePoint(w[0], tail) || samePoint(w[w.length - 1], tail))

      if (tailMatch !== -1) {
        const [match] = remaining.splice(tailMatch, 1)
        const extension = samePoint(match[0], tail) ? match.slice(1) : match.slice(0, -1).reverse()
        ring = ring.concat(extension)
        continue
      }

      const head = ring[0]
      const headMatch = remaining.findIndex((w) => samePoint(w[0], head) || samePoint(w[w.length - 1], head))
      if (headMatch === -1) {
        throw new GeometryAssemblyError('Dangling way segment — boundary does not form a closed ring')
      }

      const [match] = remaining.splice(headMatch, 1)
      const prefix = samePoint(match[match.length - 1], head) ? match.slice(0, -1) : match.slice(1).reverse()
      ring = prefix.concat(ring)
    }

    rings.push(ring)
  }

  return rings
}

function ringToGeoJson(ring: Ring): GeoJSON.Position[] {
  const coords = ring.map((p): GeoJSON.Position => [p.lon, p.lat])
  const first = coords[0]
  const last = coords[coords.length - 1]
  if (Math.abs(first[0] - last[0]) > EPSILON || Math.abs(first[1] - last[1]) > EPSILON) {
    coords.push(first)
  }
  return coords
}

/** Ray-casting point-in-ring test, used to match inner (hole) rings to their outer ring. */
function ringContainsPoint(ring: GeoJSON.Position[], point: GeoJSON.Position): boolean {
  let inside = false
  const [x, y] = point
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

/**
 * Turns a single Overpass `out geom;` element (a way, or a boundary
 * relation with outer/inner member ways) into a GeoJSON polygon. Hand-
 * rolled rather than a library — see CLAUDE.md/commit history for why.
 */
export function overpassElementToPolygon(element: OverpassElement): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (element.type === 'way') {
    return { type: 'Polygon', coordinates: [ringToGeoJson(element.geometry)] }
  }

  const outerWays = element.members
    .filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry)
    .map((m) => m.geometry!)
  const innerWays = element.members
    .filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry)
    .map((m) => m.geometry!)

  if (outerWays.length === 0) {
    throw new GeometryAssemblyError('Relation has no outer way members')
  }

  const outerRings = assembleRings(outerWays).map(ringToGeoJson)
  const innerRings = assembleRings(innerWays).map(ringToGeoJson)

  const polygonRings: GeoJSON.Position[][][] = outerRings.map((outer) => [outer])
  for (const inner of innerRings) {
    const owner = polygonRings.find((rings) => ringContainsPoint(rings[0], inner[0]))
    owner?.push(inner) // an inner ring matching no outer is dropped — shouldn't happen with valid OSM data
  }

  return polygonRings.length === 1
    ? { type: 'Polygon', coordinates: polygonRings[0] }
    : { type: 'MultiPolygon', coordinates: polygonRings }
}
