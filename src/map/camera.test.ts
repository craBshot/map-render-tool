import { describe, expect, it } from 'vitest'
import { camAt, cameraSegments, cameraTotalSec } from './camera'
import { createDefaultCameraWaypoint, type CameraState, type CameraWaypoint } from '../state/types'

function wp(overrides: Partial<CameraWaypoint> = {}): CameraWaypoint {
  return { ...createDefaultCameraWaypoint(0, 0, 2), holdSec: 0, travelSec: 0, ...overrides }
}

// A single travel leg with no holds, sized so sec===travelSec/2 lands exactly on the
// curve's local t=0.5 — reproduces the exact interpolation math this project relies on
// (see CLAUDE.md's known pitfalls: pan must be re-parameterized to match zoom speed).
function twoPointCamera(overrides: { start?: Partial<CameraWaypoint>; end?: Partial<CameraWaypoint> } = {}): CameraState {
  return {
    waypoints: [
      wp({ lng: 0, lat: 0, zr: 2, holdSec: 0, ...overrides.start }),
      wp({ lng: 10, lat: 0, zr: 10, holdSec: 0, travelSec: 8, ...overrides.end }),
    ],
  }
}

describe('camAt — interpolation math (2 waypoints, no holds)', () => {
  it('is at the start point at sec=0', () => {
    const frame = camAt(twoPointCamera(), 0)
    expect(frame.center[0]).toBeCloseTo(0, 9)
    expect(frame.center[1]).toBeCloseTo(0, 9)
    expect(frame.zr).toBeCloseTo(2, 9)
    expect(frame.bearing).toBe(0)
    expect(frame.pitch).toBe(0)
  })

  it('is at the end point once travel completes', () => {
    const frame = camAt(twoPointCamera(), 8)
    expect(frame.center[0]).toBeCloseTo(10, 9)
    expect(frame.center[1]).toBeCloseTo(0, 9)
    expect(frame.zr).toBeCloseTo(10, 9)
  })

  it('lerps zoom linearly but pan non-linearly, matched to screen-space zoom speed', () => {
    // ease(0.5) === 0.5 exactly for the piecewise cubic in-out curve; sec=4 is the travel leg's midpoint.
    const frame = camAt(twoPointCamera(), 4)
    expect(frame.zr).toBeCloseTo(6, 9) // linear midpoint of 2 and 10
    // s = (1 - 2^-4) / (1 - 2^-8) = 16/17, applied to the lng/mercator-x lerp
    // (at lat=0 the mercator y is identical at both ends, so lat stays 0)
    expect(frame.center[0]).toBeCloseTo(10 * (16 / 17), 9)
    expect(frame.center[1]).toBeCloseTo(0, 9)
  })

  it('falls back to a linear pan when start/end zoom are within 0.01', () => {
    const cam = twoPointCamera({ start: { zr: 5 }, end: { zr: 5.005 } })
    const frame = camAt(cam, 4)
    expect(frame.center[0]).toBeCloseTo(5, 9) // plain lng midpoint, s === e
    expect(frame.zr).toBeCloseTo(5.0025, 9)
  })

  it('clamps before the start and after the end', () => {
    const cam = twoPointCamera()
    expect(camAt(cam, -5)).toEqual(camAt(cam, 0))
    expect(camAt(cam, 1000)).toEqual(camAt(cam, 8))
  })
})

