import { easeOutQuad } from '../timeline/ease'
import { resolveHoldSec, type TimingContext } from '../timeline/timing'
import type { AreaStyle } from '../state/types'

export interface AreaFrame {
  visible: boolean
  opacity: number
}

const HIDDEN: AreaFrame = { visible: false, opacity: 0 }

/**
 * Area fade-in/hold/fade-out state at time sec. Appear timing lives on the
 * style, not the area, so this takes the resolved style rather than the
 * AreaObject — style === null means "no style assigned" (in the list, not
 * highlighted). sec === null is the static editor preview (fully visible,
 * no gating).
 */
export function areaStateAt(style: AreaStyle | null, ctx: TimingContext, sec: number | null): AreaFrame {
  if (!style) return HIDDEN

  if (sec === null) return { visible: true, opacity: 1 }

  const appearAt = style.appear.startSec
  if (sec < appearAt) return { visible: true, opacity: 0 }

  const fadeIn = style.appear.fadeInSec
  const hold = resolveHoldSec(style.appear, ctx)
  const fadeOutStart = appearAt + fadeIn + hold
  const fadeOut = style.appear.fadeOutSec

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
