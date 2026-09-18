import { useEffect, useRef } from 'react'
import { areaStateAt } from '../../map/areaAnimation'
import { camAt } from '../../map/camera'
import { markerStateAt } from '../../map/markerAnimation'
import { routeStateAt } from '../../map/routeAnimation'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { resolveAreaStyle } from '../../state/types'
import { timingTotals, zoomProgressAt } from '../../timeline/timing'
import { strings } from '../../i18n'
import { fmtNum } from '../format'
import styles from './PlaybackBar.module.css'

export function PlaybackBar() {
  const rafRef = useRef<number | null>(null)
  const playing = useEditorStore((s) => s.playing)
  const locked = useEditorStore((s) => s.locked)
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
      project.areas.map((area) => {
        const style = resolveAreaStyle(area.styleId, project.areaStyles)
        return { area, style, frame: areaStateAt(style, projectTotals, sec) }
      }),
      project.route ? { route: project.route, frame: routeStateAt(project.route, projectTotals, sec) } : null,
    )
  }

  function stop() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    useEditorStore.getState().setPlaying(false)
    // Marker/area go back to their static editor state; the camera is left
    // wherever playback stopped it, matching legacy (only "Zum Start" jumps).
    const controller = useEditorStore.getState().controller
    if (!controller) return
    const project = useProjectStore.getState().project
    const projectTotals = timingTotals(project.camera.timing)
    controller.renderMarkers(project.markers.map((marker) => ({ marker, frame: markerStateAt(marker, projectTotals, null) })))
    controller.renderAreas(
      project.areas.map((area) => {
        const style = resolveAreaStyle(area.styleId, project.areaStyles)
        return { area, style, frame: areaStateAt(style, projectTotals, null) }
      }),
    )
    controller.renderRoute(
      project.route ? { route: project.route, frame: routeStateAt(project.route, projectTotals, null) } : null,
    )
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
      <button type="button" className={styles.button} onClick={play} disabled={locked}>
        {playing ? strings.playback.stop : strings.playback.play}
      </button>
      <button type="button" className={styles.button} onClick={reset} disabled={locked}>
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
