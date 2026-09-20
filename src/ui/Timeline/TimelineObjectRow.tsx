import { useCallback, useRef } from 'react'
import type { AppearTiming } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { appearBarLayout, declutterHandlePositions } from './timelineLayout'
import { lighten } from './timelineColor'
import { TimelineSegmentBoundaryHandle } from './TimelineSegmentBoundaryHandle'
import { useHorizontalDrag } from './useHorizontalDrag'
import styles from './Timeline.module.css'

/** Below this fracX delta (as a fraction of track width), a drag gesture is treated as a click, not a move. */
const CLICK_THRESHOLD_FRAC = 0.003

/** Minimum gap between two handles' render positions, as a percent of track width — see declutterHandlePositions. */
const MIN_HANDLE_GAP_PCT = 2

/** Floor for the bar's rendered width (percent of track) so a fully-degenerate 0/0/0 timing still renders a clickable sliver instead of vanishing. */
const MIN_BAR_PCT = 0.5

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
 *
 * Visual convention matches route/camera: solid full-color hold, solid
 * lighter-tint fadeIn/fadeOut (timelineColor.ts's lighten()) — a hard
 * boundary between segments and against the empty track, not a
 * transparency gradient (which left fadeIn/fadeOut with no visible edge).
 * The reposition-drag/select pointer handler sits on the bar element
 * itself (sized to the object's actual [startSec, end] span), not the
 * full-width track — clicking the empty track outside the bar no longer
 * drags or selects it.
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

  // The bar spans only the object's own [startSec, end] range, not the full track — rendering
  // and the drag/select hit target both use this span, not the track's full width. fadeIn/hold/
  // fadeOut percentages below are local to the bar's own width, not the track's.
  const rawBarPct = layout.fadeInPct + layout.holdPct + layout.fadeOutPct
  const barPct = Math.max(rawBarPct, MIN_BAR_PCT)
  const fadeInLocalPct = (layout.fadeInPct / barPct) * 100
  const holdLocalPct = (layout.holdPct / barPct) * 100
  const fadeOutLocalPct = (layout.fadeOutPct / barPct) * 100
  const fadeColor = lighten(color, 0.35)

  return (
    <div className={`${styles.row} ${selected ? styles.rowSelected : ''}`} data-testid={`timeline-object-${id}`}>
      <div className={styles.rowLabel}>
        <span className={styles.swatch} style={{ background: color }} />
        <span className={styles.rowLabelText}>{label}</span>
      </div>
      <div ref={trackRef} className={styles.rowTrack} data-testid={`timeline-track-${id}`}>
        <div
          className={`${styles.bar} ${styles.barDraggable}`}
          style={{ left: `${layout.leftPct}%`, width: `${barPct}%` }}
          onPointerDown={startDrag}
        >
          {layout.fadeInPct > 0 && (
            <div className={styles.barFadeIn} style={{ left: 0, width: `${fadeInLocalPct}%`, background: fadeColor }} />
          )}
          <div className={styles.barHold} style={{ left: `${fadeInLocalPct}%`, width: `${holdLocalPct}%`, background: color }} />
          {layout.fadeOutPct > 0 && (
            <div
              className={styles.barFadeOut}
              style={{ left: `${fadeInLocalPct + holdLocalPct}%`, width: `${fadeOutLocalPct}%`, background: fadeColor }}
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
