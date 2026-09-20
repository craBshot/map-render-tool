import type { RouteObject } from '../state/types'
import { legLengthFractions } from './routeGeometry'
import { chainSegments } from '../timeline/waypointChain'

export interface RouteFrame {
  visible: boolean
  /** Fraction of the route's length that should be drawn (0..1). Geometry is applied in MapController, not here. */
  fraction: number
}

const HIDDEN: RouteFrame = { visible: false, fraction: 0 }

/**
 * Route draw state at time sec. sec === null is the static editor preview
 * (fully drawn, no gating) — same convention as markerStateAt/areaStateAt.
 *
 * The route draws as a waypoint chain, exactly like the camera: each
 * waypoint is held (draw progress flat) then traveled to (draw progress
 * ramps up over that leg's travelSec) — chainSegments() walks that chain.
 * Each travel leg's share of the drawn fraction is proportional to its
 * share of the route's real length (legLengthFractions()), not an equal
 * split, so a long leg draws proportionally slower than a short one at the
 * same travelSec. minTravelSec is 0 here (unlike the camera's
 * MIN_TRAVEL_SEC) — a 0-duration leg reveal isn't visually broken the way
 * a 0-duration pan/zoom is, so it's a legitimate, reachable value.
 */
export function routeStateAt(route: RouteObject | null, sec: number | null): RouteFrame {
  if (!route || !route.visible || !route.geometry) return HIDDEN

  if (sec === null) return { visible: true, fraction: 1 }

  const appearAt = route.appear.startSec
  if (sec < appearAt) return HIDDEN

  const segments = chainSegments(route.waypoints)
  if (segments.length === 0) return { visible: true, fraction: 1 }

  const fractions = legLengthFractions(route)
  // cumulative[i] = fraction of the route drawn once waypoint i has been reached.
  const cumulative: number[] = [0]
  for (const f of fractions) cumulative.push(cumulative[cumulative.length - 1] + f)

  const indexOfWaypoint = new Map(route.waypoints.map((w, i) => [w.id, i]))
  const elapsed = sec - appearAt

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const isLastSegment = i === segments.length - 1
    if (isLastSegment || elapsed < seg.startSec + seg.durationSec) {
      const wIdx = indexOfWaypoint.get(seg.waypointId)!
      if (seg.kind === 'hold') return { visible: true, fraction: cumulative[wIdx] }
      const t = seg.durationSec > 0 ? Math.min(1, Math.max(0, (elapsed - seg.startSec) / seg.durationSec)) : 1
      const fromFrac = cumulative[wIdx - 1]
      const toFrac = cumulative[wIdx]
      return { visible: true, fraction: fromFrac + (toFrac - fromFrac) * t }
    }
  }

  return { visible: true, fraction: 1 }
}
