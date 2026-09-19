import { easeOutBack } from '../timeline/ease'
import { resolveHoldSec, type TimingContext } from '../timeline/timing'
import type { MarkerObject } from '../state/types'

export interface MarkerFrame {
  visible: boolean
  radius: number
  opacity: number
  haloRadius: number
  haloOpacity: number
}

const HIDDEN: MarkerFrame = { visible: false, radius: 0, opacity: 0, haloRadius: 0, haloOpacity: 0 }

/**
 * Marker pop-in + pulse + pop-out state at time sec. sec === null is the
 * static editor preview (full-strength halo, no time-based hide/appear/
 * disappear gating).
 */
export function markerStateAt(marker: MarkerObject, ctx: TimingContext, sec: number | null): MarkerFrame {
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

  const appearAt = marker.appear.startSec
  if (sec < appearAt) return { visible: true, radius: 0, opacity: 0, haloRadius: 0, haloOpacity: 0 }

  const fadeIn = marker.appear.fadeInSec
  const hold = resolveHoldSec(marker.appear, ctx)
  const fadeOutStart = appearAt + fadeIn + hold
  const fadeOut = marker.appear.fadeOutSec

  // <= (not <): at the default holdSec===undefined, fadeOutStart === ctx.totalSec exactly, and the last
  // rendered frame (sec === totalSec) must stay fully visible, not fall into the fade-out branch.
  if (sec <= fadeOutStart) {
    const k = fadeIn > 0 ? Math.min(1, (sec - appearAt) / fadeIn) : 1
    const radius = Math.max(0, marker.sizePx * easeOutBack(k))
    const opacity = Math.min(1, k * 2)

    let haloRadius = 0
    let haloOpacity = 0
    if (marker.pulse.enabled && k >= 1) {
      const phase = (((sec - appearAt - fadeIn) / marker.pulse.periodSec) % 1 + 1) % 1
      const e = 1 - Math.pow(1 - phase, 3)
      haloRadius = marker.sizePx + (marker.sizePx * marker.pulse.scale - marker.sizePx) * e
      haloOpacity = marker.pulse.strength * (1 - phase)
    }

    return { visible: true, radius, opacity, haloRadius, haloOpacity }
  }

  const k2 = fadeOut > 0 ? Math.min(1, (sec - fadeOutStart) / fadeOut) : 1
  const kMirror = 1 - k2
  const radius = Math.max(0, marker.sizePx * easeOutBack(kMirror))
  const opacity = Math.min(1, kMirror * 2)
  return { visible: true, radius, opacity, haloRadius: 0, haloOpacity: 0 }
}
