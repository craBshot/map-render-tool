import { useRef } from 'react'
import { strings } from '../../i18n'
import type { RouteObject } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { fmtNum, waypointLetter } from '../format'
import { chainSegmentsLayout, declutterHandlePositions } from './timelineLayout'
import { lighten } from './timelineColor'
import { TimelineSegmentBoundaryHandle } from './TimelineSegmentBoundaryHandle'
import styles from './Timeline.module.css'

export interface TimelineRouteRowProps {
  route: RouteObject
  ctx: TimingContext
  onResizeSegment: (waypointId: string, kind: 'hold' | 'travel', valueSec: number) => void
  onResizeAppearStart: (valueSec: number) => void
}

/** Minimum gap between two handles' render positions, as a percent of track width — see declutterHandlePositions. */
const MIN_HANDLE_GAP_PCT = 2

type RouteHandleKind = 'appear' | 'hold' | 'travel'

/**
 * Route draws as a waypoint chain, same hold/travel model as the camera —
 * each leg independently visible on the Timeline (and, unlike the camera,
 * draggable — see TimelineSegmentBoundaryHandle.tsx). Visual convention
 * (solid hold / solid lighter-tint travel — plain tones, no stripe
 * pattern) matches TimelineCameraRow, tinted with the route's own color
 * instead of the fixed camera purple.
 *
 * A virtual leading "appear" segment (project time 0 -> appear.startSec,
 * rendered unfilled — the route hasn't appeared yet, so there's nothing
 * to draw there) gets the exact same kind of edge handle as every real
 * segment, so appear.startSec is draggable through the identical
 * mechanism instead of a separate "move the whole bar" primitive.
 */
export function TimelineRouteRow({ route, ctx, onResizeSegment, onResizeAppearStart }: TimelineRouteRowProps) {
  const segments = chainSegmentsLayout(route.waypoints, ctx, 0, route.appear.startSec)
  const color = route.color
  const trackRef = useRef<HTMLDivElement>(null)
  const waypointById = new Map(route.waypoints.map((w) => [w.id, w]))
  const waypointIndexById = new Map(route.waypoints.map((w, i) => [w.id, i]))

  const appearHandleSpec = {
    leftPct: segments[0]?.leftPct ?? 0, // = pct(appear.startSec) — the appear segment's own right edge
    durationSec: route.appear.startSec,
    kind: 'appear' as RouteHandleKind,
    id: route.id,
    currentValue: route.appear.startSec,
  }
  const segmentHandleSpecs = segments.map((seg) => ({
    leftPct: seg.leftPct + seg.widthPct,
    durationSec: seg.durationSec,
    kind: seg.kind as RouteHandleKind,
    id: seg.waypointId,
    currentValue: seg.kind === 'hold' ? (waypointById.get(seg.waypointId)?.holdSec ?? 0) : (waypointById.get(seg.waypointId)?.travelSec ?? 0),
  }))
  const handles = declutterHandlePositions([appearHandleSpec, ...segmentHandleSpecs], MIN_HANDLE_GAP_PCT)

  const labelSpecs = segments.map((seg) => ({
    leftPct: seg.leftPct + seg.widthPct / 2,
    text:
      seg.kind === 'hold'
        ? `${waypointLetter(waypointIndexById.get(seg.waypointId) ?? 0)} · ${fmtNum(seg.durationSec, 1)}s`
        : `${fmtNum(seg.durationSec, 1)}s`,
  }))
  const labels = declutterHandlePositions(labelSpecs, MIN_HANDLE_GAP_PCT)

  function handleResize(id: string, kind: RouteHandleKind, valueSec: number) {
    if (kind === 'appear') onResizeAppearStart(valueSec)
    else onResizeSegment(id, kind, valueSec)
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.swatch} style={{ background: color }} />
        <span className={styles.rowLabelText}>{strings.timeline.routeRow}</span>
      </div>
      <div ref={trackRef} className={styles.rowTrack} data-testid="timeline-route-track">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={seg.kind === 'hold' ? styles.routeHold : styles.routeTravel}
            style={{
              left: `${seg.leftPct}%`,
              width: `${seg.widthPct}%`,
              background: seg.kind === 'hold' ? color : lighten(color, 0.35),
            }}
          />
        ))}
        {handles.map((h, i) => (
          <TimelineSegmentBoundaryHandle
            key={i}
            trackRef={trackRef}
            renderLeftPct={h.renderLeftPct}
            ctx={ctx}
            id={h.id}
            kind={h.kind}
            currentValue={h.currentValue}
            onResize={handleResize}
            testIdPrefix="route-boundary"
          />
        ))}
        {labels.map((l, i) => (
          <span key={i} className={styles.segmentLabel} style={{ left: `${l.renderLeftPct}%` }}>
            {l.text}
          </span>
        ))}
      </div>
    </div>
  )
}
