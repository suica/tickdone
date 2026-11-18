import { describe, expect, it } from 'vitest'
import { windowParts, windowRange } from '../listWindowMath'

const rows = (n: number, h = 40) => Array.from({ length: n }, () => h)

describe('windowRange', () => {
  it('takes the rows that overlap the band', () => {
    expect(windowRange(rows(100), 0, 400)).toEqual([0, 10])
    expect(windowRange(rows(100), 1000, 1400)).toEqual([25, 35])
    // a row cut by the top edge is included
    expect(windowRange(rows(100), 1010, 1400)).toEqual([25, 35])
  })
  it('is empty for a band above or below the rows', () => {
    expect(windowRange(rows(10), 500, 900)).toEqual([10, 10])
    expect(windowRange(rows(10), -900, -500)).toEqual([0, 0])
  })
  it('follows rows of different heights', () => {
    expect(windowRange([10, 100, 10, 10], 50, 115)).toEqual([1, 3])
  })
  it('clamps to the rows that exist', () => {
    expect(windowRange(rows(5), -100, 10_000)).toEqual([0, 5])
    expect(windowRange([], 0, 100)).toEqual([0, 0])
  })
})

describe('windowParts', () => {
  it('puts spacers of the skipped rows around the range', () => {
    expect(windowParts(rows(10), [3, 5])).toEqual([
      { kind: 'gap', from: 0, to: 3, height: 120 },
      { kind: 'rows', from: 3, to: 5 },
      { kind: 'gap', from: 5, to: 10, height: 200 },
    ])
  })
  it('keeps rows outside the range at their place', () => {
    expect(windowParts(rows(10), [0, 2], [7])).toEqual([
      { kind: 'rows', from: 0, to: 2 },
      { kind: 'gap', from: 2, to: 7, height: 200 },
      { kind: 'rows', from: 7, to: 8 },
      { kind: 'gap', from: 8, to: 10, height: 80 },
    ])
  })
  it('joins kept rows next to the range', () => {
    expect(windowParts(rows(5), [1, 3], [3, 0])).toEqual([{ kind: 'rows', from: 0, to: 4 }, { kind: 'gap', from: 4, to: 5, height: 40 }])
  })
  it('is one spacer when nothing is rendered, and nothing for no rows', () => {
    expect(windowParts(rows(3), [3, 3])).toEqual([{ kind: 'gap', from: 0, to: 3, height: 120 }])
    expect(windowParts([], [0, 0])).toEqual([])
  })
  it('ignores kept indexes that do not exist', () => {
    expect(windowParts(rows(2), [0, 2], [-1, 5])).toEqual([{ kind: 'rows', from: 0, to: 2 }])
  })
})
