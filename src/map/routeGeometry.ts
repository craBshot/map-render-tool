import type { RouteWaypoint } from '../state/types'

/**
 * Pure geometry helpers for routes — hand-rolled, no dependency (same
 * rationale as overpassGeometry.ts). Used both for the "Luftlinie"
 * (straight-line) routing mode and for progressively drawing whichever
 * geometry a route ends up with, regardless of its source.
 */

const EARTH_RADIUS_METERS = 6371000

/** Great-circle distance between two [lng, lat] positions. */
export function haversineDistanceMeters(a: GeoJSON.Position, b: GeoJSON.Position): number {
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLambda = ((lng2 - lng1) * Math.PI) / 180

  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

/** Sum of haversine distances along consecutive coordinates — the one source of "how long is this line". */
export function totalLineLengthMeters(coordinates: GeoJSON.Position[]): number {
  let total = 0
  for (let i = 1; i < coordinates.length; i++) {
    total += haversineDistanceMeters(coordinates[i - 1], coordinates[i])
  }
  return total
}

/**
 * Truncates coordinates to the leading portion covering `fraction` of the
 * total length, interpolating the exact cut point. fraction >= 1 returns
 * the coordinates unchanged; fraction <= 0 is expected to be handled by the
 * caller (see routeAnimation.ts's visible:false gating) but degenerately
 * returns just the first point here.
 */
export function sliceLineByFraction(coordinates: GeoJSON.Position[], fraction: number): GeoJSON.Position[] {
  if (coordinates.length === 0) return []
  if (fraction >= 1) return coordinates
  if (fraction <= 0) return [coordinates[0]]

  const total = totalLineLengthMeters(coordinates)
  const target = fraction * total

  let covered = 0
  for (let i = 1; i < coordinates.length; i++) {
    const segmentLength = haversineDistanceMeters(coordinates[i - 1], coordinates[i])
    if (covered + segmentLength >= target) {
      const segmentFraction = segmentLength > 0 ? (target - covered) / segmentLength : 0
      const [lng1, lat1] = coordinates[i - 1]
      const [lng2, lat2] = coordinates[i]
      const cut: GeoJSON.Position = [lng1 + (lng2 - lng1) * segmentFraction, lat1 + (lat2 - lat1) * segmentFraction]
      return [...coordinates.slice(0, i), cut]
    }
    covered += segmentLength
  }

  return coordinates
}

/** Connects waypoints directly in order — the "Luftlinie" routing mode, no request. */
export function waypointsToStraightLine(waypoints: RouteWaypoint[]): GeoJSON.LineString {
  return { type: 'LineString', coordinates: waypoints.map((w): GeoJSON.Position => [w.lng, w.lat]) }
}

/**
 * Appends a right-clicked point to a route's waypoint list. Once a start and
 * a destination both exist (length >= 2), the destination must stay the
 * last element — a further click inserts a new via-point just before it,
 * rather than becoming the new destination and demoting the previous one to
 * a via-point.
 */
export function insertRouteWaypoint(waypoints: RouteWaypoint[], point: RouteWaypoint): RouteWaypoint[] {
  if (waypoints.length < 2) return [...waypoints, point]
  return [...waypoints.slice(0, -1), point, waypoints[waypoints.length - 1]]
}
