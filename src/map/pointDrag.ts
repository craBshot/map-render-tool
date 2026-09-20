import type { MapMouseEvent } from 'maplibre-gl'
import { useEditorStore } from '../state/editorStore'
import { setCameraWaypointPosition, setMarkerPosition, setRouteWaypointPosition } from '../state/pointMutations'
import { useProjectStore } from '../state/store'
import { findSnapTarget, hitTestDraggable, kindForInteractionMode, type HitPoint } from './pointHitTest'
import type { MapController } from './MapController'

function commitPosition(hit: HitPoint, lng: number, lat: number): void {
  if (hit.kind === 'marker') setMarkerPosition(hit.id, lng, lat)
  else if (hit.kind === 'route') setRouteWaypointPosition(hit.id, lng, lat)
  else setCameraWaypointPosition(hit.id, lng, lat)
}

/**
 * Wires left-drag-to-reposition for markers/route waypoints/camera
 * waypoints on the map canvas — mode-scoped (only the current interaction
 * mode's point type can be picked up, see hitTestDraggable) with cross-type
 * snapping (see findSnapTarget). Right-click stays reserved for placement;
 * a plain mousedown that doesn't hit a draggable point falls through to
 * MapLibre's own dragPan untouched. Returns a detach function.
 */
export function attachPointDragHandler(controller: MapController): () => void {
  const map = controller.map

  function resolveFinalPosition(hit: HitPoint, e: MapMouseEvent): { lng: number; lat: number; snapped: boolean } {
    const project = useProjectStore.getState().project
    const target = findSnapTarget(hit.kind, project, map, e.lngLat)
    return target ? { lng: target.lng, lat: target.lat, snapped: true } : { lng: e.lngLat.lng, lat: e.lngLat.lat, snapped: false }
  }

  function onMouseDown(e: MapMouseEvent) {
    if (e.originalEvent.button !== 0) return // right-click stays reserved for placement
    const editor = useEditorStore.getState()
    if (editor.locked || editor.playing) return
    const mode = editor.pointInteractionMode
    if (kindForInteractionMode(mode) === null) return // 'area' mode — nothing here is a draggable point

    const hit = hitTestDraggable(mode, useProjectStore.getState().project, map, e.point)
    if (!hit) return // no point under the cursor — let native dragPan proceed

    e.preventDefault() // suppresses dragPan/dragRotate for this gesture (MapLibre's documented technique)
    map.getCanvas().style.cursor = 'grabbing'

    const onMouseMove = (moveEvent: MapMouseEvent) => {
      if (useEditorStore.getState().locked) {
        endGesture()
        return
      }
      const { lng, lat, snapped } = resolveFinalPosition(hit, moveEvent)
      useEditorStore.getState().setDragPreview({ kind: hit.kind, id: hit.id, lng, lat, snapped })
    }

    const onMouseUp = (upEvent: MapMouseEvent) => {
      const aborted = useEditorStore.getState().locked // e.g. export started mid-drag
      endGesture()
      if (aborted) return
      const { lng, lat } = resolveFinalPosition(hit, upEvent)
      commitPosition(hit, lng, lat)
    }

    function endGesture() {
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
      map.getCanvas().style.cursor = ''
      useEditorStore.getState().setDragPreview(null)
    }

    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)
  }

  map.on('mousedown', onMouseDown)
  return () => map.off('mousedown', onMouseDown)
}
