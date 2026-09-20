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
  /** The hold segment's resolved duration in seconds (see resolveHoldSec) — for labeling, since holdPct alone can't be turned back into seconds. */
  holdSec: number
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
    holdSec: hold,
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
 * `offsetSec` shifts the whole chain in project time — the camera's chain
 * always starts at project time 0 (offset 0, the default); a route's chain
 * starts at its own appear.startSec, since (unlike the camera) it doesn't
 * span the whole project timeline. Returned segments' startSec is in
 * project-time (already includes the offset), matching what routeAnimation
 * consumes it as.
 */
export function chainSegmentsLayout(
  waypoints: ChainWaypoint[],
  ctx: TimingContext,
  minTravelSec = 0,
  offsetSec = 0,
): ChainSegmentLayout[] {
  return chainSegments(waypoints, minTravelSec).map((seg) => {
    const startSec = seg.startSec + offsetSec
    return {
      ...seg,
      startSec,
      leftPct: pct(startSec, ctx.totalSec),
      widthPct: pct(startSec + seg.durationSec, ctx.totalSec) - pct(startSec, ctx.totalSec),
    }
  })
}

/**
 * Given handles' true mathematical positions (already left-to-right
 * sorted), returns render positions nudged apart by at least minGapPct —
 * greedy left-to-right, only ever pushes right. Leaves each item's own
 * `leftPct` untouched (drag math still uses the segment's real boundary,
 * captured at gesture start); only the *hit-target* render position
 * changes. Without this, a 0-duration segment's handle exactly coincides
 * with its neighbor's and becomes physically unreachable — a real bug,
 * not a hypothetical: a route's default (0s) holds put every hold
 * segment's handle exactly on top of the preceding travel segment's,
 * leaving only the travel handles clickable.
 */
export function declutterHandlePositions<T extends { leftPct: number }>(
  items: T[],
  minGapPct: number,
): (T & { renderLeftPct: number })[] {
  let lastRenderPct = -Infinity
  return items.map((item) => {
    const renderLeftPct = Math.max(item.leftPct, lastRenderPct + minGapPct)
    lastRenderPct = renderLeftPct
    return { ...item, renderLeftPct }
  })
}
