import { useEffect, useRef } from 'react'
import { areaStateAt } from '../../map/areaAnimation'
import { camAt, cameraTotalSec } from '../../map/camera'
import { markerStateAt } from '../../map/markerAnimation'
import { routeStateAt } from '../../map/routeAnimation'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { resolveAreaStyle, type AreaObject, type AreaStyle } from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { strings } from '../../i18n'
import { TimelineCameraRow } from './TimelineCameraRow'
import { TimelineObjectRow } from './TimelineObjectRow'
import { TimelineRouteRow } from './TimelineRouteRow'
import { TimelineRuler } from './TimelineRuler'
import styles from './Timeline.module.css'

/** Fill color if enabled, else outline color if enabled, else a neutral gray — used for a bar's own color when unstyled. */
function areaBarColor(style: AreaStyle | null): string {
  if (!style) return 'var(--muted)'
  if (style.fill.enabled) return style.fill.color
  if (style.outline.enabled) return style.outline.color
  return 'var(--muted)'
}

export function Timeline() {
  const rafRef = useRef<number | null>(null)
  const playing = useEditorStore((s) => s.playing)
  const locked = useEditorStore((s) => s.locked)
  const playbackTimeSec = useEditorStore((s) => s.playbackTimeSec)
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId)
  const setProject = useProjectStore((s) => s.setProject)
  const project = useProjectStore((s) => s.project)
  const totalSec = cameraTotalSec(project.camera.waypoints)
  const ctx: TimingContext = { totalSec }

  function selectObject(id: string) {
    useEditorStore.getState().setSelectedObjectId(id)
  }

  function repositionMarker(id: string, startSec: number) {
    setProject((p) => ({
      ...p,
      markers: p.markers.map((m) => (m.id === id ? { ...m, appear: { ...m.appear, startSec } } : m)),
    }))
  }

  function repositionArea(id: string, startSec: number) {
    setProject((p) => ({
      ...p,
      areas: p.areas.map((a) => (a.id === id ? { ...a, appear: { ...a.appear, startSec } } : a)),
    }))
  }

  function updateRouteWaypointTiming(waypointId: string, kind: 'hold' | 'travel', valueSec: number) {
    setProject((p) =>
      p.route
        ? {
            ...p,
            route: {
              ...p.route,
              waypoints: p.route.waypoints.map((w) =>
                w.id === waypointId ? { ...w, [kind === 'hold' ? 'holdSec' : 'travelSec']: valueSec } : w,
              ),
            },
          }
        : p,
    )
  }

  useEffect(() => () => stop(), [])

  function renderFrame(sec: number) {
    const controller = useEditorStore.getState().controller
    if (!controller) return
    const p = useProjectStore.getState().project
    const timingCtx: TimingContext = { totalSec: cameraTotalSec(p.camera.waypoints) }
    controller.applyFrame(
      camAt(p.camera, sec),
      p.markers.map((marker) => ({ marker, frame: markerStateAt(marker, timingCtx, sec) })),
      p.areas.map((area) => {
        const style = resolveAreaStyle(area.styleId, p.areaStyles)
        return { area, style, frame: areaStateAt(area, timingCtx, sec) }
      }),
      p.route ? { route: p.route, frame: routeStateAt(p.route, sec) } : null,
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
    const p = useProjectStore.getState().project
    const timingCtx: TimingContext = { totalSec: cameraTotalSec(p.camera.waypoints) }
    controller.renderMarkers(p.markers.map((marker) => ({ marker, frame: markerStateAt(marker, timingCtx, null) })))
    controller.renderAreas(
      p.areas.map((area) => {
        const style = resolveAreaStyle(area.styleId, p.areaStyles)
        return { area, style, frame: areaStateAt(area, timingCtx, null) }
      }),
    )
    controller.renderRoute(p.route ? { route: p.route, frame: routeStateAt(p.route, null) } : null)
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

  function seek(sec: number) {
    if (rafRef.current !== null) stop()
    const clamped = Math.max(0, Math.min(totalSec, sec))
    useEditorStore.getState().setPlaybackTimeSec(clamped)
    renderFrame(clamped)
  }

  function areaLabel(area: AreaObject): string {
    return area.name
  }

  return (
    <div className={styles.timeline}>
      <TimelineRuler
        playing={playing}
        locked={locked}
        playbackTimeSec={playbackTimeSec}
        totalSec={totalSec}
        onPlay={play}
        onReset={reset}
        onSeek={seek}
      />
      <div className={styles.rows}>
        <TimelineCameraRow waypoints={project.camera.waypoints} ctx={ctx} />
        {project.markers.map((marker) => (
          <TimelineObjectRow
            key={marker.id}
            id={marker.id}
            label={marker.name || strings.marker.namePlaceholder}
            color={marker.color}
            appear={marker.appear}
            ctx={ctx}
            selected={selectedObjectId === marker.id}
            onSelect={selectObject}
            onReposition={repositionMarker}
          />
        ))}
        {project.areas.map((area) => (
          <TimelineObjectRow
            key={area.id}
            id={area.id}
            label={areaLabel(area)}
            color={areaBarColor(resolveAreaStyle(area.styleId, project.areaStyles))}
            appear={area.appear}
            ctx={ctx}
            selected={selectedObjectId === area.id}
            onSelect={selectObject}
            onReposition={repositionArea}
          />
        ))}
        {project.route && (
          <TimelineRouteRow route={project.route} ctx={ctx} onResizeSegment={updateRouteWaypointTiming} />
        )}
      </div>
    </div>
  )
}
