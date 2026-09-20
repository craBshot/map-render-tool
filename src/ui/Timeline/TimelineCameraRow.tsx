import { useRef } from 'react'
import { strings } from '../../i18n'
import { MIN_TRAVEL_SEC } from '../../map/camera'
import type { CameraWaypoint } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { chainSegmentsLayout, declutterHandlePositions } from './timelineLayout'
import { TimelineSegmentBoundaryHandle } from './TimelineSegmentBoundaryHandle'
import styles from './Timeline.module.css'

export interface TimelineCameraRowProps {
  waypoints: CameraWaypoint[]
  ctx: TimingContext
  onResizeSegment: (waypointId: string, kind: 'hold' | 'travel', valueSec: number) => void
}

/** Minimum gap between two handles' render positions, as a percent of track width — see declutterHandlePositions. */
const MIN_HANDLE_GAP_PCT = 2

/**
 * Camera hold/travel segments — same per-segment edge-drag mechanism as
 * route (TimelineRouteRow), since both share the exact same ChainSegment
 * model. Unlike route, camera's chain has no "appear.startSec" offset to
 * make draggable: waypoint 0's hold is definitionally pinned at project
 * time 0 (ctx.totalSec IS cameraTotalSec(waypoints) — camera defines the
 * project's own time origin), so there's no virtual leading segment here.
 */
export function TimelineCameraRow({ waypoints, ctx, onResizeSegment }: TimelineCameraRowProps) {
  const segments = chainSegmentsLayout(waypoints, ctx, MIN_TRAVEL_SEC)
  const trackRef = useRef<HTMLDivElement>(null)
  const waypointById = new Map(waypoints.map((w) => [w.id, w]))

  const handleSpecs = segments.map((seg) => ({
    leftPct: seg.leftPct + seg.widthPct,
    durationSec: seg.durationSec,
    kind: seg.kind,
    id: seg.waypointId,
    currentValue: seg.kind === 'hold' ? (waypointById.get(seg.waypointId)?.holdSec ?? 0) : (waypointById.get(seg.waypointId)?.travelSec ?? 0),
  }))
  const handles = declutterHandlePositions(handleSpecs, MIN_HANDLE_GAP_PCT)

  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.rowLabelText}>{strings.timeline.cameraRow}</span>
      </div>
      <div ref={trackRef} className={styles.rowTrack} data-testid="timeline-camera-track">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={seg.kind === 'hold' ? styles.cameraHold : styles.cameraTravel}
            style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
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
            onResize={onResizeSegment}
            testIdPrefix="camera-boundary"
          />
        ))}
      </div>
    </div>
  )
}
