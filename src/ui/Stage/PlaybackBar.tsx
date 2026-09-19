import { useEffect, useRef } from 'react'
import { areaStateAt } from '../../map/areaAnimation'
import { camAt, cameraTotalSec } from '../../map/camera'
import { markerStateAt } from '../../map/markerAnimation'
import { routeStateAt } from '../../map/routeAnimation'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { resolveAreaStyle } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { strings } from '../../i18n'
import { fmtNum } from '../format'
import styles from './PlaybackBar.module.css'

export function PlaybackBar() {
  const rafRef = useRef<number | null>(null)
  const playing = useEditorStore((s) => s.playing)
  const locked = useEditorStore((s) => s.locked)
  const playbackTimeSec = useEditorStore((s) => s.playbackTimeSec)
  const waypoints = useProjectStore((s) => s.project.camera.waypoints)
  const totalSec = cameraTotalSec(waypoints)

  useEffect(() => () => stop(), [])

  function renderFrame(sec: number) {
    const controller = useEditorStore.getState().controller
    if (!controller) return
    const project = useProjectStore.getState().project
    const timingCtx: TimingContext = { totalSec: cameraTotalSec(project.camera.waypoints) }
    controller.applyFrame(
      camAt(project.camera, sec),
      project.markers.map((marker) => ({ marker, frame: markerStateAt(marker, timingCtx, sec) })),
      project.areas.map((area) => {
        const style = resolveAreaStyle(area.styleId, project.areaStyles)
        return { area, style, frame: areaStateAt(area, timingCtx, sec) }
      }),
      project.route ? { route: project.route, frame: routeStateAt(project.route, sec) } : null,
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
    const timingCtx: TimingContext = { totalSec: cameraTotalSec(project.camera.waypoints) }
    controller.renderMarkers(project.markers.map((marker) => ({ marker, frame: markerStateAt(marker, timingCtx, null) })))
    controller.renderAreas(
      project.areas.map((area) => {
        const style = resolveAreaStyle(area.styleId, project.areaStyles)
        return { area, style, frame: areaStateAt(area, timingCtx, null) }
      }),
    )
    controller.renderRoute(project.route ? { route: project.route, frame: routeStateAt(project.route, null) } : null)
  }

  function play() {
    if (rafRef.current !== null) {
      stop()
      return
    }
    const total = cameraTotalSec(useProjectStore.getState().project.camera.waypoints)
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

  const progressPct = totalSec ? Math.min(100, (playbackTimeSec / totalSec) * 100) : 0

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
        {fmtNum(playbackTimeSec, 1)} / {fmtNum(totalSec, 1)} s
      </div>
    </div>
  )
}
