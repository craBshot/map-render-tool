import { strings } from '../../i18n'
import { MIN_TRAVEL_SEC } from '../../map/camera'
import type { CameraWaypoint } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { chainSegmentsLayout } from './timelineLayout'
import styles from './Timeline.module.css'

export interface TimelineCameraRowProps {
  waypoints: CameraWaypoint[]
  ctx: TimingContext
}

/** Camera hold/travel segments — visualized, not draggable/clickable (user's explicit call — see plan). */
export function TimelineCameraRow({ waypoints, ctx }: TimelineCameraRowProps) {
  const segments = chainSegmentsLayout(waypoints, ctx, MIN_TRAVEL_SEC)

  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.rowLabelText}>{strings.timeline.cameraRow}</span>
      </div>
      <div className={styles.rowTrack}>
        {segments.map((seg, i) => (
          <div
            key={i}
            className={seg.kind === 'hold' ? styles.cameraHold : styles.cameraTravel}
            style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
          />
        ))}
      </div>
    </div>
  )
}
