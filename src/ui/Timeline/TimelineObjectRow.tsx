import type { AppearTiming } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { appearBarLayout } from './timelineLayout'
import styles from './Timeline.module.css'

export interface TimelineObjectRowProps {
  id: string
  label: string
  color: string
  appear: AppearTiming
  ctx: TimingContext
}

/** One row for a marker or an area: label, color swatch, 3-part fadeIn/hold/fadeOut bar. */
export function TimelineObjectRow({ id, label, color, appear, ctx }: TimelineObjectRowProps) {
  const layout = appearBarLayout(appear, ctx)

  return (
    <div className={styles.row} data-testid={`timeline-object-${id}`}>
      <div className={styles.rowLabel}>
        <span className={styles.swatch} style={{ background: color }} />
        <span className={styles.rowLabelText}>{label}</span>
      </div>
      <div className={styles.rowTrack}>
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
      </div>
    </div>
  )
}
