import { totalLineLengthMeters } from './routeGeometry'
import type { TimingTotals } from '../timeline/timing'
import type { RouteObject } from '../state/types'

export interface RouteFrame {
  visible: boolean
  /** Fraction of the route's length that should be drawn (0..1). Geometry is applied in MapController, not here. */
  fraction: number
}

const HIDDEN: RouteFrame = { visible: false, fraction: 0 }

function appearTimeSec(appear: RouteObject['appear'], timing: TimingTotals): number {
  switch (appear.mode) {
    case 'start':
      return 0
    case 'zoomStart':
      return timing.holdStartSec
    case 'zoomEnd':
      return timing.holdStartSec + timing.zoomDurationSec
    case 'custom':
      return Math.max(0, appear.atSec ?? 0)
  }
}

/**
 * Route draw state at time sec. sec === null is the static editor preview
 * (fully drawn, no gating) — same convention as markerStateAt/areaStateAt.
 * Unlike those, the reveal itself is a modifier on the route, not fixed:
 * 'instant' shows the whole line the moment it appears; 'progressive' draws
 * it at a configurable simulated travel speed (km/h), so the actual draw
 * duration is derived from the route's length, not a fixed number of
 * seconds — a long route takes longer to draw than a short one at the same
 * speed.
 */
export function routeStateAt(route: RouteObject | null, timing: TimingTotals, sec: number | null): RouteFrame {
  if (!route || !route.visible || !route.geometry) return HIDDEN

  if (sec === null) return { visible: true, fraction: 1 }

  const appearAt = appearTimeSec(route.appear, timing)
  if (sec < appearAt) return HIDDEN

  if (route.reveal === 'instant') return { visible: true, fraction: 1 }

  if (route.drawSpeedKmh <= 0) return { visible: true, fraction: 1 }

  const totalKm = totalLineLengthMeters(route.geometry.coordinates) / 1000
  const durationSec = (totalKm / route.drawSpeedKmh) * 3600
  const fraction = durationSec > 0 ? Math.min(1, (sec - appearAt) / durationSec) : 1
  return { visible: true, fraction }
}
