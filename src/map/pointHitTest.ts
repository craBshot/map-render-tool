import type { DraggablePointKind, PointInteractionMode } from '../state/editorStore'
import type { ProjectFile } from '../state/types'

/** Pixel projector — a minimal structural subset of maplibregl.Map, so this stays unit-testable without a real map. */
export interface Projector {
  project(lngLat: [number, number]): { x: number; y: number }
}

export interface HitPoint {
  kind: DraggablePointKind
  id: string
  /** Position in its source array — same-type overlap tie-break is "last in array wins", see pickNearest. */
  index: number
  lng: number
  lat: number
  /** The route a route waypoint belongs to (routes are a list, each with its own waypoints); unset for other kinds. */
  ownerId?: string
}

const ALL_KINDS: DraggablePointKind[] = ['marker', 'route', 'camera']

/** Areas are polygons, not points — never draggable/snappable through this module. */
export function kindForInteractionMode(mode: PointInteractionMode): DraggablePointKind | null {
  return mode === 'area' ? null : mode
}

export function collectPoints(kind: DraggablePointKind, project: ProjectFile): HitPoint[] {
  if (kind === 'marker') {
    return project.markers.map((m, index) => ({ kind, id: m.id, index, lng: m.lng, lat: m.lat }))
  }
  if (kind === 'route') {
    return project.routes.flatMap((route) =>
      route.waypoints.map((w, index) => ({ kind, id: w.id, index, lng: w.lng, lat: w.lat, ownerId: route.id })),
    )
  }
  return project.camera.waypoints.map((w, index) => ({ kind, id: w.id, index, lng: w.lng, lat: w.lat }))
}

function pixelDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Nearest candidate within radiusPx, or null. On an exact-distance tie, the
 * LATER array element wins (`<=`, not `<`) — this is the whole same-type
 * overlap tie-break rule, confirmed with the user as "last in array wins".
 */
export function pickNearest(projector: Projector, points: HitPoint[], pointerPx: { x: number; y: number }, radiusPx: number): HitPoint | null {
  let best: HitPoint | null = null
  let bestDist = Infinity
  for (const point of points) {
    const dist = pixelDistance(projector.project([point.lng, point.lat]), pointerPx)
    if (dist <= radiusPx && dist <= bestDist) {
      best = point
      bestDist = dist
    }
  }
  return best
}

/** Slightly larger than DRAG_PICKUP_RADIUS_PX — snapping should feel generous, accidental pickup should not. */
export const SNAP_RADIUS_PX = 14
export const DRAG_PICKUP_RADIUS_PX = 10

/**
 * What a mousedown at pointerPx would pick up, scoped to the current
 * interaction mode — a marker can never be picked up while in Route mode,
 * even if it's the closest point on screen, since it's never in the
 * candidate list to begin with.
 */
export function hitTestDraggable(
  mode: PointInteractionMode,
  project: ProjectFile,
  projector: Projector,
  pointerPx: { x: number; y: number },
  radiusPx: number = DRAG_PICKUP_RADIUS_PX,
): HitPoint | null {
  const kind = kindForInteractionMode(mode)
  if (kind === null) return null
  return pickNearest(projector, collectPoints(kind, project), pointerPx, radiusPx)
}

/**
 * Nearest point of ANY kind at pointerPx, regardless of the current
 * interaction mode — used for double-click-to-edit, which is an "I want to
 * edit whatever is under my cursor" gesture, not a "move a point" gesture,
 * so it isn't mode-scoped the way hitTestDraggable is.
 */
export function hitTestAnyKind(project: ProjectFile, projector: Projector, pointerPx: { x: number; y: number }, radiusPx: number = DRAG_PICKUP_RADIUS_PX): HitPoint | null {
  return pickNearest(projector, ALL_KINDS.flatMap((k) => collectPoints(k, project)), pointerPx, radiusPx)
}

/**
 * The snap target for a point being placed/dragged at candidateLngLat. Looks at the
 * OTHER kinds, plus the waypoints of OTHER routes — never at points of the same
 * owner (same marker list, same camera flight, same route), so those never stack and
 * there's nothing to pull apart later. Routes snapping onto each other is deliberate:
 * it's how one route continues where another ends (e.g. street leg -> straight leg).
 */
export function findSnapTarget(
  active: { kind: DraggablePointKind; ownerId?: string },
  project: ProjectFile,
  projector: Projector,
  candidateLngLat: { lng: number; lat: number },
  radiusPx: number = SNAP_RADIUS_PX,
): HitPoint | null {
  const candidates = ALL_KINDS.flatMap((k) => collectPoints(k, project)).filter((point) =>
    point.kind === 'route' && active.kind === 'route' ? point.ownerId !== active.ownerId : point.kind !== active.kind,
  )
  const pointerPx = projector.project([candidateLngLat.lng, candidateLngLat.lat])
  return pickNearest(projector, candidates, pointerPx, radiusPx)
}
