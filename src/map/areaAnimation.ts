import { easeOutQuad } from '../timeline/ease'
import type { TimingTotals } from '../timeline/timing'
import type { AreaStyle } from '../state/types'

export interface AreaFrame {
  visible: boolean
  opacity: number
}

const HIDDEN: AreaFrame = { visible: false, opacity: 0 }

function appearTimeSec(style: AreaStyle, timing: TimingTotals): number {
  switch (style.appear.mode) {
    case 'start':
      return 0
    case 'zoomStart':
      return timing.holdStartSec
    case 'zoomEnd':
      return timing.holdStartSec + timing.zoomDurationSec
    case 'custom':
      return Math.max(0, style.appear.atSec ?? 0)
  }
}

/**
 * Area fade-in state at time sec. Appear timing lives on the style, not the
 * area, so this takes the resolved style rather than the AreaObject —
 * style === null means "no style assigned" (in the list, not highlighted).
 * sec === null is the static editor preview (fully visible, no gating).
 */
export function areaStateAt(style: AreaStyle | null, timing: TimingTotals, sec: number | null): AreaFrame {
  if (!style) return HIDDEN

  if (sec === null) return { visible: true, opacity: 1 }

  const appearAt = appearTimeSec(style, timing)
  if (sec < appearAt) return { visible: true, opacity: 0 }

  const fade = style.appear.fadeDurationSec
  const k = fade > 0 ? Math.min(1, (sec - appearAt) / fade) : 1
  // A plain ease-out ramp, not easeOutBack's overshoot — a bouncing filled
  // polygon reads wrong the way a bouncing circle marker doesn't.
  return { visible: true, opacity: easeOutQuad(k) }
}
