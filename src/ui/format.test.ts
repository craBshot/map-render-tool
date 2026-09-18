import { describe, expect, it } from 'vitest'
import { waypointLetter } from './format'

describe('waypointLetter', () => {
  it('uses plain letters for the first 26 indices', () => {
    expect(waypointLetter(0)).toBe('A')
    expect(waypointLetter(1)).toBe('B')
    expect(waypointLetter(25)).toBe('Z')
  })

  it('wraps into double letters past Z, spreadsheet-column style', () => {
    expect(waypointLetter(26)).toBe('AA')
    expect(waypointLetter(27)).toBe('AB')
    expect(waypointLetter(51)).toBe('AZ')
    expect(waypointLetter(52)).toBe('BA')
  })
})
