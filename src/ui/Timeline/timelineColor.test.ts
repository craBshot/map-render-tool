import { describe, expect, it } from 'vitest'
import { lighten } from './timelineColor'

describe('lighten', () => {
  it('returns white unchanged at amount 1', () => {
    expect(lighten('#000000', 1)).toBe('#ffffff')
  })

  it('returns the original color unchanged at amount 0', () => {
    expect(lighten('#6b3fa0', 0)).toBe('#6b3fa0')
  })

  it('blends each channel proportionally toward 255', () => {
    // #6b3fa0 = (107, 63, 160); at 0.5, each channel is halfway to 255.
    expect(lighten('#6b3fa0', 0.5)).toBe('#b59fd0')
  })
})
