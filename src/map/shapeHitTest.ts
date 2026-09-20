import { polygonContainsPoint } from './overpassGeometry'
import type { Projector } from './pointHitTest'
import { haversineDistanceMeters, legLengthFractions } from './routeGeometry'
import type { AreaObject, ProjectFile, RouteObject } from '../state/types'

/**
 * Hit-testing for shapes (area polygons, the route line) — as opposed to
 * pointHitTest.ts's point-only hit-testing. Areas and the route already
 * render as real MapLibre layers, but this stays pure/map-free (like
 * pointHitTest.ts) rather than using map.queryRenderedFeatures, so it's
 * Vitest-unit-testable and follows the same Projector convention.
 */

/**
 * Topmost area under the point, or null. "Topmost" = first match in
 * project.areas — order is stacking order, earlier entries render on top
 * (see AreaObject's own comment in state/types.ts). Point-in-polygon
 * (respecting holes) reuses overpassGeometry.ts's polygonContainsPoint —
 * the area-db worker's own spatial index already needed the exact same
 * check, no reason for a second implementation here.
 */
export function hitTestArea(project: ProjectFile, point: { lng: number; lat: number }): AreaObject | null {
  for (const area of project.areas) {
    if (area.visible && polygonContainsPoint(area.geometry, [point.lng, point.lat])) return area
  }
  return null
}

function pixelDistanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { distance: number; fraction: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return { distance: Math.hypot(p.x - projX, p.y - projY), fraction: t }
}

/** Slightly larger than the point pickup radius — a 1-2px-wide line is harder to click exactly than a dot. */
export const ROUTE_LEG_HIT_RADIUS_PX = 8

/**
 * Which leg (0-based, leg i runs from waypoints[i] to waypoints[i+1]) of
 * the route's drawn geometry is nearest the click, or null if nothing is
 * within radiusPx. Finds the nearest point on the geometry in PIXEL space
 * (click precision is inherently pixel-based, not geo-based), then buckets
 * that point's fraction-along-the-total-length into whichever leg (per
 * legLengthFractions — road distance when available, straight-line
 * fallback otherwise) it falls into. Deliberately ignores which waypoint
 * is nearest in isolation — a long, gently curving OSRM leg should still
 * resolve correctly even far from either endpoint.
 */
export function hitTestRouteLeg(
  route: RouteObject,
  projector: Projector,
  pointerPx: { x: number; y: number },
  radiusPx: number = ROUTE_LEG_HIT_RADIUS_PX,
): number | null {
  const coords = route.geometry?.coordinates
  if (!coords || coords.length < 2 || route.waypoints.length < 2) return null

  let bestDist = Infinity
  let bestCumulativeM = 0
  let cumulativeM = 0
  for (let i = 1; i < coords.length; i++) {
    const a = projector.project(coords[i - 1] as [number, number])
    const b = projector.project(coords[i] as [number, number])
    const { distance, fraction } = pixelDistanceToSegment(pointerPx, a, b)
    const segLenM = haversineDistanceMeters(coords[i - 1], coords[i])
    if (distance < bestDist) {
      bestDist = distance
      bestCumulativeM = cumulativeM + fraction * segLenM
    }
    cumulativeM += segLenM
  }
  if (bestDist > radiusPx) return null

  const legFractions = legLengthFractions(route)
  if (legFractions.length === 0) return null
  const fractionAlong = cumulativeM > 0 ? bestCumulativeM / cumulativeM : 0

  let legCumulative = 0
  for (let i = 0; i < legFractions.length; i++) {
    legCumulative += legFractions[i]
    if (fractionAlong <= legCumulative) return i
  }
  return legFractions.length - 1 // floating-point edge case at fractionAlong essentially 1
}
