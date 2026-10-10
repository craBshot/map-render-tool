import { waypointsToStraightLine } from '../map/routeGeometry'
import type { ProjectFile } from './types'

/**
 * Pure "move an existing point to lng/lat" updaters — kept separate from
 * pointMutations.ts's store-dispatching wrappers (which import useProjectStore,
 * and so transitively load localStorage-touching persistence code) so this
 * logic stays unit-testable in Node without a DOM/localStorage.
 */

export function withMarkerPosition(project: ProjectFile, id: string, lng: number, lat: number): ProjectFile {
  return { ...project, markers: project.markers.map((m) => (m.id === id ? { ...m, lng, lat } : m)) }
}

export function withCameraWaypointPosition(project: ProjectFile, id: string, lng: number, lat: number): ProjectFile {
  return {
    ...project,
    camera: { ...project.camera, waypoints: project.camera.waypoints.map((w) => (w.id === id ? { ...w, lng, lat } : w)) },
  }
}

/**
 * Same legDistancesM/geometry invalidation as RoutePanel.tsx's moveWaypoint/
 * deleteWaypoint: legDistancesM is always nulled (a moved waypoint can
 * silently invalidate OSRM's per-leg distances even without changing the
 * array length), and geometry is only recomputed here for the 'straight'
 * mode (cheap, local). An 'osrm' route is deliberately left stale — same
 * as the existing mutators — until "Route berechnen" is clicked again, so
 * a drag never fires an OSRM request (fair-use constraint, see CLAUDE.md).
 */
export function withRouteWaypointPosition(project: ProjectFile, id: string, lng: number, lat: number): ProjectFile {
  if (!project.routes.some((route) => route.waypoints.some((w) => w.id === id))) return project
  return {
    ...project,
    routes: project.routes.map((route) => {
      if (!route.waypoints.some((w) => w.id === id)) return route
      const waypoints = route.waypoints.map((w) => (w.id === id ? { ...w, lng, lat } : w))
      const geometry = route.routingMode === 'straight' ? waypointsToStraightLine(waypoints) : route.geometry
      return { ...route, waypoints, geometry, legDistancesM: null }
    }),
  }
}