describe('camAt — waypoint chain (holds + multiple legs)', () => {
  // A (hold 1s) --travel 3s--> B (hold 2s) --travel 5s--> C (hold 1s, last)
  const A = wp({ lng: 0, lat: 0, zr: 2, holdSec: 1 })
  const B = wp({ lng: 10, lat: 0, zr: 6, holdSec: 2, travelSec: 3 })
  const C = wp({ lng: 20, lat: 0, zr: 10, holdSec: 1, travelSec: 5 })
  const camera: CameraState = { waypoints: [A, B, C] }

  it('sums every waypoint\'s hold + travel (first waypoint\'s travel excluded)', () => {
    expect(cameraTotalSec(camera.waypoints)).toBe(1 + 3 + 2 + 5 + 1) // 12
  })

  it('holds statically at A for the first holdSec', () => {
    const frame = camAt(camera, 0.5)
    expect(frame.center).toEqual([0, 0])
    expect(frame.zr).toBe(2)
  })

  it('is continuous across the hold-A -> travel-to-B boundary', () => {
    expect(camAt(camera, 1.0)).toEqual(camAt(camera, 0.5)) // still exactly at A
  })

  it('resolves the middle segment (arrival at B) correctly — the actual new capability', () => {
    const atArrival = camAt(camera, 4) // 1 (hold A) + 3 (travel) = 4
    expect(atArrival.center[0]).toBeCloseTo(10, 9)
    expect(atArrival.zr).toBeCloseTo(6, 9)
  })

  it('holds statically at B, then is continuous into the travel-to-C leg', () => {
    const midHold = camAt(camera, 5) // within B's 2s hold (4..6)
    expect(midHold.center[0]).toBeCloseTo(10, 9)
    const justAfterHold = camAt(camera, 6) // hold ends, travel to C begins
    expect(justAfterHold.center[0]).toBeCloseTo(10, 9) // still at B, t=0 of the new leg
  })

  it('arrives at C (the last waypoint) and stays there for any time beyond', () => {
    const atC = camAt(camera, 11) // 1+3+2+5 = 11
    expect(atC.center[0]).toBeCloseTo(20, 9)
    expect(atC.zr).toBeCloseTo(10, 9)
    expect(camAt(camera, 999)).toEqual(atC) // clamped past the end
  })

  it('clamps travelSec to a 0.5s floor so a near-zero leg never renders a broken snap', () => {
    const snap: CameraState = { waypoints: [wp({ lng: 0, lat: 0, zr: 2 }), wp({ lng: 10, lat: 0, zr: 2, travelSec: 0.01 })] }
    expect(cameraTotalSec(snap.waypoints)).toBe(0.5)
    const midway = camAt(snap, 0.25) // half of the clamped 0.5s floor, not half of the requested 0.01s
    expect(midway.center[0]).toBeGreaterThan(0)
    expect(midway.center[0]).toBeLessThan(10)
  })
})

describe('cameraSegments', () => {
  it('lists a 2-waypoint chain as hold,travel,hold, in order', () => {
    const camera = twoPointCamera({ start: { holdSec: 1 }, end: { holdSec: 2, travelSec: 4 } })
    const segments = cameraSegments(camera.waypoints)
    expect(segments.map((s) => s.kind)).toEqual(['hold', 'travel', 'hold'])
    expect(segments[0]).toMatchObject({ startSec: 0, durationSec: 1 })
    expect(segments[1]).toMatchObject({ startSec: 1, durationSec: 4 })
    expect(segments[2]).toMatchObject({ startSec: 5, durationSec: 2 })
  })

  it('lists a 4-waypoint chain as 7 segments, alternating kind', () => {
    const wps = [
      wp({ id: 'w0', holdSec: 1 }),
      wp({ id: 'w1', holdSec: 1, travelSec: 2 }),
      wp({ id: 'w2', holdSec: 1, travelSec: 2 }),
      wp({ id: 'w3', holdSec: 1, travelSec: 2 }),
    ]
    const segments = cameraSegments(wps)
    expect(segments).toHaveLength(7)
    expect(segments.map((s) => s.kind)).toEqual([
      'hold', 'travel', 'hold', 'travel', 'hold', 'travel', 'hold',
    ])
  })

  it('delegates to the same clamp cameraTotalSec uses — a sub-floor travelSec is clamped in the output', () => {
    const wps = [wp({ id: 'w0' }), wp({ id: 'w1', travelSec: 0.01 })]
    const segments = cameraSegments(wps)
    const travel = segments.find((s) => s.kind === 'travel')
    expect(travel?.durationSec).toBe(0.5) // MIN_TRAVEL_SEC floor, not the requested 0.01
  })

  it('segment durations sum to cameraTotalSec', () => {
    const A = wp({ id: 'a', holdSec: 1 })
    const B = wp({ id: 'b', holdSec: 2, travelSec: 3 })
    const C = wp({ id: 'c', holdSec: 1, travelSec: 5 })
    const waypoints = [A, B, C]
    const sum = cameraSegments(waypoints).reduce((s, seg) => s + seg.durationSec, 0)
    expect(sum).toBe(cameraTotalSec(waypoints))
  })
})
