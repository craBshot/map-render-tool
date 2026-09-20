import type { MapMouseEvent } from 'maplibre-gl'
import { useEditorStore, type EditableKind, type SidebarSectionKey } from '../state/editorStore'
import { useProjectStore } from '../state/store'
import { hitTestAnyKind } from './pointHitTest'
import { hitTestArea, hitTestRouteLeg } from './shapeHitTest'
import type { MapController } from './MapController'

const SECTION_FOR_KIND: Record<EditableKind, SidebarSectionKey> = {
  marker: 'marker',
  route: 'route',
  camera: 'camera',
  area: 'areas',
}

/**
 * Double-click on any point (marker, route waypoint, camera waypoint), an
 * area polygon, or the route line itself jumps straight to editing it:
 * expands its Sidebar section if collapsed, selects it (scrolls into view,
 * highlights), and focuses its single most relevant field with the value
 * selected, ready to type over immediately — camera: zoom, route waypoint:
 * hold time, route LEG (the line between two waypoints, not a waypoint
 * itself): the arriving waypoint's travel time, marker/area: appear-at.
 *
 * Deliberately NOT mode-scoped like pointDrag.ts's hitTestDraggable — "let
 * me edit whatever's under my cursor" isn't the same ambiguous situation
 * as "which of several overlapping points do I want to move", so any
 * target is eligible regardless of the current interaction mode. Since the
 * Sidebar only renders the section for the CURRENT mode (see Sidebar.tsx),
 * a hit on a different kind also switches the mode to match — editing a
 * route waypoint while in Marker mode naturally puts you "into" Route
 * mode, which is also what makes its section actually appear.
 *
 * Hit-test priority follows the map's own visual stacking (areas render
 * below the route, which renders below markers/waypoint dots — see
 * MapController's applyFrame): points first, then the route line, then
 * areas — matching what a click at an overlap point is actually "looking
 * at" on screen.
 */
export function attachDoubleClickEditHandler(controller: MapController): () => void {
  const map = controller.map

  function onDoubleClick(e: MapMouseEvent) {
    const editor = useEditorStore.getState()
    if (editor.locked || editor.playing) return
    const project = useProjectStore.getState().project

    const pointHit = hitTestAnyKind(project, map, e.point)
    if (pointHit) {
      e.preventDefault() // suppresses MapLibre's default double-click zoom for this click
      editor.setPointInteractionMode(pointHit.kind)
      editor.setSidebarSectionOpen(SECTION_FOR_KIND[pointHit.kind], true)
      editor.setSelectedObjectId(pointHit.id)
      editor.setFocusFieldRequest({ kind: pointHit.kind, id: pointHit.id })
      return
    }

    const legIndex = project.route ? hitTestRouteLeg(project.route, map, e.point) : null
    if (legIndex !== null && project.route) {
      const arriving = project.route.waypoints[legIndex + 1]
      e.preventDefault()
      editor.setPointInteractionMode('route')
      editor.setSidebarSectionOpen('route', true)
      editor.setSelectedObjectId(arriving.id)
      editor.setFocusFieldRequest({ kind: 'route', id: arriving.id, field: 'travelSec' })
      return
    }

    const area = hitTestArea(project, e.lngLat)
    if (area) {
      e.preventDefault()
      editor.setPointInteractionMode('area')
      editor.setSidebarSectionOpen('areas', true)
      editor.setSelectedObjectId(area.id)
      editor.setFocusFieldRequest({ kind: 'area', id: area.id })
      return
    }

    // nothing hit — let the native double-click-to-zoom proceed
  }

  map.on('dblclick', onDoubleClick)
  return () => map.off('dblclick', onDoubleClick)
}
