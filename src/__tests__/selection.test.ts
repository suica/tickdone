import { describe, expect, it } from 'vitest'
import { after, clickSelect, EMPTY_SELECTION, enterMode, inOrder, isBatch, prune, range, selectAll, selectedIds, stepSelect, type Selection } from '../selection'

const order = ['a', 'b', 'c', 'd', 'e']
const one = (id: string): Selection => ({ ids: [], cursor: id, anchor: id, mode: false })

describe('range and order', () => {
  it('range covers both ends in list order, whichever way it goes', () => {
    expect(range(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(range(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(range(order, 'c', 'c')).toEqual(['c'])
  })
  it('a missing anchor gives just the target; a missing target gives nothing', () => {
    expect(range(order, 'x', 'c')).toEqual(['c'])
    expect(range(order, 'a', 'x')).toEqual([])
  })
  it('inOrder sorts by the list and drops duplicates', () => {
    expect(inOrder(order, ['d', 'a', 'd', 'b'])).toEqual(['a', 'b', 'd'])
    expect(inOrder(order, ['z', 'c'])).toEqual(['c', 'z'])
  })
})

describe('clicks', () => {
  it('a plain click selects one task and ends a multi-selection', () => {
    expect(clickSelect(order, { ids: ['a', 'b'], cursor: 'b', anchor: 'a', mode: false }, 'd')).toEqual(one('d'))
  })
  it('Ctrl/⌘-click adds the task to the one under the cursor', () => {
    const s = clickSelect(order, one('a'), 'c', { toggle: true })
    expect(s.ids).toEqual(['a', 'c'])
    expect(s.cursor).toBe('c')
    expect(isBatch(s)).toBe(true)
  })
  it('Ctrl/⌘-click on a selected task removes it; one left is a single selection again', () => {
    const two = clickSelect(order, one('a'), 'c', { toggle: true })
    const back = clickSelect(order, two, 'c', { toggle: true })
    expect(back.ids).toEqual([])
    expect(back.cursor).toBe('a')
    expect(selectedIds(back)).toEqual(['a'])
    expect(isBatch(back)).toBe(false)
  })
  it('Shift-click selects from the anchor; a second Shift-click keeps the same anchor', () => {
    const s = clickSelect(order, one('b'), 'd', { range: true })
    expect(s.ids).toEqual(['b', 'c', 'd'])
    expect(s.anchor).toBe('b')
    expect(clickSelect(order, s, 'a', { range: true }).ids).toEqual(['a', 'b'])
  })
  it('Ctrl/⌘+Shift-click adds the range to what is already selected', () => {
    const s = clickSelect(order, { ids: ['a', 'e'], cursor: 'e', anchor: 'e', mode: false }, 'c', { range: true, toggle: true })
    expect(s.ids).toEqual(['a', 'c', 'd', 'e'])
  })
  it('Shift-click with nothing selected selects just that task', () => {
    const s = clickSelect(order, EMPTY_SELECTION, 'c', { range: true })
    expect(selectedIds(s)).toEqual(['c'])
  })
})

describe('selection mode (phones)', () => {
  it('a long press starts it with that task; taps add and remove tasks, down to none', () => {
    let s = enterMode(order, EMPTY_SELECTION, 'b')
    expect(s.mode).toBe(true)
    expect(s.ids).toEqual(['b'])
    expect(isBatch(s)).toBe(true)
    s = clickSelect(order, s, 'd')
    expect(s.ids).toEqual(['b', 'd'])
    s = clickSelect(order, s, 'b')
    s = clickSelect(order, s, 'd')
    expect(s.ids).toEqual([])
    expect(s.mode).toBe(true)
    expect(selectedIds(s)).toEqual([])
  })
})

describe('keyboard', () => {
  it('↓ / ↑ move the cursor and stop at the ends', () => {
    let s = stepSelect(order, EMPTY_SELECTION, 1)
    expect(s.cursor).toBe('a')
    s = stepSelect(order, s, 1)
    expect(s.cursor).toBe('b')
    expect(stepSelect(order, one('e'), 1).cursor).toBe('e')
    expect(stepSelect(order, one('a'), -1).cursor).toBe('a')
    expect(stepSelect(order, EMPTY_SELECTION, -1).cursor).toBe('e')
  })
  it('↓ / ↑ end a multi-selection', () => {
    const s = stepSelect(order, { ids: ['a', 'b', 'c'], cursor: 'c', anchor: 'a', mode: false }, 1)
    expect(s).toEqual(one('d'))
  })
  it('Shift+↓ / ↑ grow and shrink the selection from the anchor', () => {
    let s = stepSelect(order, one('b'), 1, true)
    expect(s.ids).toEqual(['b', 'c'])
    s = stepSelect(order, s, 1, true)
    expect(s.ids).toEqual(['b', 'c', 'd'])
    s = stepSelect(order, s, -1, true)
    s = stepSelect(order, s, -1, true)
    expect(s.ids).toEqual([])
    expect(s.cursor).toBe('b')
    s = stepSelect(order, s, -1, true)
    expect(s.ids).toEqual(['a', 'b'])
  })
  it('Home / End go to the ends', () => {
    expect(stepSelect(order, one('c'), -order.length).cursor).toBe('a')
    expect(stepSelect(order, one('c'), order.length, true).ids).toEqual(['c', 'd', 'e'])
  })
  it('Ctrl/⌘+A selects every row; one row alone is not a multi-selection', () => {
    expect(selectAll(order, one('c'))).toEqual({ ids: order, cursor: 'c', anchor: 'a', mode: false })
    expect(selectAll(['a'], EMPTY_SELECTION).ids).toEqual([])
  })
  it('an empty list changes nothing', () => {
    expect(stepSelect([], one('a'), 1)).toEqual(one('a'))
  })
})

describe('after changes to the list', () => {
  it('prune drops tasks that left the list and keeps the object when nothing changed', () => {
    const s: Selection = { ids: ['a', 'c', 'e'], cursor: 'e', anchor: 'a', mode: false }
    expect(prune(order, s)).toBe(s)
    expect(prune(['a', 'b', 'c'], s).ids).toEqual(['a', 'c'])
    expect(prune(['a', 'b'], s).ids).toEqual([])
  })
  it('after a delete the cursor goes to the next row, or the one before at the end', () => {
    expect(after(order, ['b', 'c'])).toBe('d')
    expect(after(order, ['d', 'e'])).toBe('c')
    expect(after(order, order)).toBeUndefined()
  })
})
