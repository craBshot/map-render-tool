import 'maplibre-gl/dist/maplibre-gl.css'
import type { MapMouseEvent } from 'maplibre-gl'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { areaStateAt } from '../../map/areaAnimation'
import { camAt, cameraTotalSec } from '../../map/camera'
import { MapController } from '../../map/MapController'
import { markerStateAt } from '../../map/markerAnimation'
import { attachDoubleClickEditHandler } from '../../map/pointDoubleClick'
import { attachPointDragHandler } from '../../map/pointDrag'
import { findSnapTarget, kindForInteractionMode } from '../../map/pointHitTest'
import { insertRouteWaypoint, waypointsToStraightLine } from '../../map/routeGeometry'
import { routeStateAt } from '../../map/routeAnimation'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import {
  createDefaultCameraWaypoint,
  createDefaultMarker,
  createDefaultRoute,
  createDefaultRouteWaypoint,
  resolveActiveRoute,
  resolveAreaStyle,
} from '../../state/types'
import type { TimingContext } from '../../timeline/timing'
import { AutoExtendToast } from '../AutoExtendToast'
import { CameraWaypointMarkers } from './CameraWaypointMarkers'
import { Crosshair } from './Crosshair'
import { Readout } from './Readout'
import { RouteWaypointMarkers } from './RouteWaypointMarkers'
import { SnapIndicator } from './SnapIndicator'
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
        const timingCtx: TimingContext = { totalSec: cameraTotalSec(current.camera.waypoints) }
        controller.renderAreas(
          current.areas.map((area) => ({
            area,
            style: resolveAreaStyle(area.styleId, current.areaStyles),
            frame: areaStateAt(area, timingCtx, null),
          })),
        )
        controller.renderRoutes(current.routes.map((route) => ({ route, frame: routeStateAt(route, null) })))
        controller.renderMarkers(
          current.markers.map((marker) => ({ marker, frame: markerStateAt(marker, timingCtx, null) })),
        )
        controller.reorderAreaLayers(current.areas.map((a) => a.id))
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
      const mode = useEditorStore.getState().pointInteractionMode

      // Snap a new point onto an existing point of a DIFFERENT type, if one is close by —
      // never onto one of the same type (see pointHitTest.ts's findSnapTarget).
      const kind = kindForInteractionMode(mode)
      const project = useProjectStore.getState().project
      const activeRoute = mode === 'route' ? resolveActiveRoute(project.routes, useEditorStore.getState().selectedObjectId) : null
      const snap = kind ? findSnapTarget({ kind, ownerId: activeRoute?.id }, project, controller.map, e.lngLat) : null
      const { lng, lat } = snap ?? e.lngLat

      if (mode === 'area') {
        useEditorStore.getState().setPendingAreaPick({ lng, lat })
        return
      }

      if (mode === 'route') {
        const waypoint = createDefaultRouteWaypoint(lng, lat)
        if (!activeRoute) {
          const route = createDefaultRoute([waypoint])
          useProjectStore.getState().setProject((p) => ({ ...p, routes: [...p.routes, route] }))
          useEditorStore.getState().setSelectedObjectId(route.id)
          return
        }
        useProjectStore.getState().setProject((p) => ({
          ...p,
          routes: p.routes.map((r) => {
            if (r.id !== activeRoute.id) return r
            const waypoints = insertRouteWaypoint(r.waypoints, waypoint)
            const geometry = r.routingMode === 'straight' ? waypointsToStraightLine(waypoints) : r.geometry
            return { ...r, waypoints, geometry, legDistancesM: null }
          }),
        }))
        return
      }

      if (mode === 'camera') {
        const zr = controller.toRef(controller.map.getZoom())
        useProjectStore.getState().setProject((p) => ({
          ...p,
          camera: { ...p.camera, waypoints: [...p.camera.waypoints, createDefaultCameraWaypoint(lng, lat, zr)] },
        }))
        return
      }

      useProjectStore.getState().setProject((p) => ({
        ...p,
        markers: [...p.markers, createDefaultMarker(lng, lat)],
      }))
    }
    controller.map.on('contextmenu', handleContextMenu)
    const detachPointDrag = attachPointDragHandler(controller)
    const detachDoubleClickEdit = attachDoubleClickEditHandler(controller)

    return () => {
      controller.map.off('move', updateReadout)
      controller.map.off('contextmenu', handleContextMenu)
      detachPointDrag()
      detachDoubleClickEdit()
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

  // ResizeObserver rather than a window 'resize' listener: the stage's box
  // also changes size when the sidebar/timeline splitters are dragged
  // (Splitter.tsx) — a pure CSS grid-track change that never fires a
  // window resize event, which used to leave the map stale/overlapping
  // its neighbors until the next actual window resize.
  useEffect(() => {
    const stageEl = stageRef.current
    if (!stageEl) return
    const observer = new ResizeObserver(() => {
      if (useEditorStore.getState().locked) return // don't fight the export loop's own pixel-ratio sizing
      fitStageToCurrentResolution()
    })
    observer.observe(stageEl)
    return () => observer.disconnect()
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
  // While a marker is being dragged, dragPreview substitutes its live
  // position for the render pass without touching project.markers itself —
  // the project store is only written once, on drop (see pointDrag.ts).
  const dragPreview = useEditorStore((s) => s.dragPreview)
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    const timingCtx: TimingContext = { totalSec: cameraTotalSec(project.camera.waypoints) }
    const markers =
      dragPreview?.kind === 'marker'
        ? project.markers.map((m) => (m.id === dragPreview.id ? { ...m, lng: dragPreview.lng, lat: dragPreview.lat } : m))
        : project.markers
    controller.renderMarkers(markers.map((marker) => ({ marker, frame: markerStateAt(marker, timingCtx, null) })))
  }, [project.markers, project.camera.waypoints, dragPreview])

  // Area content/appearance/order — same static (sec=null) editor treatment as markers.
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    const timingCtx: TimingContext = { totalSec: cameraTotalSec(project.camera.waypoints) }
    controller.renderAreas(
      project.areas.map((area) => ({
        area,
        style: resolveAreaStyle(area.styleId, project.areaStyles),
        frame: areaStateAt(area, timingCtx, null),
      })),
    )
    controller.reorderAreaLayers(project.areas.map((a) => a.id))
  }, [project.areas, project.areaStyles, project.camera.waypoints])

  // Route content/appearance — same static (sec=null) editor treatment as markers/areas.
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    controller.renderRoutes(project.routes.map((route) => ({ route, frame: routeStateAt(route, null) })))
  }, [project.routes])

  return (
    <div ref={stageRef} className={styles.stage}>
      <div ref={containerRef} className={styles.map} data-locked={locked || undefined}>
        <Crosshair />
        {readout && <Readout lng={readout.lng} lat={readout.lat} zr={readout.zr} />}
        <RouteWaypointMarkers />
        <CameraWaypointMarkers />
        <SnapIndicator />
      </div>
      <AutoExtendToast />
    </div>
  )
}
