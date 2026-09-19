import { easeOutQuad } from '../timeline/ease'
import { resolveHoldSec, type TimingContext } from '../timeline/timing'
import type { AreaObject } from '../state/types'

export interface AreaFrame {
  visible: boolean
  opacity: number
}

/**
 * Area fade-in/hold/fade-out state at time sec. sec === null is the static
 * editor preview (fully visible, no gating). Visibility gating on
 * area.visible / styleId !== null happens in MapController, not here —
 * this only computes the appear-timing curve.
 */
export function areaStateAt(area: AreaObject, ctx: TimingContext, sec: number | null): AreaFrame {
  if (sec === null) return { visible: true, opacity: 1 }

  const appearAt = area.appear.startSec
  if (sec < appearAt) return { visible: true, opacity: 0 }

  const fadeIn = area.appear.fadeInSec
  const hold = resolveHoldSec(area.appear, ctx)
  const fadeOutStart = appearAt + fadeIn + hold
  const fadeOut = area.appear.fadeOutSec

  // <= (not <): see markerAnimation.ts's identical note — the default
  // holdSec===undefined makes fadeOutStart===ctx.totalSec exactly, and the
  // last rendered frame must stay fully visible, not start fading out.
  if (sec <= fadeOutStart) {
    const k = fadeIn > 0 ? Math.min(1, (sec - appearAt) / fadeIn) : 1
    // A plain ease-out ramp, not easeOutBack's overshoot — a bouncing filled
    // polygon reads wrong the way a bouncing circle marker doesn't.
    return { visible: true, opacity: easeOutQuad(k) }
  }

  const k2 = fadeOut > 0 ? Math.min(1, (sec - fadeOutStart) / fadeOut) : 1
  return { visible: true, opacity: easeOutQuad(1 - k2) }
}
