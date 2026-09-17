import type { CameraState } from '../state/types'

export interface TimingTotals {
  holdStartSec: number
  zoomDurationSec: number
  holdEndSec: number
  totalSec: number
}

/** Clamps raw timing values to sane bounds and computes the total duration. */
export function timingTotals(timing: CameraState['timing']): TimingTotals {
  const holdStartSec = Math.max(0, timing.holdStartSec)
  const zoomDurationSec = Math.max(0.5, timing.zoomDurationSec)
  const holdEndSec = Math.max(0, timing.holdEndSec)
  return {
    holdStartSec,
    zoomDurationSec,
    holdEndSec,
    totalSec: holdStartSec + zoomDurationSec + holdEndSec,
  }
}

/** Progress through the zoom phase (0..1) for a given elapsed time. */
export function zoomProgressAt(sec: number, timing: CameraState['timing']): number {
  const { holdStartSec, zoomDurationSec } = timingTotals(timing)
  if (sec < holdStartSec) return 0
  return Math.min(1, (sec - holdStartSec) / zoomDurationSec)
}
