import type { MapMouseEvent } from 'maplibre-gl'
import { useEditorStore, type DraggablePointKind, type SidebarSectionKey } from '../state/editorStore'
import { useProjectStore } from '../state/store'
import { hitTestAnyKind } from './pointHitTest'
import type { MapController } from './MapController'

const SECTION_FOR_KIND: Record<DraggablePointKind, SidebarSectionKey> = {
  marker: 'marker',
  route: 'route',
  camera: 'camera',
}

/**
 * Double-click on any point (marker, route waypoint, or camera waypoint)
 * jumps straight to editing it: expands its Sidebar section if collapsed
 * and selects it, reusing the selection highlight/scroll-into-view already
 * wired for markers/areas via Timeline clicks (and, since this feature,
 * camera/route waypoints too — see CameraPanel.tsx/RoutePanel.tsx).
 *
 * Deliberately NOT mode-scoped like pointDrag.ts's hitTestDraggable — "let
 * me edit whatever's under my cursor" isn't the same ambiguous situation
 * as "which of several overlapping points do I want to move", so any
 * point of any kind is eligible regardless of the current interaction mode.
 */
export function attachDoubleClickEditHandler(controller: MapController): () => void {
  const map = controller.map

  function onDoubleClick(e: MapMouseEvent) {
    const editor = useEditorStore.getState()
    if (editor.locked || editor.playing) return

    const hit = hitTestAnyKind(useProjectStore.getState().project, map, e.point)
    if (!hit) return // no point under the cursor — let the native double-click-to-zoom proceed

    e.preventDefault() // suppresses MapLibre's default double-click zoom for this click
    editor.setSidebarSectionOpen(SECTION_FOR_KIND[hit.kind], true)
    editor.setSelectedObjectId(hit.id)
  }

  map.on('dblclick', onDoubleClick)
  return () => map.off('dblclick', onDoubleClick)
}
