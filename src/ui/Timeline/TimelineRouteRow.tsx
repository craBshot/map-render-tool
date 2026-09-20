import { strings } from '../../i18n'
import type { RouteObject } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { chainSegmentsLayout } from './timelineLayout'
import styles from './Timeline.module.css'

export interface TimelineRouteRowProps {
  route: RouteObject
  ctx: TimingContext
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
export function TimelineRouteRow({ route, ctx }: TimelineRouteRowProps) {
  const segments = chainSegmentsLayout(route.waypoints, ctx, 0, route.appear.startSec)
  const color = route.color

  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.swatch} style={{ background: color }} />
        <span className={styles.rowLabelText}>{strings.timeline.routeRow}</span>
      </div>
      <div className={styles.rowTrack}>
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
      </div>
    </div>
  )
}
