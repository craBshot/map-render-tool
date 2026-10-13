import { describe, expect, it } from 'vitest'
import { chainArrivalsSec, moveChainWaypoint, resizeChainHold, type ChainWaypoint } from './waypointChain'

// A arrives 0, hold 1 → B arrives 3, hold 1 → C arrives 6, hold 1 → D arrives 9, hold 2. Total 11.
function chain(): ChainWaypoint[] {
  return [
    { id: 'A', holdSec: 1, travelSec: 0 },
    { id: 'B', holdSec: 1, travelSec: 2 },
    { id: 'C', holdSec: 1, travelSec: 2 },
    { id: 'D', holdSec: 2, travelSec: 2 },
  ]
}
const ids = (w: ChainWaypoint[]) => w.map((x) => x.id).join('')
const MIN = 0.5

describe('chainArrivalsSec', () => {
  it('accumulates travel and hold', () => {
    expect(chainArrivalsSec(chain())).toEqual([0, 3, 6, 9])
  })
})

describe('moveChainWaypoint', () => {
  it('moves locally: only the legs around the waypoint change', () => {
    const r = moveChainWaypoint(chain(), 'B', 4, MIN)
    expect(ids(r)).toBe('ABCD')
    expect(chainArrivalsSec(r, MIN)).toEqual([0, 4, 6, 9])
    expect(r.map((w) => w.holdSec)).toEqual([1, 1, 1, 2])
  })

  it('reorders when overtaking a neighbor, hold travels with it', () => {
    const w = chain()
    w[2] = { ...w[2], holdSec: 0.5 } // C: arrives 6, holds 0.5 → D arrives 8.5
    const r = moveChainWaypoint(w, 'C', 2, MIN)
    expect(ids(r)).toBe('ACBD')
    expect(chainArrivalsSec(r, MIN)).toEqual([0, 2, 3, 8.5])
    expect(r[1].holdSec).toBe(0.5)
  })

  it('never moves before the first waypoint', () => {
    const r = moveChainWaypoint(chain(), 'C', 0, MIN)
    expect(ids(r)).toBe('ACBD')
    expect(chainArrivalsSec(r, MIN)[1]).toBe(1.5) // A's hold end + MIN
  })

  it('snaps to the nearer side of another waypoint\'s hold', () => {
    const w = chain()
    w[2] = { ...w[2], holdSec: 2 } // C holds 6..8, midpoint 7
    const before = moveChainWaypoint(w, 'B', 6.5, MIN)
    expect(ids(before)).toBe('ABCD')
    const after = moveChainWaypoint(w, 'B', 7.5, MIN)
    expect(ids(after)).toBe('ACBD')
  })

  it('moving the last waypoint changes the total length', () => {
    const r = moveChainWaypoint(chain(), 'D', 15, MIN)
    expect(chainArrivalsSec(r, MIN)).toEqual([0, 3, 6, 15])
  })

  it('pushes later waypoints only when the gap is too narrow', () => {
    const w = chain()
    w[0] = { ...w[0], holdSec: 0 }
    w[3] = { ...w[3], holdSec: 3 } // D wide
    // squeeze D between A(0) and B(3): needs 0.5 + 3 + 0.5 > 3
    const r = moveChainWaypoint(w, 'D', 1, MIN)
    expect(ids(r)).toBe('ADBC')
    const a = chainArrivalsSec(r, MIN)
    expect(a[1]).toBe(0.5)
    expect(a[2]).toBe(4)
    r.slice(1).forEach((x) => expect(x.travelSec).toBeGreaterThanOrEqual(MIN))
  })

  it('ignores the first waypoint and unknown ids', () => {
    const w = chain()
    expect(moveChainWaypoint(w, 'A', 5, MIN)).toBe(w)
    expect(moveChainWaypoint(w, 'X', 5, MIN)).toBe(w)
  })
})

describe('resizeChainHold', () => {
  it('eats into the next travel leg, later waypoints stay put', () => {
    const r = resizeChainHold(chain(), 'B', 2, MIN)
    expect(chainArrivalsSec(r, MIN)).toEqual([0, 3, 6, 9])
    expect(r[2].travelSec).toBe(1)
  })

  it('clamps so the next leg keeps the floor', () => {
    const r = resizeChainHold(chain(), 'B', 10, MIN)
    expect(r[1].holdSec).toBe(2.5)
    expect(r[2].travelSec).toBe(MIN)
  })

  it('last hold is unbounded', () => {
    const r = resizeChainHold(chain(), 'D', 10, MIN)
    expect(r[3].holdSec).toBe(10)
  })
})
