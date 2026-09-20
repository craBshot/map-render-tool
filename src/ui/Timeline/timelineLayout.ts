import type { AppearTiming } from '../../state/types'
import { resolveHoldSec, type TimingContext } from '../../timeline/timing'
import { chainSegments, type ChainSegment, type ChainWaypoint } from '../../timeline/waypointChain'

function pct(sec: number, totalSec: number): number {
  if (totalSec <= 0) return 0
  return Math.min(100, Math.max(0, (sec / totalSec) * 100))
}

export interface AppearBarLayout {
  leftPct: number
  fadeInPct: number
  holdPct: number
  fadeOutPct: number
  /**
   * True when holdSec is undefined ("stay visible until the end") — the
   * bar is drawn flush to 100% with no fade-out sliver, since fadeOutStart
   * resolves to exactly totalSec and (per markerStateAt's/areaStateAt's
   * <= boundary) never actually renders mid-fade.
   */
  hasFixedEnd: boolean
}

/** Converts one object's AppearTiming into percentage-of-track layout for rendering as a 3-part fadeIn/hold/fadeOut bar. */
export function appearBarLayout(appear: AppearTiming, ctx: TimingContext): AppearBarLayout {
  const hasFixedEnd = appear.holdSec === undefined
  const hold = resolveHoldSec(appear, ctx)
  const leftSec = appear.startSec
  const fadeInEndSec = leftSec + appear.fadeInSec
  const holdEndSec = fadeInEndSec + hold
  const fadeOutEndSec = holdEndSec + (hasFixedEnd ? 0 : appear.fadeOutSec)

  const leftPct = pct(leftSec, ctx.totalSec)
  const fadeInEndPct = pct(fadeInEndSec, ctx.totalSec)
  const holdEndPct = pct(holdEndSec, ctx.totalSec)
  const fadeOutEndPct = pct(fadeOutEndSec, ctx.totalSec)

  return {
    leftPct,
    fadeInPct: fadeInEndPct - leftPct,
    holdPct: holdEndPct - fadeInEndPct,
    fadeOutPct: fadeOutEndPct - holdEndPct,
    hasFixedEnd,
  }
}

/** Minimal layout for route's {startSec}-only timing — a point, not a bar. */
export function pointLayout(startSec: number, ctx: TimingContext): { leftPct: number } {
  return { leftPct: pct(startSec, ctx.totalSec) }
}

export interface ChainSegmentLayout extends ChainSegment {
  leftPct: number
  widthPct: number
}

/**
 * A waypoint chain's hold/travel legs as percentage-of-track layout —
 * shared by the camera row (visualized, not draggable) and the route row
 * (visualized AND draggable — see TimelineSegmentBoundaryHandle.tsx).
 * `minTravelSec` matches whatever floor the chain's own domain uses (see
 * chainSegments()) — 0 for routes, camera.ts's MIN_TRAVEL_SEC for camera.
 */
export function chainSegmentsLayout(waypoints: ChainWaypoint[], ctx: TimingContext, minTravelSec = 0): ChainSegmentLayout[] {
  return chainSegments(waypoints, minTravelSec).map((seg) => ({
    ...seg,
    leftPct: pct(seg.startSec, ctx.totalSec),
    widthPct: pct(seg.startSec + seg.durationSec, ctx.totalSec) - pct(seg.startSec, ctx.totalSec),
  }))
}
