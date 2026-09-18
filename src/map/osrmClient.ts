import type { RouteProfile, RouteWaypoint } from '../state/types'

export const OSRM_ENDPOINT = 'https://router.project-osrm.org'

export interface OsrmRouteResult {
  geometry: GeoJSON.LineString
  /** OSRM's own travel-time estimate, informational only. */
  durationSec: number
}

interface OsrmResponse {
  code: string
  routes?: Array<{ geometry: GeoJSON.LineString; duration: number }>
}

/**
 * Fetches a route through all waypoints in order (start, any via-points,
 * destination) from the public OSRM demo server. `overview=full` +
 * `geometries=geojson` returns the whole multi-waypoint route as one
 * combined LineString already — no per-leg assembly, no polyline decoder.
 */
export async function fetchRoute(waypoints: RouteWaypoint[], profile: RouteProfile): Promise<OsrmRouteResult> {
  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(';')
  const url = `${OSRM_ENDPOINT}/route/v1/${profile}/${coords}?geometries=geojson&overview=full`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OSRM antwortet nicht (${res.status})`)

  const data = (await res.json()) as OsrmResponse
  if (data.code !== 'Ok') throw new Error(`OSRM konnte keine Route berechnen (${data.code}).`)

  const [route] = data.routes ?? []
  if (!route) throw new Error('OSRM hat keine Route geliefert.')

  return { geometry: route.geometry, durationSec: route.duration }
}
