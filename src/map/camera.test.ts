import { describe, expect, it } from 'vitest'
import { camAt } from './camera'
import type { CameraState } from '../state/types'

function camera(overrides: Partial<CameraState> = {}): CameraState {
  return {
    start: { lng: 0, lat: 0, zr: 2 },
    end: { lng: 10, lat: 0, zr: 10 },
    timing: { holdStartSec: 1, zoomDurationSec: 4, holdEndSec: 2 },
    ...overrides,
  }
}

describe('camAt', () => {
  it('is at the start point at t=0', () => {
    const cam = camera()
    const frame = camAt(cam, 0)
    expect(frame.center[0]).toBeCloseTo(0, 9)
    expect(frame.center[1]).toBeCloseTo(0, 9)
    expect(frame.zr).toBeCloseTo(2, 9)
    expect(frame.bearing).toBe(0)
    expect(frame.pitch).toBe(0)
  })

  it('is at the end point at t=1', () => {
    const cam = camera()
    const frame = camAt(cam, 1)
    expect(frame.center[0]).toBeCloseTo(10, 9)
    expect(frame.center[1]).toBeCloseTo(0, 9)
    expect(frame.zr).toBeCloseTo(10, 9)
  })

  it('lerps zoom linearly but pan non-linearly, matched to screen-space zoom speed', () => {
    // ease(0.5) === 0.5 exactly for the piecewise cubic in-out curve.
    const frame = camAt(camera(), 0.5)
    expect(frame.zr).toBeCloseTo(6, 9) // linear midpoint of 2 and 10
    // s = (1 - 2^-4) / (1 - 2^-8) = 16/17, applied to the lng/mercator-x lerp
    // (at lat=0 the mercator y is identical at both ends, so lat stays 0)
    expect(frame.center[0]).toBeCloseTo(10 * (16 / 17), 9)
    expect(frame.center[1]).toBeCloseTo(0, 9)
  })

  it('falls back to a linear pan when start/end zoom are within 0.01', () => {
    const cam = camera({
      start: { lng: 0, lat: 0, zr: 5 },
      end: { lng: 10, lat: 0, zr: 5.005 },
    })
    const frame = camAt(cam, 0.5)
    expect(frame.center[0]).toBeCloseTo(5, 9) // plain lng midpoint, s === e
    expect(frame.zr).toBeCloseTo(5.0025, 9)
  })

  it('clamps t outside [0, 1]', () => {
    const cam = camera()
    expect(camAt(cam, -1)).toEqual(camAt(cam, 0))
    expect(camAt(cam, 2)).toEqual(camAt(cam, 1))
  })
})
