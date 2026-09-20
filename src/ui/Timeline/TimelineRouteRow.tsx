import { useRef } from 'react'
import { strings } from '../../i18n'
import type { RouteObject } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { chainSegmentsLayout } from './timelineLayout'
import { TimelineSegmentBoundaryHandle } from './TimelineSegmentBoundaryHandle'
import styles from './Timeline.module.css'

export interface TimelineRouteRowProps {
  route: RouteObject
  ctx: TimingContext
  onResizeSegment: (waypointId: string, kind: 'hold' | 'travel', valueSec: number) => void
}

function stripedBackground(color: string): string {
  return `repeating-linear-gradient(45deg, ${color}, ${color} 6px, ${color}99 6px, ${color}99 12px)`
}

/**
 * Route draws as a waypoint chain, same hold/travel model as the camera —
 * each leg independently visible on the Timeline (and, unlike the camera,
 * draggable — see TimelineSegmentBoundaryHandle.tsx). Visual convention
 * (solid hold / diagonal-stripe travel) matches TimelineCameraRow, tinted
 * with the route's own color instead of the fixed camera purple.
 */
export function TimelineRouteRow({ route, ctx, onResizeSegment }: TimelineRouteRowProps) {
  const segments = chainSegmentsLayout(route.waypoints, ctx, 0, route.appear.startSec)
  const color = route.color
  const trackRef = useRef<HTMLDivElement>(null)
  const waypointById = new Map(route.waypoints.map((w) => [w.id, w]))

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
              background: seg.kind === 'hold' ? color : stripedBackground(color),
            }}
          />
        ))}
        {
          // A 0-duration segment's handle sits exactly on top of the adjacent
          // segment's (same leftPct+widthPct) — render those last, so a
          // non-zero (visibly-a-bar) segment's handle always wins pointer
          // capture over a coincident zero-width one behind it.
          [...segments]
            .map((seg, i) => ({ seg, i }))
            .sort((a, b) => Number(a.seg.durationSec > 0) - Number(b.seg.durationSec > 0))
            .map(({ seg, i }) => (
              <TimelineSegmentBoundaryHandle
                key={i}
                trackRef={trackRef}
                leftPct={seg.leftPct + seg.widthPct}
                ctx={ctx}
                waypointId={seg.waypointId}
                kind={seg.kind}
                currentValue={
                  seg.kind === 'hold' ? (waypointById.get(seg.waypointId)?.holdSec ?? 0) : (waypointById.get(seg.waypointId)?.travelSec ?? 0)
                }
                onResize={onResizeSegment}
              />
            ))
        }
      </div>
    </div>
  )
}
