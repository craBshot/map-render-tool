import { useCallback, useRef } from 'react'
import { strings } from '../../i18n'
import { fmtNum } from '../format'
import { useHorizontalDrag } from './useHorizontalDrag'
import styles from './Timeline.module.css'

export interface TimelineRulerProps {
  playing: boolean
  locked: boolean
  playbackTimeSec: number
  totalSec: number
  onPlay: () => void
  onReset: () => void
  /** Called continuously while scrubbing (and once for a plain click). */
  onSeek: (sec: number) => void
}

export function TimelineRuler({ playing, locked, playbackTimeSec, totalSec, onPlay, onReset, onSeek }: TimelineRulerProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const handleDrag = useCallback((fracX: number) => onSeek(fracX * totalSec), [onSeek, totalSec])
  const { startDrag } = useHorizontalDrag(trackRef, handleDrag)

  const progressPct = totalSec ? Math.min(100, (playbackTimeSec / totalSec) * 100) : 0

  return (
    <div className={styles.ruler}>
      <div className={styles.rulerButtons}>
        <button type="button" className={styles.button} onClick={onPlay} disabled={locked}>
          {playing ? strings.playback.stop : strings.playback.play}
        </button>
        <button type="button" className={styles.button} onClick={onReset} disabled={locked}>
          {strings.playback.reset}
        </button>
      </div>
      <div ref={trackRef} className={styles.rulerTrack} onPointerDown={startDrag}>
        <div className={styles.progress} style={{ width: `${progressPct}%` }} />
        <div className={styles.playhead} style={{ left: `${progressPct}%` }} />
      </div>
      <div className={styles.time}>
        <span data-testid="time-readout">
          {fmtNum(playbackTimeSec, 1)} / {fmtNum(totalSec, 1)} s
        </span>
        {' · '}
        {strings.timeline.lengthHint}
      </div>
    </div>
  )
}
