import maplibregl from 'maplibre-gl'
import { easeInOutCubic } from '../timeline/ease'
import type { CameraPoint, CameraState, CameraWaypoint } from '../state/types'

export interface CameraFrame {
  center: [number, number]
  /** Zoom normalized to the 1000px reference width, not yet viewport-adjusted. */
  zr: number
  bearing: number
  pitch: number
}

/** Below this, a travel leg would zoom/pan too abruptly to read — same floor as the old fixed zoomDurationSec. */
const MIN_TRAVEL_SEC = 0.5

/**
 * Camera position interpolated between two points at local progress t
 * (0..1). Pan speed is matched to zoom speed by interpolating
 * screen-space Mercator position rather than lng/lat directly — see
 * CLAUDE.md's known pitfalls. from===to (t ignored) gives a static frame
 * at that point.
 */
function camSegmentAt(from: CameraPoint, to: CameraPoint, t: number): CameraFrame {
  const e = easeInOutCubic(Math.min(1, Math.max(0, t)))
  const z0 = from.zr
  const z1 = to.zr
  const z = z0 + (z1 - z0) * e

  let s = e
  if (Math.abs(z1 - z0) > 0.01) {
    s = (1 - Math.pow(2, -(z - z0))) / (1 - Math.pow(2, -(z1 - z0)))
  }

  const m0 = maplibregl.MercatorCoordinate.fromLngLat([from.lng, from.lat])
  const m1 = maplibregl.MercatorCoordinate.fromLngLat([to.lng, to.lat])
  const mc = new maplibregl.MercatorCoordinate(m0.x + (m1.x - m0.x) * s, m0.y + (m1.y - m0.y) * s, 0)
  const ll = mc.toLngLat()

  return { center: [ll.lng, ll.lat], zr: z, bearing: 0, pitch: 0 }
}

function clampedHold(waypoint: CameraWaypoint): number {
  return Math.max(0, waypoint.holdSec)
}

function clampedTravel(waypoint: CameraWaypoint): number {
  return Math.max(MIN_TRAVEL_SEC, waypoint.travelSec)
}

/** Total duration of the whole camera flight: every waypoint's hold + travel (first waypoint's travel is 0). */
export function cameraTotalSec(waypoints: CameraWaypoint[]): number {
  return waypoints.reduce((sum, wp, i) => sum + clampedHold(wp) + (i === 0 ? 0 : clampedTravel(wp)), 0)
}

/** Static frame at a single point — e.g. CameraPanel's per-waypoint "show" button. */
export function camStaticAt(point: CameraPoint): CameraFrame {
  return camSegmentAt(point, point, 0)
}

export interface CameraSegment {
  waypointId: string
  kind: 'hold' | 'travel'
  startSec: number
  durationSec: number
}

/**
 * Ordered list of the discrete hold/travel legs a flight consists of — the
 * same clamped durations camAt()/cameraTotalSec() use internally, exposed
 * for visualization (the Timeline's camera row).
 */
export function cameraSegments(waypoints: CameraWaypoint[]): CameraSegment[] {
  const segments: CameraSegment[] = []
  let elapsed = 0
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i]
    if (i > 0) {
      const durationSec = clampedTravel(wp)
      segments.push({ waypointId: wp.id, kind: 'travel', startSec: elapsed, durationSec })
      elapsed += durationSec
    }
    const durationSec = clampedHold(wp)
    segments.push({ waypointId: wp.id, kind: 'hold', startSec: elapsed, durationSec })
    elapsed += durationSec
  }
  return segments
}

/**
 * Camera frame at absolute project time `sec`. Walks the waypoint chain,
 * accumulating elapsed hold/travel time, until it finds the segment
 * (holding at a waypoint, or traveling to the next one) that `sec` falls
 * into, then delegates to camSegmentAt() for that segment's local
 * progress. Clamps before the first waypoint and after the last one's hold.
 */
export function camAt(camera: CameraState, sec: number): CameraFrame {
  const wps = camera.waypoints
  const clamped = Math.max(0, sec)
  let elapsed = 0

  for (let i = 0; i < wps.length; i++) {
    const wp = wps[i]

    if (i > 0) {
      const travel = clampedTravel(wp)
      if (clamped < elapsed + travel) {
        return camSegmentAt(wps[i - 1], wp, (clamped - elapsed) / travel)
      }
      elapsed += travel
    }

    const hold = clampedHold(wp)
    const isLast = i === wps.length - 1
    if (isLast || clamped < elapsed + hold) {
      return camStaticAt(wp)
    }
    elapsed += hold
  }

  return camStaticAt(wps[wps.length - 1])
}
