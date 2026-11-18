import { describe, expect, it } from 'vitest'
import { buildTree, countTree, descendantIds, project } from '../components/taskTree'
import type { Task } from '../types'

const t = (id: string, parentId?: string): Task => ({ id, title: id, content: '', listId: 'inbox', tags: [], priority: 0, status: 0, createdAt: 0, modifiedAt: 0, order: 0, subtasks: [], parentId })

describe('buildTree', () => {
  it('nests shown children under their parent and keeps the order', () => {
    const tree = buildTree([t('a'), t('b', 'a'), t('c'), t('d', 'b'), t('e', 'a')])
    expect(tree.roots.map((x) => x.id)).toEqual(['a', 'c'])
    expect(tree.children.get('a')!.map((x) => x.id)).toEqual(['b', 'e'])
    expect(tree.children.get('b')!.map((x) => x.id)).toEqual(['d'])
    expect(countTree(tree.roots, tree.children)).toBe(5)
  })
  it('shows a task at the top level when its parent is not in the view', () => {
    expect(buildTree([t('b', 'missing')]).roots.map((x) => x.id)).toEqual(['b'])
  })
  it('breaks parent loops instead of hiding the tasks', () => {
    const tree = buildTree([t('a', 'b'), t('b', 'a')])
    expect(countTree(tree.roots, tree.children)).toBe(2)
    expect(tree.roots.map((x) => x.id)).toEqual(['a'])
  })
})

describe('descendantIds', () => {
  it('follows parentId to any depth', () => {
    expect(descendantIds('a', [t('a'), t('b', 'a'), t('c', 'b'), t('d')]).sort()).toEqual(['b', 'c'])
  })
})

describe('project (where a dragged row lands)', () => {
  const rows = [
    { id: 'a', depth: 0 },
    { id: 'b', depth: 1 },
    { id: 'c', depth: 0 },
  ]
  it('keeps the level and orders against the next sibling', () => {
    expect(project(rows, 2, 0, 0)).toEqual({ depth: 0, parentId: undefined, anchor: { id: 'c', after: false } })
  })
  it('dragging right makes it a subtask of the row above', () => {
    expect(project(rows, 3, 0, 1)).toEqual({ depth: 1, parentId: 'c', anchor: undefined })
  })
  it('between a parent and its first child it becomes a sibling of that child', () => {
    expect(project(rows, 1, 0, 0)).toEqual({ depth: 1, parentId: 'a', anchor: { id: 'b', after: false } })
  })
  it('dragging left after a subtree leaves the subtree', () => {
    expect(project(rows, 2, 1, -1)).toEqual({ depth: 0, parentId: undefined, anchor: { id: 'c', after: false } })
    expect(project(rows, 2, 1, 0)).toEqual({ depth: 1, parentId: 'a', anchor: { id: 'b', after: true } })
  })
  it('never nests deeper than one level below the row above', () => {
    expect(project([{ id: 'a', depth: 0 }], 1, 3, 1).depth).toBe(1)
  })
})
