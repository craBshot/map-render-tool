import { useCallback, useRef, type RefObject } from 'react'
import { useHorizontalDrag } from './useHorizontalDrag'
import styles from './Timeline.module.css'

export interface TimelineKeyframeHandleProps {
  trackRef: RefObject<HTMLDivElement | null>
  /** Render position (percent of track width), post-declutter. */
  renderLeftPct: number
  totalSec: number
  id: string
  /** The waypoint's current arrival time — read once, at gesture start. */
  arrivalSec: number
  /** null: fixed (the first waypoint, the flight's time origin). */
  onMove: ((id: string, arrivalSec: number) => void) | null
  label: string
}

/**
 * A camera waypoint's arrival on the Timeline, drawn as a keyframe diamond.
 * Dragging reports a new absolute arrival time; the caller moves only that
 * waypoint (see moveChainWaypoint). Seconds-per-pixel is frozen at gesture
 * start: dragging the last keyframe changes the total length and thus the
 * track's scale, which would otherwise feed back into the drag. Unclamped,
 * so the last keyframe can be pulled past the current end.
 */
export function TimelineKeyframeHandle({ trackRef, renderLeftPct, totalSec, id, arrivalSec, onMove, label }: TimelineKeyframeHandleProps) {
  const gestureRef = useRef<{ fracX0: number; arrival0: number; total0: number } | null>(null)

  const handleDrag = useCallback(
    (fracX: number) => {
      if (!onMove) return
      if (!gestureRef.current) gestureRef.current = { fracX0: fracX, arrival0: arrivalSec, total0: totalSec }
      const g = gestureRef.current
      onMove(id, g.arrival0 + (fracX - g.fracX0) * g.total0)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arrivalSec/totalSec are read once, on gesture start
    [id, onMove],
  )

  const handleDragEnd = useCallback(() => {
    gestureRef.current = null
  }, [])

  const { startDrag } = useHorizontalDrag(trackRef, handleDrag, handleDragEnd, false)

  return (
    <div
      className={onMove ? styles.keyframe : `${styles.keyframe} ${styles.keyframeFixed}`}
      style={{ left: `${renderLeftPct}%` }}
      onPointerDown={(e) => {
        if (!onMove) return
        e.stopPropagation()
        startDrag(e)
      }}
      data-testid={`camera-keyframe-${id}`}
    >
      <span className={styles.keyframeLabel}>{label}</span>
    </div>
  )
}
