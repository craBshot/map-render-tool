import 'maplibre-gl/dist/maplibre-gl.css'
import type { MapMouseEvent } from 'maplibre-gl'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { camAt } from '../../map/camera'
import { MapController } from '../../map/MapController'
import { markerStateAt } from '../../map/markerAnimation'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { createDefaultMarker } from '../../state/types'
import { timingTotals } from '../../timeline/timing'
import { Crosshair } from './Crosshair'
import { Readout } from './Readout'
import styles from './MapStage.module.css'

declare global {
  interface Window {
    // Set by Playwright via addInitScript() before navigation — gives e2e
    // tests a way to inspect the live MapController without adding any
    // test-only UI. Never set in a real deployment.
    __E2E__?: boolean
    __mapController?: MapController
  }
}

export function MapStage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<MapController | null>(null)
  const styleIdRef = useRef<string | null>(null)

  const project = useProjectStore((s) => s.project)
  const locked = useEditorStore((s) => s.locked)

  const [readout, setReadout] = useState<{ lng: number; lat: number; zr: number } | null>(null)

  function fitStageToCurrentResolution() {
    const controller = controllerRef.current
    const stageEl = stageRef.current
    if (!controller || !stageEl) return
    const { width, height } = useProjectStore.getState().project.export.resolution
    controller.fitStage(width, height, stageEl.getBoundingClientRect())
  }

  // Create the map once. Everything reactive after this reads the latest
  // store state imperatively (via getState()) instead of closing over props,
  // since map event handlers are not re-subscribed on every render. Runs as
  // a layout effect together with the initial fitStage() below so the
  // container is already sized correctly before the browser paints.
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const initialProject = useProjectStore.getState().project
    styleIdRef.current = initialProject.style.id

    const controller = new MapController({
      container: containerRef.current,
      style: initialProject.style,
      onStyleReady: () => {
        const current = useProjectStore.getState().project
        const totals = timingTotals(current.camera.timing)
        controller.renderMarkers(
          current.markers.map((marker) => ({ marker, frame: markerStateAt(marker, totals, null) })),
        )
      },
    })
    controllerRef.current = controller
    useEditorStore.getState().setController(controller)
    if (window.__E2E__) window.__mapController = controller
    controller.applyCameraFrame(camAt(initialProject.camera, 0))
    fitStageToCurrentResolution()

    const updateReadout = () => {
      const c = controller.map.getCenter()
      setReadout({ lng: c.lng, lat: c.lat, zr: controller.toRef(controller.map.getZoom()) })
    }
    controller.map.on('move', updateReadout)
    updateReadout()

    const handleContextMenu = (e: MapMouseEvent) => {
      if (useEditorStore.getState().locked) return
      e.originalEvent?.preventDefault()
      const { lng, lat } = e.lngLat
      useProjectStore.getState().setProject((p) => ({
        ...p,
        markers:
          p.markers.length > 0
            ? p.markers.map((m, i) => (i === 0 ? { ...m, lng, lat, visible: true } : m))
            : [createDefaultMarker(lng, lat)],
      }))
    }
    controller.map.on('contextmenu', handleContextMenu)

    return () => {
      controller.map.off('move', updateReadout)
      controller.map.off('contextmenu', handleContextMenu)
      controller.destroy()
      controllerRef.current = null
      useEditorStore.getState().setController(null)
      if (window.__mapController === controller) window.__mapController = undefined
    }
  }, [])

  // Re-letterbox the stage whenever the target export resolution changes,
  // so the framing preview always matches what export will actually crop —
  // and whenever the browser window resizes the available stage area.
  useEffect(() => {
    fitStageToCurrentResolution()
  }, [project.export.resolution.width, project.export.resolution.height])

  useEffect(() => {
    function handleResize() {
      if (useEditorStore.getState().locked) return // don't fight the export loop's own pixel-ratio sizing
      fitStageToCurrentResolution()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Style id / label settings.
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    controller.setLabelSettings(project.style)
    if (styleIdRef.current !== project.style.id) {
      styleIdRef.current = project.style.id
      controller.setStyle(project.style.id)
    }
  }, [project.style])

  // Marker content/appearance — rendered statically (sec=null) while editing;
  // camera stays under the user's own pan/zoom, not driven by camAt() here.
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    const totals = timingTotals(project.camera.timing)
    controller.renderMarkers(
      project.markers.map((marker) => ({ marker, frame: markerStateAt(marker, totals, null) })),
    )
  }, [project.markers, project.camera.timing])

  return (
    <div ref={stageRef} className={styles.stage}>
      <div ref={containerRef} className={styles.map} data-locked={locked || undefined}>
        <Crosshair />
        {readout && <Readout lng={readout.lng} lat={readout.lat} zr={readout.zr} />}
      </div>
    </div>
  )
}
