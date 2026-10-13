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

/** Arrival time of every waypoint (waypoints[0] arrives at 0), same clamping as chainSegments(). */
export function chainArrivalsSec(waypoints: ChainWaypoint[], minTravelSec = 0): number[] {
  const arrivals: number[] = []
  let elapsed = 0
  for (let i = 0; i < waypoints.length; i++) {
    if (i > 0) elapsed += clampedTravel(waypoints[i], minTravelSec)
    arrivals.push(elapsed)
    elapsed += clampedHold(waypoints[i])
  }
  return arrivals
}

/** Rebuilds each waypoint's travelSec from absolute arrival times (already ordered). Holds are kept. */
function fromArrivals<W extends ChainWaypoint>(waypoints: W[], arrivals: number[]): W[] {
  return waypoints.map((wp, i) =>
    i === 0 ? { ...wp, travelSec: 0 } : { ...wp, travelSec: arrivals[i] - (arrivals[i - 1] + clampedHold(waypoints[i - 1])) },
  )
}

/**
 * Keyframe-style move: the waypoint gets a new arrival time, every other
 * waypoint keeps its own — only the travel legs around the old and the new
 * position change. Moving past a neighbor reorders the chain (the moved
 * waypoint's hold travels with it). waypoints[0] is the time origin and
 * can't move or be overtaken. Landing inside another waypoint's hold snaps
 * to whichever side of it is nearer; the result is clamped so every travel
 * leg stays >= minTravelSec. Moving the last waypoint changes the chain's
 * total length — there is no right bound.
 */
export function moveChainWaypoint<W extends ChainWaypoint>(waypoints: W[], id: string, arrivalSec: number, minTravelSec = 0): W[] {
  const from = waypoints.findIndex((w) => w.id === id)
  if (from <= 0) return waypoints

  const arrivals = chainArrivalsSec(waypoints, minTravelSec)
  const moved = waypoints[from]
  const others = waypoints.filter((_, i) => i !== from)
  const otherArrivals = arrivals.filter((_, i) => i !== from)

  // Insert after the last waypoint whose hold midpoint lies before the target — never before waypoints[0].
  let insertAt = 1
  for (let j = 1; j < others.length; j++) {
    if (arrivalSec > otherArrivals[j] + clampedHold(others[j]) / 2) insertAt = j + 1
  }

  const prevEnd = otherArrivals[insertAt - 1] + clampedHold(others[insertAt - 1])
  const lower = prevEnd + minTravelSec
  const upper = insertAt < others.length ? otherArrivals[insertAt] - clampedHold(moved) - minTravelSec : Infinity
  // Gap too narrow for the moved waypoint: sit right after the previous one; the next leg then gets the floor.
  const arrival = upper < lower ? lower : Math.min(upper, Math.max(lower, arrivalSec))

  const ordered = [...others.slice(0, insertAt), moved, ...others.slice(insertAt)]
  const orderedArrivals = [...otherArrivals.slice(0, insertAt), arrival, ...otherArrivals.slice(insertAt)]
  if (upper < lower) {
    // Push the rest back just enough to restore the floor (only in this degenerate case does anything else move).
    for (let i = insertAt + 1; i < ordered.length; i++) {
      const minArrival = orderedArrivals[i - 1] + clampedHold(ordered[i - 1]) + minTravelSec
      orderedArrivals[i] = Math.max(orderedArrivals[i], minArrival)
    }
  }
  return fromArrivals(ordered, orderedArrivals)
}

/**
 * Keyframe-style hold resize: lengthening a hold eats into the next travel
 * leg instead of pushing every later waypoint back (clamped so that leg
 * stays >= minTravelSec). The last waypoint's hold is unbounded — it sets
 * the chain's end.
 */
export function resizeChainHold<W extends ChainWaypoint>(waypoints: W[], id: string, holdSec: number, minTravelSec = 0): W[] {
  const i = waypoints.findIndex((w) => w.id === id)
  if (i < 0) return waypoints
  const arrivals = chainArrivalsSec(waypoints, minTravelSec)
  const max = i < waypoints.length - 1 ? arrivals[i + 1] - arrivals[i] - minTravelSec : Infinity
  const hold = Math.min(max, Math.max(0, holdSec))
  const resized = waypoints.map((w, j) => (j === i ? { ...w, holdSec: hold } : w))
  return fromArrivals(resized, arrivals)
}
