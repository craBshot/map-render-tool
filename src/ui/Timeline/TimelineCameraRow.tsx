import { useRef } from 'react'
import { strings } from '../../i18n'
import { MIN_TRAVEL_SEC } from '../../map/camera'
import type { CameraWaypoint } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { chainArrivalsSec } from '../../timeline/waypointChain'
import { fmtNum, waypointLetter } from '../format'
import { chainSegmentsLayout, declutterHandlePositions, pct } from './timelineLayout'
import { lighten } from './timelineColor'
import { TimelineKeyframeHandle } from './TimelineKeyframeHandle'
import { TimelineSegmentBoundaryHandle } from './TimelineSegmentBoundaryHandle'
import styles from './Timeline.module.css'

export interface TimelineCameraRowProps {
  waypoints: CameraWaypoint[]
  ctx: TimingContext
  /** Keyframe drag: new absolute arrival time for that waypoint (see moveChainWaypoint). */
  onMoveKeyframe: (waypointId: string, arrivalSec: number) => void
  /** Hold right-edge drag: new holdSec (see resizeChainHold). */
  onResizeHold: (waypointId: string, kind: 'hold', holdSec: number) => void
}

/** Minimum gap between two handles' render positions, as a percent of track width — see declutterHandlePositions. */
const MIN_HANDLE_GAP_PCT = 2

const CAMERA_COLOR = '#6b3fa0'
const CAMERA_COLOR_LIGHT = lighten(CAMERA_COLOR, 0.35)

/**
 * Camera flight as keyframes: each waypoint is a diamond at its arrival
 * time, followed by its hold bar. Dragging a diamond moves only that
 * waypoint in time (travel legs around it absorb the change, overtaking a
 * neighbor reorders the flight); dragging a hold's right edge eats into the
 * next travel leg. The first waypoint is pinned at project time 0 — the
 * camera defines the project's time origin (ctx.totalSec IS
 * cameraTotalSec(waypoints)). Storage stays holdSec/travelSec; the
 * absolute-time view is computed here and in waypointChain.ts.
 */
export function TimelineCameraRow({ waypoints, ctx, onMoveKeyframe, onResizeHold }: TimelineCameraRowProps) {
  const segments = chainSegmentsLayout(waypoints, ctx, MIN_TRAVEL_SEC)
  const arrivals = chainArrivalsSec(waypoints, MIN_TRAVEL_SEC)
  const trackRef = useRef<HTMLDivElement>(null)

  // Interleaved left-to-right (keyframe, then its hold's end) so one declutter pass keeps both reachable.
  const handleSpecs = waypoints.flatMap((w, i) => [
    { kind: 'keyframe' as const, id: w.id, index: i, leftPct: pct(arrivals[i], ctx.totalSec), value: arrivals[i] },
    { kind: 'hold' as const, id: w.id, index: i, leftPct: pct(arrivals[i] + Math.max(0, w.holdSec), ctx.totalSec), value: Math.max(0, w.holdSec) },
  ])
  const handles = declutterHandlePositions(handleSpecs, MIN_HANDLE_GAP_PCT)

  const labelSpecs = segments.map((seg) => ({ leftPct: seg.leftPct + seg.widthPct / 2, text: `${fmtNum(seg.durationSec, 1)}s` }))
  const labels = declutterHandlePositions(labelSpecs, MIN_HANDLE_GAP_PCT)

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
            style={{
              left: `${seg.leftPct}%`,
              width: `${seg.widthPct}%`,
              background: seg.kind === 'hold' ? CAMERA_COLOR : CAMERA_COLOR_LIGHT,
            }}
          />
        ))}
        {labels.map((l, i) => (
          <span key={i} className={styles.segmentLabel} style={{ left: `${l.renderLeftPct}%` }}>
            {l.text}
          </span>
        ))}
        {handles.map((h) =>
          h.kind === 'keyframe' ? (
            <TimelineKeyframeHandle
              key={`k-${h.id}`}
              trackRef={trackRef}
              renderLeftPct={h.renderLeftPct}
              totalSec={ctx.totalSec}
              id={h.id}
              arrivalSec={h.value}
              onMove={h.index === 0 ? null : onMoveKeyframe}
              label={waypointLetter(h.index)}
            />
          ) : (
            <TimelineSegmentBoundaryHandle
              key={`h-${h.id}`}
              trackRef={trackRef}
              renderLeftPct={h.renderLeftPct}
              ctx={ctx}
              id={h.id}
              kind="hold"
              currentValue={h.value}
              onResize={onResizeHold}
              testIdPrefix="camera-boundary"
            />
          ),
        )}
      </div>
    </div>
  )
}
