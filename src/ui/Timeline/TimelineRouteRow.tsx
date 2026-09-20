import { strings } from '../../i18n'
import type { RouteObject } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { appearBarLayout } from './timelineLayout'
import styles from './Timeline.module.css'

export interface TimelineRouteRowProps {
  route: RouteObject
  ctx: TimingContext
}

/**
 * Route's draw timing as a bar — reuses appearBarLayout by mapping the
 * route's own fields onto an AppearTiming shape: fadeIn = the progressive
 * draw duration (0 for 'instant' reveal, i.e. drawn immediately), hold =
 * always "until the end" (nothing ever un-draws a route), fadeOut = none
 * (routes don't disappear). Not draggable in v1 (same as the camera row).
 */
export function TimelineRouteRow({ route, ctx }: TimelineRouteRowProps) {
  const drawSec = route.reveal === 'progressive' ? route.drawDurationSec : 0
  const layout = appearBarLayout({ startSec: route.appear.startSec, fadeInSec: drawSec, holdSec: undefined, fadeOutSec: 0 }, ctx)
  const color = route.color

  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.swatch} style={{ background: color }} />
        <span className={styles.rowLabelText}>{strings.timeline.routeRow}</span>
      </div>
      <div className={styles.rowTrack}>
        <div className={styles.bar}>
          {layout.fadeInPct > 0 && (
            <div
              className={styles.barFadeIn}
              style={{
                left: `${layout.leftPct}%`,
                width: `${layout.fadeInPct}%`,
                background: `linear-gradient(to right, transparent, ${color})`,
              }}
            />
          )}
          <div
            className={styles.barHold}
            style={{ left: `${layout.leftPct + layout.fadeInPct}%`, width: `${layout.holdPct}%`, background: color }}
          />
        </div>
      </div>
    </div>
  )
}
