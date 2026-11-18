import type { Task } from './types'

// Links to a single task: <app address>#task=<id>. Opening one shows the task in its list with the
// detail open. Data lives in this browser only, so a link opens the task where that data is.

const PREFIX = '#task='

/** The address that opens task `id`. */
export function taskLink(id: string, base: string = location.origin + location.pathname): string {
  return base + PREFIX + encodeURIComponent(id)
}

/** The task id in a location hash ("#task=abc"), or undefined. */
export function taskIdFromHash(hash: string): string | undefined {
  if (!hash.startsWith(PREFIX)) return undefined
  try {
    return decodeURIComponent(hash.slice(PREFIX.length)) || undefined
  } catch {
    return undefined
  }
}

/** The task list a task is shown in: trash, completed, won't do, its list or the inbox. */
export function viewOfTask(task: Task, listIds: string[]): string {
  if (task.deleted) return 'trash'
  if (task.status === 2) return 'completed'
  if (task.status === -1) return 'wontdo'
  return task.listId !== 'inbox' && listIds.includes(task.listId) ? 'list:' + task.listId : 'inbox'
}

/** Copies `text` to the clipboard; falls back to a hidden text field where the Clipboard API is missing. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(el)
    el.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      /* not allowed */
    }
    el.remove()
    return ok
  }
}
