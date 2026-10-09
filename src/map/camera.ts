import * as maplibregl from 'maplibre-gl'
import { easeInOutCubic } from '../timeline/ease'
import { chainSegments, chainTotalSec, type ChainSegment } from '../timeline/waypointChain'
import type { CameraPoint, CameraState, CameraWaypoint } from '../state/types'

export interface CameraFrame {
  center: [number, number]
  /** Zoom normalized to the 1000px reference width, not yet viewport-adjusted. */
  zr: number
  bearing: number
  pitch: number
}

/** Below this, a travel leg would zoom/pan too abruptly to read — same floor as the old fixed zoomDurationSec. */
export const MIN_TRAVEL_SEC = 0.5

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

/** Total duration of the whole camera flight: every waypoint's hold + travel (first waypoint's travel is 0). */
export function cameraTotalSec(waypoints: CameraWaypoint[]): number {
  return chainTotalSec(waypoints, MIN_TRAVEL_SEC)
}

/** Static frame at a single point — e.g. CameraPanel's per-waypoint "show" button. */
export function camStaticAt(point: CameraPoint): CameraFrame {
  return camSegmentAt(point, point, 0)
}

export type CameraSegment = ChainSegment

/**
 * Ordered list of the discrete hold/travel legs a flight consists of — the
 * same clamped durations camAt()/cameraTotalSec() use internally, exposed
 * for visualization (the Timeline's camera row).
 */
export function cameraSegments(waypoints: CameraWaypoint[]): CameraSegment[] {
  return chainSegments(waypoints, MIN_TRAVEL_SEC)
}

/**
 * Camera frame at absolute project time `sec`. Walks the waypoint chain
 * (via the shared chainSegments()) until it finds the segment (holding at
 * a waypoint, or traveling to the next one) that `sec` falls into, then
 * delegates to camSegmentAt() for that segment's local progress. Clamps
 * before the first waypoint and after the last one's hold.
 */
export function camAt(camera: CameraState, sec: number): CameraFrame {
  const wps = camera.waypoints
  const clamped = Math.max(0, sec)
  const segments = chainSegments(wps, MIN_TRAVEL_SEC)

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const isLastSegment = i === segments.length - 1
    if (isLastSegment || clamped < seg.startSec + seg.durationSec) {
      const wp = wps.find((w) => w.id === seg.waypointId)!
      if (seg.kind === 'hold') return camStaticAt(wp)
      const from = wps[wps.findIndex((w) => w.id === seg.waypointId) - 1]
      const t = seg.durationSec > 0 ? (clamped - seg.startSec) / seg.durationSec : 1
      return camSegmentAt(from, wp, t)
    }
  }

  return camStaticAt(wps[wps.length - 1])
}
