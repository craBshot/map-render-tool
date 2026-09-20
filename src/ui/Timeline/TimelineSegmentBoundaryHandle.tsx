import { useCallback, useRef, type RefObject } from 'react'
import type { TimingContext } from '../../timeline/timing'
import { useHorizontalDrag } from './useHorizontalDrag'
import styles from './Timeline.module.css'

export interface TimelineSegmentBoundaryHandleProps {
  /** The row's own track element — shared with the parent so the drag measures the same px-to-second scale as the row itself. */
  trackRef: RefObject<HTMLDivElement | null>
  /** Position of this segment's right edge, as a percentage of the track width. */
  leftPct: number
  ctx: TimingContext
  waypointId: string
  kind: 'hold' | 'travel'
  /** The segment's current holdSec/travelSec value — read once, at gesture start (see handleDrag). */
  currentValue: number
  onResize: (waypointId: string, kind: 'hold' | 'travel', valueSec: number) => void
}

/**
 * One segment's right-edge drag target — compresses/extends that segment
 * (a route waypoint's holdSec or travelSec). Its own component (not inlined
 * in TimelineRouteRow's .map()): useHorizontalDrag is a hook, and the
 * number of boundaries varies with route.waypoints.length, so calling it
 * inside a loop in the parent would violate React's Rules of Hooks (see
 * TimelineObjectRow, which is its own component for the same reason).
 */
export function TimelineSegmentBoundaryHandle({
  trackRef,
  leftPct,
  ctx,
  waypointId,
  kind,
  currentValue,
  onResize,
}: TimelineSegmentBoundaryHandleProps) {
  // Lazily initialized on the first onDrag call of each gesture — null between gestures (same pattern as TimelineObjectRow's gestureRef).
  const gestureRef = useRef<{ fracX0: number; value0: number } | null>(null)

  const handleDrag = useCallback(
    (fracX: number) => {
      if (!gestureRef.current) {
        gestureRef.current = { fracX0: fracX, value0: currentValue }
      }
      const gesture = gestureRef.current
      const deltaSec = (fracX - gesture.fracX0) * ctx.totalSec
      onResize(waypointId, kind, Math.max(0, gesture.value0 + deltaSec))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentValue is read once, on gesture start; not a live dependency
    [ctx.totalSec, waypointId, kind, onResize],
  )

  const handleDragEnd = useCallback(() => {
    gestureRef.current = null
  }, [])

  const { startDrag } = useHorizontalDrag(trackRef, handleDrag, handleDragEnd)

  return (
    <div
      className={styles.segmentBoundaryHandle}
      style={{ left: `${leftPct}%` }}
      onPointerDown={startDrag}
      data-testid={`route-boundary-${waypointId}-${kind}`}
    />
  )
}
