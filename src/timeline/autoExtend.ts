import { cameraTotalSec } from '../map/camera'
import type { AppearTiming, ProjectFile } from '../state/types'
import { chainTotalSec } from './waypointChain'

export interface TimedObject {
  id: string
  kind: 'marker' | 'area' | 'route'
  endSec: number
}

/**
 * The latest time the video must reach for an appear-timed object to play out: fully faded out
 * again, or — for "stays until the end" objects, which adapt to any length — at least fully faded in.
 */
function appearEndSec(appear: AppearTiming): number {
  const shownAt = appear.startSec + Math.max(0, appear.fadeInSec)
  if (appear.holdSec === undefined) return shownAt
  return shownAt + Math.max(0, appear.holdSec) + Math.max(0, appear.fadeOutSec)
}

/** When each visible marker/area/route is done playing out (see appearEndSec; routes: fully drawn incl. holds). */
export function timedObjects(project: ProjectFile): TimedObject[] {
  const result: TimedObject[] = []
  for (const marker of project.markers) {
    if (marker.visible) result.push({ id: marker.id, kind: 'marker', endSec: appearEndSec(marker.appear) })
  }
  for (const area of project.areas) {
    if (area.visible) result.push({ id: area.id, kind: 'area', endSec: appearEndSec(area.appear) })
  }
  for (const route of project.routes) {
    if (route.visible) result.push({ id: route.id, kind: 'route', endSec: route.appear.startSec + chainTotalSec(route.waypoints) })
  }
  return result
}

export interface CameraExtension {
  project: ProjectFile
  /** New video length. */
  totalSec: number
  /** The object that ran longest past the old end. */
  cause: TimedObject
}

/**
 * If the edit before -> after made an object end later than the video (= camera flight) does,
 * lengthens the camera's last hold so the video covers it. Only objects whose end actually moved
 * later (or that are new) count: shortening the camera flight yourself never triggers this, and
 * neither does an object that already overflowed before. Never shortens anything.
 */
export function extendCameraToFit(before: ProjectFile, after: ProjectFile): CameraExtension | null {
  const waypoints = after.camera.waypoints
  const last = waypoints.at(-1)
  if (!last) return null

  const totalSec = cameraTotalSec(waypoints)
  const previousEnd = new Map(timedObjects(before).map((o) => [o.id, o.endSec]))
  const overflowing = timedObjects(after).filter((o) => {
    const prev = previousEnd.get(o.id)
    return o.endSec > totalSec + 1e-9 && (prev === undefined || o.endSec > prev + 1e-9)
  })
  if (overflowing.length === 0) return null

  const cause = overflowing.reduce((a, b) => (b.endSec > a.endSec ? b : a))
  const extraSec = cause.endSec - totalSec
  const project: ProjectFile = {
    ...after,
    camera: {
      ...after.camera,
      waypoints: waypoints.map((w) => (w === last ? { ...w, holdSec: Math.max(0, w.holdSec) + extraSec } : w)),
    },
  }
  return { project, totalSec: cameraTotalSec(project.camera.waypoints), cause }
}
