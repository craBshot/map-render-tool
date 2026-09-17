import maplibregl from 'maplibre-gl'
import { easeInOutCubic } from '../timeline/ease'
import type { CameraState } from '../state/types'

export interface CameraFrame {
  center: [number, number]
  /** Zoom normalized to the 1000px reference width, not yet viewport-adjusted. */
  zr: number
  bearing: number
  pitch: number
}

/**
 * Camera position at zoom-phase progress t (0..1). Pan speed is matched to
 * zoom speed by interpolating screen-space Mercator position rather than
 * lng/lat directly — see CLAUDE.md's known pitfalls.
 */
export function camAt(camera: CameraState, t: number): CameraFrame {
  const e = easeInOutCubic(Math.min(1, Math.max(0, t)))
  const z0 = camera.start.zr
  const z1 = camera.end.zr
  const z = z0 + (z1 - z0) * e

  let s = e
  if (Math.abs(z1 - z0) > 0.01) {
    s = (1 - Math.pow(2, -(z - z0))) / (1 - Math.pow(2, -(z1 - z0)))
  }

  const m0 = maplibregl.MercatorCoordinate.fromLngLat([camera.start.lng, camera.start.lat])
  const m1 = maplibregl.MercatorCoordinate.fromLngLat([camera.end.lng, camera.end.lat])
  const mc = new maplibregl.MercatorCoordinate(m0.x + (m1.x - m0.x) * s, m0.y + (m1.y - m0.y) * s, 0)
  const ll = mc.toLngLat()

  return { center: [ll.lng, ll.lat], zr: z, bearing: 0, pitch: 0 }
}
