import { useCallback, useRef, type RefObject } from 'react'
import type { TimingContext } from '../../timeline/timing'
import { useHorizontalDrag } from './useHorizontalDrag'
import styles from './Timeline.module.css'

export interface TimelineSegmentBoundaryHandleProps<K extends string> {
  /** The row's own track element — shared with the parent so the drag measures the same px-to-second scale as the row itself. */
  trackRef: RefObject<HTMLDivElement | null>
  /** Render position (percent of track width) — post-declutter (see declutterHandlePositions), NOT necessarily the segment's exact mathematical boundary. */
  renderLeftPct: number
  ctx: TimingContext
  id: string
  kind: K
  /** The segment's current value (seconds) for whatever field `kind` names — read once, at gesture start (see handleDrag). */
  currentValue: number
  /** Reports Math.max(0, original + deltaSec) — floor is always >= 0 here; a caller needing a stricter floor (e.g. camera's MIN_TRAVEL_SEC) applies it again on top. */
  onResize: (id: string, kind: K, valueSec: number) => void
  testIdPrefix: string
}

/**
 * One segment's right-edge drag target — compresses/extends that segment
 * (a waypoint's holdSec/travelSec, or a marker/area's fadeInSec/holdSec/
 * fadeOutSec). Generic over `kind` so route, camera and marker/area rows
 * share this one primitive instead of three near-duplicates. Its own
 * component (not inlined in a parent .map()): useHorizontalDrag is a
 * hook, and the number of handles varies with the object's own waypoint/
 * segment count, so calling it inside a loop in the parent would violate
 * React's Rules of Hooks (see TimelineObjectRow, same reasoning).
 */
export function TimelineSegmentBoundaryHandle<K extends string>({
  trackRef,
  renderLeftPct,
  ctx,
  id,
  kind,
  currentValue,
  onResize,
  testIdPrefix,
}: TimelineSegmentBoundaryHandleProps<K>) {
  // Lazily initialized on the first onDrag call of each gesture — null between gestures (same pattern as TimelineObjectRow's gestureRef).
  const gestureRef = useRef<{ fracX0: number; value0: number } | null>(null)

  const handleDrag = useCallback(
    (fracX: number) => {
      if (!gestureRef.current) {
        gestureRef.current = { fracX0: fracX, value0: currentValue }
      }
      const gesture = gestureRef.current
      const deltaSec = (fracX - gesture.fracX0) * ctx.totalSec
      onResize(id, kind, Math.max(0, gesture.value0 + deltaSec))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentValue is read once, on gesture start; not a live dependency
    [ctx.totalSec, id, kind, onResize],
  )

  const handleDragEnd = useCallback(() => {
    gestureRef.current = null
  }, [])

  const { startDrag } = useHorizontalDrag(trackRef, handleDrag, handleDragEnd)

  return (
    <div
      className={styles.segmentBoundaryHandle}
      style={{ left: `${renderLeftPct}%` }}
      onPointerDown={(e) => {
        e.stopPropagation()
        startDrag(e)
      }}
      data-testid={`${testIdPrefix}-${id}-${kind}`}
    />
  )
}
