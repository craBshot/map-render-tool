import { easeOutBack } from '../timeline/ease'
import type { TimingTotals } from '../timeline/timing'
import type { MarkerObject } from '../state/types'

export interface MarkerFrame {
  visible: boolean
  radius: number
  opacity: number
  haloRadius: number
  haloOpacity: number
}

const HIDDEN: MarkerFrame = { visible: false, radius: 0, opacity: 0, haloRadius: 0, haloOpacity: 0 }

function appearTimeSec(marker: MarkerObject, timing: TimingTotals): number {
  switch (marker.appear.mode) {
    case 'start':
      return 0
    case 'zoomStart':
      return timing.holdStartSec
    case 'zoomEnd':
      return timing.holdStartSec + timing.zoomDurationSec
    case 'custom':
      return Math.max(0, marker.appear.atSec ?? 0)
  }
}

/**
 * Marker pop-in + pulse state at time sec. sec === null is the static
 * editor preview (full-strength halo, no time-based hide/appear gating).
 */
export function markerStateAt(
  marker: MarkerObject,
  timing: TimingTotals,
  sec: number | null,
): MarkerFrame {
  if (!marker.visible) return HIDDEN

  if (sec === null) {
    return {
      visible: true,
      radius: marker.sizePx,
      opacity: 1,
      haloRadius: marker.pulse.enabled ? marker.sizePx * (1 + (marker.pulse.scale - 1) * 0.6) : 0,
      haloOpacity: marker.pulse.enabled ? marker.pulse.strength * 0.5 : 0,
    }
  }

  const appearAt = appearTimeSec(marker, timing)
  if (sec < appearAt) return { visible: true, radius: 0, opacity: 0, haloRadius: 0, haloOpacity: 0 }

  const pop = marker.appear.popDurationSec
  const k = pop > 0 ? Math.min(1, (sec - appearAt) / pop) : 1
  const radius = Math.max(0, marker.sizePx * easeOutBack(k))
  const opacity = Math.min(1, k * 2)

  let haloRadius = 0
  let haloOpacity = 0
  if (marker.pulse.enabled && k >= 1) {
    const phase = (((sec - appearAt - pop) / marker.pulse.periodSec) % 1 + 1) % 1
    const e = 1 - Math.pow(1 - phase, 3)
    haloRadius = marker.sizePx + (marker.sizePx * marker.pulse.scale - marker.sizePx) * e
    haloOpacity = marker.pulse.strength * (1 - phase)
  }

  return { visible: true, radius, opacity, haloRadius, haloOpacity }
}
