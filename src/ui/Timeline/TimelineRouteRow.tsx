import { strings } from '../../i18n'
import type { RouteObject } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { pointLayout } from './timelineLayout'
import styles from './Timeline.module.css'

export interface TimelineRouteRowProps {
  route: RouteObject
  ctx: TimingContext
}

/** Route's single startSec as a flag marker — no duration to show, so not a bar. */
export function TimelineRouteRow({ route, ctx }: TimelineRouteRowProps) {
  const { leftPct } = pointLayout(route.appear.startSec, ctx)

  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.swatch} style={{ background: route.color }} />
        <span className={styles.rowLabelText}>{strings.timeline.routeRow}</span>
      </div>
      <div className={styles.rowTrack}>
        <div className={styles.routeFlag} style={{ left: `${leftPct}%`, borderBottomColor: route.color }} />
      </div>
    </div>
  )
}
