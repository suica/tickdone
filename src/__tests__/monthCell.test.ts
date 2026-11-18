import { describe, expect, it } from 'vitest'
import { capChips, MAX_CHIPS, weekNumber } from '../views/monthCell'

describe('month cell bars', () => {
  it('shows every task that fits, up to the cap', () => {
    expect(capChips(0, 5)).toEqual({ shown: 0, more: 0 })
    expect(capChips(3, 5)).toEqual({ shown: 3, more: 0 })
    expect(capChips(MAX_CHIPS, 9)).toEqual({ shown: MAX_CHIPS, more: 0 })
  })

  it('keeps a row for "+N more" when there are more tasks than rows', () => {
    expect(capChips(7, 5)).toEqual({ shown: 4, more: 3 })
    expect(capChips(7, 3)).toEqual({ shown: 2, more: 5 })
    expect(capChips(2, 1)).toEqual({ shown: 0, more: 2 })
  })

  it('never shows more than the cap, however tall the cell', () => {
    expect(capChips(12, 20)).toEqual({ shown: MAX_CHIPS, more: 12 - MAX_CHIPS })
    expect(capChips(MAX_CHIPS + 1, 20)).toEqual({ shown: MAX_CHIPS, more: 1 })
  })
})

describe('week numbers', () => {
  const d = (s: string) => new Date(s + 'T12:00:00')
  it('uses ISO weeks when weeks start on Monday', () => {
    expect(weekNumber(d('2026-11-16'), 1)).toBe(47)
    expect(weekNumber(d('2026-12-28'), 1)).toBe(53)
    expect(weekNumber(d('2027-01-04'), 1)).toBe(1)
    expect(weekNumber(d('2025-12-29'), 1)).toBe(1)
  })

  it('counts Sunday weeks from the one holding January 1 otherwise', () => {
    expect(weekNumber(d('2026-11-15'), 0)).toBe(47)
    expect(weekNumber(d('2026-12-27'), 0)).toBe(1)
    expect(weekNumber(d('2027-01-03'), 0)).toBe(2)
  })
})
