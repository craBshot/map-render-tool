/** The one piece of camera-agnostic context marker/area appear-timing resolution needs. */
export interface TimingContext {
  totalSec: number
}

/** Resolves an object's actual hold duration: the stored value, or "until the project ends" if unset. */
export function resolveHoldSec(
  appear: { startSec: number; fadeInSec: number; holdSec?: number },
  ctx: TimingContext,
): number {
  if (appear.holdSec !== undefined) return Math.max(0, appear.holdSec)
  return Math.max(0, ctx.totalSec - appear.startSec - appear.fadeInSec)
}
