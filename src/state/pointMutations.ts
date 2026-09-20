import { withCameraWaypointPosition, withMarkerPosition, withRouteWaypointPosition } from './pointPosition'
import { useProjectStore } from './store'

/**
 * Thin store-dispatching wrappers around pointPosition.ts's pure updaters —
 * pointDrag.ts (imperative map-event code, not a component) calls these to
 * commit a drag gesture's final position, the same useProjectStore.getState()
 * idiom MapStage.tsx's handleContextMenu already uses.
 */

export function setMarkerPosition(id: string, lng: number, lat: number): void {
  useProjectStore.getState().setProject((p) => withMarkerPosition(p, id, lng, lat))
}

export function setCameraWaypointPosition(id: string, lng: number, lat: number): void {
  useProjectStore.getState().setProject((p) => withCameraWaypointPosition(p, id, lng, lat))
}

export function setRouteWaypointPosition(id: string, lng: number, lat: number): void {
  useProjectStore.getState().setProject((p) => withRouteWaypointPosition(p, id, lng, lat))
}
