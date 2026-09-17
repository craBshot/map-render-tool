import { useEffect, useRef } from 'react'
import { camAt } from '../../map/camera'
import { markerStateAt } from '../../map/markerAnimation'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { timingTotals, zoomProgressAt } from '../../timeline/timing'
import { strings } from '../../i18n'
import { fmtNum } from '../format'
import styles from './PlaybackBar.module.css'

export function PlaybackBar() {
  const rafRef = useRef<number | null>(null)
  const playing = useEditorStore((s) => s.playing)
  const playbackTimeSec = useEditorStore((s) => s.playbackTimeSec)
  const timing = useProjectStore((s) => s.project.camera.timing)
  const totals = timingTotals(timing)

  useEffect(() => () => stop(), [])

  function renderFrame(sec: number) {
    const controller = useEditorStore.getState().controller
    if (!controller) return
    const project = useProjectStore.getState().project
    const projectTotals = timingTotals(project.camera.timing)
    const t = zoomProgressAt(sec, project.camera.timing)
    controller.applyFrame(
      camAt(project.camera, t),
      project.markers.map((marker) => ({ marker, frame: markerStateAt(marker, projectTotals, sec) })),
    )
  }

  function stop() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    useEditorStore.getState().setPlaying(false)
    // Marker goes back to its static editor state; the camera is left
    // wherever playback stopped it, matching legacy (only "Zum Start" jumps).
    const controller = useEditorStore.getState().controller
    if (!controller) return
    const project = useProjectStore.getState().project
    const projectTotals = timingTotals(project.camera.timing)
    controller.renderMarkers(project.markers.map((marker) => ({ marker, frame: markerStateAt(marker, projectTotals, null) })))
  }

  function play() {
    if (rafRef.current !== null) {
      stop()
      return
    }
    const total = timingTotals(useProjectStore.getState().project.camera.timing).totalSec
    const t0 = performance.now()
    useEditorStore.getState().setPlaying(true)

    const step = (now: number) => {
      const elapsed = (now - t0) / 1000
      const sec = Math.min(elapsed, total)
      renderFrame(sec)
      useEditorStore.getState().setPlaybackTimeSec(sec)
      if (elapsed < total) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        stop()
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  function reset() {
    stop()
    const controller = useEditorStore.getState().controller
    if (controller) controller.applyCameraFrame(camAt(useProjectStore.getState().project.camera, 0))
    useEditorStore.getState().setPlaybackTimeSec(0)
  }

  const progressPct = totals.totalSec ? Math.min(100, (playbackTimeSec / totals.totalSec) * 100) : 0

  return (
    <div className={styles.bar}>
      <button type="button" className={styles.button} onClick={play}>
        {playing ? strings.playback.stop : strings.playback.play}
      </button>
      <button type="button" className={styles.button} onClick={reset}>
        {strings.playback.reset}
      </button>
      <div className={styles.track}>
        <div className={styles.progress} style={{ width: `${progressPct}%` }} />
      </div>
      <div className={styles.time}>
        {fmtNum(playbackTimeSec, 1)} / {fmtNum(totals.totalSec, 1)} s
      </div>
    </div>
  )
}
