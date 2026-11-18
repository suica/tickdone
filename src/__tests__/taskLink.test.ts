import { describe, expect, it } from 'vitest'
import { taskIdFromHash, taskLink, viewOfTask } from '../taskLink'
import type { Task } from '../types'

const task = (p: Partial<Task>): Task => ({ id: 'a', title: 'a', content: '', listId: 'inbox', tags: [], priority: 0, status: 0, createdAt: 0, modifiedAt: 0, order: 0, subtasks: [], ...p })

describe('task links', () => {
  it('round-trips a task id through the address', () => {
    const url = taskLink('ab c/1', 'https://example.test/app/')
    expect(url).toBe('https://example.test/app/#task=ab%20c%2F1')
    expect(taskIdFromHash(new URL(url).hash)).toBe('ab c/1')
  })

  it('ignores other hashes', () => {
    expect(taskIdFromHash('')).toBeUndefined()
    expect(taskIdFromHash('#task=')).toBeUndefined()
    expect(taskIdFromHash('#list=x')).toBeUndefined()
    expect(taskIdFromHash('#task=%E0%A4%A')).toBeUndefined()
  })

  it('opens a task in the list that shows it', () => {
    expect(viewOfTask(task({ listId: 'L1' }), ['L1'])).toBe('list:L1')
    expect(viewOfTask(task({ listId: 'gone' }), ['L1'])).toBe('inbox')
    expect(viewOfTask(task({ status: 2, listId: 'L1' }), ['L1'])).toBe('completed')
    expect(viewOfTask(task({ status: -1 }), [])).toBe('wontdo')
    expect(viewOfTask(task({ deleted: true }), [])).toBe('trash')
  })
})
