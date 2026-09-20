import { useCallback, useRef } from 'react'
import type { AppearTiming } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { appearBarLayout, declutterHandlePositions } from './timelineLayout'
import { TimelineSegmentBoundaryHandle } from './TimelineSegmentBoundaryHandle'
import { useHorizontalDrag } from './useHorizontalDrag'
import styles from './Timeline.module.css'

/** Below this fracX delta (as a fraction of track width), a drag gesture is treated as a click, not a move. */
const CLICK_THRESHOLD_FRAC = 0.003

/** Minimum gap between two handles' render positions, as a percent of track width — see declutterHandlePositions. */
const MIN_HANDLE_GAP_PCT = 2

type AppearField = 'fadeInSec' | 'holdSec' | 'fadeOutSec'

export interface TimelineObjectRowProps {
  id: string
  label: string
  color: string
  appear: AppearTiming
  ctx: TimingContext
  selected: boolean
  onSelect: (id: string) => void
  onReposition: (id: string, startSec: number) => void
  onResizeField: (id: string, field: AppearField, valueSec: number) => void
}

/**
 * One row for a marker or an area: label, color swatch, 3-part fadeIn/
 * hold/fadeOut bar — draggable as a whole (reposition startSec),
 * clickable to select, and each of fadeIn/hold/fadeOut individually
 * stretchable via its own edge handle (hold/fadeOut only when there's a
 * finite duration to stretch — see hasFixedEnd below), same mechanism as
 * route/camera's per-segment handles.
 */
export function TimelineObjectRow({ id, label, color, appear, ctx, selected, onSelect, onReposition, onResizeField }: TimelineObjectRowProps) {
  const layout = appearBarLayout(appear, ctx)
  const trackRef = useRef<HTMLDivElement>(null)
  // Lazily initialized on the first onDrag call of each gesture (see handleDrag) — null between gestures.
  const gestureRef = useRef<{ fracX0: number; startSec0: number; moved: boolean } | null>(null)

  const handleDrag = useCallback(
    (fracX: number) => {
      if (!gestureRef.current) {
        gestureRef.current = { fracX0: fracX, startSec0: appear.startSec, moved: false }
      }
      const gesture = gestureRef.current
      if (!gesture.moved && Math.abs(fracX - gesture.fracX0) > CLICK_THRESHOLD_FRAC) gesture.moved = true
      const deltaSec = (fracX - gesture.fracX0) * ctx.totalSec
      onReposition(id, Math.max(0, gesture.startSec0 + deltaSec))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appear.startSec is read once, on gesture start; not a live dependency
    [ctx.totalSec, id, onReposition],
  )

  const handleDragEnd = useCallback(() => {
    if (gestureRef.current && !gestureRef.current.moved) onSelect(id)
    gestureRef.current = null
  }, [id, onSelect])

  const { startDrag } = useHorizontalDrag(trackRef, handleDrag, handleDragEnd)

  const handleSpecs: Array<{ leftPct: number; field: AppearField; currentValue: number }> = [
    { leftPct: layout.leftPct + layout.fadeInPct, field: 'fadeInSec', currentValue: appear.fadeInSec },
  ]
  if (!layout.hasFixedEnd) {
    handleSpecs.push(
      { leftPct: layout.leftPct + layout.fadeInPct + layout.holdPct, field: 'holdSec', currentValue: appear.holdSec ?? 0 },
      {
        leftPct: layout.leftPct + layout.fadeInPct + layout.holdPct + layout.fadeOutPct,
        field: 'fadeOutSec',
        currentValue: appear.fadeOutSec,
      },
    )
  }
  const handles = declutterHandlePositions(handleSpecs, MIN_HANDLE_GAP_PCT)

  return (
    <div className={`${styles.row} ${selected ? styles.rowSelected : ''}`} data-testid={`timeline-object-${id}`}>
      <div className={styles.rowLabel}>
        <span className={styles.swatch} style={{ background: color }} />
        <span className={styles.rowLabelText}>{label}</span>
      </div>
      <div
        ref={trackRef}
        className={`${styles.rowTrack} ${styles.rowTrackDraggable}`}
        onPointerDown={startDrag}
        data-testid={`timeline-track-${id}`}
      >
        <div className={styles.bar}>
          {layout.fadeInPct > 0 && (
            <div
              className={styles.barFadeIn}
              style={{ left: `${layout.leftPct}%`, width: `${layout.fadeInPct}%`, background: `linear-gradient(to right, transparent, ${color})` }}
            />
          )}
          <div
            className={styles.barHold}
            style={{ left: `${layout.leftPct + layout.fadeInPct}%`, width: `${layout.holdPct}%`, background: color }}
          />
          {layout.fadeOutPct > 0 && (
            <div
              className={styles.barFadeOut}
              style={{
                left: `${layout.leftPct + layout.fadeInPct + layout.holdPct}%`,
                width: `${layout.fadeOutPct}%`,
                background: `linear-gradient(to right, ${color}, transparent)`,
              }}
            />
          )}
        </div>
        {handles.map((h, i) => (
          <TimelineSegmentBoundaryHandle
            key={i}
            trackRef={trackRef}
            renderLeftPct={h.renderLeftPct}
            ctx={ctx}
            id={id}
            kind={h.field}
            currentValue={h.currentValue}
            onResize={(objId, field, valueSec) => onResizeField(objId, field, valueSec)}
            testIdPrefix="object-boundary"
          />
        ))}
      </div>
    </div>
  )
}
