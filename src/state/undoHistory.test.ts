import { describe, expect, it } from 'vitest'
import { emptyHistory, HISTORY_LIMIT, pushStep, redoStep, undoStep } from './undoHistory'

describe('undoHistory', () => {
  it('undo returns the state before the last step, redo returns to it', () => {
    let h = pushStep(emptyHistory<string>(), 'a') // a -> b
    h = pushStep(h, 'b') // b -> c
    const u = undoStep(h, 'c')!
    expect(u.state).toBe('b')
    const u2 = undoStep(u.history, u.state)!
    expect(u2.state).toBe('a')
    expect(undoStep(u2.history, u2.state)).toBeNull()
    const r = redoStep(u2.history, u2.state)!
    expect(r.state).toBe('b')
    expect(redoStep(r.history, r.state)!.state).toBe('c')
  })

  it('a new step after undo drops the redo future', () => {
    const h = pushStep(emptyHistory<string>(), 'a')
    const u = undoStep(h, 'b')!
    const h2 = pushStep(u.history, 'a') // a -> x
    expect(h2.future).toEqual([])
    expect(redoStep(h2, 'x')).toBeNull()
  })

  it(`keeps at most ${HISTORY_LIMIT} steps, dropping the oldest`, () => {
    let h = emptyHistory<number>()
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = pushStep(h, i)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]).toBe(5)
  })
})
