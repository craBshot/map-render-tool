import { describe, expect, it } from 'vitest'
import { cameraTotalSec } from '../map/camera'
import { createDefaultMarker, createDefaultProject, createDefaultRoute, type ProjectFile, type RouteWaypoint } from '../state/types'
import { extendCameraToFit } from './autoExtend'

function wp(id: string, holdSec: number, travelSec: number): RouteWaypoint {
  return { id, lng: 0, lat: 0, holdSec, travelSec }
}

/** Default camera: 1 s hold + 4 s travel + 2 s hold = 7 s. */
function base(): ProjectFile {
  return createDefaultProject()
}

describe('extendCameraToFit', () => {
  it('lengthens the last camera hold so a new route that runs past the end fits exactly', () => {
    const before = base()
    expect(cameraTotalSec(before.camera.waypoints)).toBe(7)
    const route = { ...createDefaultRoute([wp('a', 1, 0), wp('b', 1, 3), wp('c', 1, 3)]), appear: { startSec: 1 } } // ends at 1 + 9 = 10
    const after = { ...before, routes: [route] }

    const result = extendCameraToFit(before, after)!
    expect(result.totalSec).toBe(10)
    expect(result.cause).toMatchObject({ id: route.id, kind: 'route' })
    expect(result.project.camera.waypoints.at(-1)!.holdSec).toBe(2 + 3)
    expect(result.project.camera.waypoints[0]).toBe(before.camera.waypoints[0]) // only the last waypoint changes
  })

  it('does nothing while everything fits', () => {
    const before = base()
    const after = { ...before, routes: [{ ...createDefaultRoute([wp('a', 1, 0), wp('b', 1, 3)]), appear: { startSec: 1 } }] } // ends at 6
    expect(extendCameraToFit(before, after)).toBeNull()
  })

  it('never reacts to the camera flight itself getting shorter (an already-overflowing object stays as is)', () => {
    const route = { ...createDefaultRoute([wp('a', 1, 0), wp('b', 1, 3)]), appear: { startSec: 1 } } // ends at 6
    const before = { ...base(), routes: [route] }
    const after = {
      ...before,
      camera: { waypoints: before.camera.waypoints.map((w, i) => (i === 1 ? { ...w, holdSec: 0 } : w)) }, // 5 s
    }
    expect(extendCameraToFit(before, after)).toBeNull()
  })

  it('a marker that stays until the end still has to be able to appear', () => {
    const before = base()
    const marker = createDefaultMarker(0, 0)
    marker.appear = { startSec: 9, fadeInSec: 0.5, holdSec: undefined, fadeOutSec: 0 }
    const result = extendCameraToFit(before, { ...before, markers: [marker] })!
    expect(result.totalSec).toBe(9.5)
  })

  it('ignores hidden objects', () => {
    const before = base()
    const route = { ...createDefaultRoute([wp('a', 30, 0)]), visible: false }
    expect(extendCameraToFit(before, { ...before, routes: [route] })).toBeNull()
  })
})
