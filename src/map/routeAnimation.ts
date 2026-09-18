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
 * it linearly over a fixed drawDurationSec — a plain duration rather than a
 * simulated travel speed, since the camera flight itself is usually only a
 * few seconds long and a "realistic" speed would rarely finish drawing
 * within it.
 */
export function routeStateAt(route: RouteObject | null, timing: TimingTotals, sec: number | null): RouteFrame {
  if (!route || !route.visible || !route.geometry) return HIDDEN

  if (sec === null) return { visible: true, fraction: 1 }

  const appearAt = appearTimeSec(route.appear, timing)
  if (sec < appearAt) return HIDDEN

  if (route.reveal === 'instant') return { visible: true, fraction: 1 }

  const fraction = route.drawDurationSec > 0 ? Math.min(1, (sec - appearAt) / route.drawDurationSec) : 1
  return { visible: true, fraction }
}
