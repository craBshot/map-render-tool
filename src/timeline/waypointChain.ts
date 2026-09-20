/**
 * Shared pure logic for any "chain of waypoints, each held then traveled
 * to" timing model — extracted from the camera (the first thing built
 * this way) since routes now need the exact same accumulation algorithm.
 * Position/geometry interpolation stays domain-specific (see camera.ts's
 * camSegmentAt, routeAnimation.ts's length-fraction lerp) — this module
 * only ever deals in seconds.
 */

export interface ChainWaypoint {
  id: string
  holdSec: number
  travelSec: number
}

export interface ChainSegment {
  waypointId: string
  kind: 'hold' | 'travel'
  startSec: number
  durationSec: number
}

function clampedHold(waypoint: ChainWaypoint): number {
  return Math.max(0, waypoint.holdSec)
}

function clampedTravel(waypoint: ChainWaypoint, minTravelSec: number): number {
  return Math.max(minTravelSec, waypoint.travelSec)
}

/**
 * Ordered list of the discrete hold/travel legs a chain consists of.
 * `minTravelSec` is a floor below which a travel leg would render too
 * abruptly to read (the camera needs this — MIN_TRAVEL_SEC in camera.ts;
 * routes don't, an instant reveal isn't visually broken, so they pass 0).
 */
export function chainSegments(waypoints: ChainWaypoint[], minTravelSec = 0): ChainSegment[] {
  const segments: ChainSegment[] = []
  let elapsed = 0
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i]
    if (i > 0) {
      const durationSec = clampedTravel(wp, minTravelSec)
      segments.push({ waypointId: wp.id, kind: 'travel', startSec: elapsed, durationSec })
      elapsed += durationSec
    }
    const durationSec = clampedHold(wp)
    segments.push({ waypointId: wp.id, kind: 'hold', startSec: elapsed, durationSec })
    elapsed += durationSec
  }
  return segments
}

/** Total duration of the whole chain: every waypoint's hold + travel (first waypoint's travel is 0). */
export function chainTotalSec(waypoints: ChainWaypoint[], minTravelSec = 0): number {
  return waypoints.reduce((sum, wp, i) => sum + clampedHold(wp) + (i === 0 ? 0 : clampedTravel(wp, minTravelSec)), 0)
}
