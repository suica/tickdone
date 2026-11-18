import { flushSync } from 'react-dom'
import { t } from '../i18n'
import { getData, setData, setUI, toast } from '../store'
import type { AppData, Folder, TaskList } from '../types'
import { hideLine, highlight, hitAt, pressToDrag, showLine } from './dnd'
import { flip, measure } from './taskMotion'

// Sidebar drags: reorder lists, move a list into / out of a folder, reorder folders.
// The sidebar shows folders (each with its lists) first, then the lists outside folders.

/** Lists in sidebar order with `order` renumbered, so the array order matches what the sidebar shows. */
export function normalizeLists(lists: TaskList[], folders: Folder[]): TaskList[] {
  const fs = [...folders].sort((a, b) => a.order - b.order)
  const byOrder = (a: TaskList, b: TaskList) => a.order - b.order
  const known = new Set(fs.map((f) => f.id))
  const out: TaskList[] = []
  for (const f of fs) out.push(...lists.filter((l) => l.folderId === f.id).sort(byOrder))
  out.push(...lists.filter((l) => !l.folderId || !known.has(l.folderId)).map((l) => (l.folderId ? { ...l, folderId: undefined } : l)).sort(byOrder))
  return out.map((l, i) => (l.order === i + 1 ? l : { ...l, order: i + 1 }))
}

/** Put list `id` into `folderId` (undefined = outside folders) at position `index` among that container's lists. */
export function moveList(d: AppData, id: string, folderId: string | undefined, index: number): AppData {
  const moving = d.lists.find((l) => l.id === id)
  if (!moving) return d
  const inBox = (l: TaskList) => (l.folderId ?? '') === (folderId ?? '')
  const others = d.lists.filter((l) => l.id !== id)
  const box = others.filter(inBox).sort((a, b) => a.order - b.order)
  box.splice(Math.max(0, Math.min(index, box.length)), 0, { ...moving, folderId })
  const lists = [...others.filter((l) => !inBox(l)), ...box.map((l, i) => ({ ...l, order: i - box.length }))]
  return { ...d, lists: normalizeLists(lists, d.folders) }
}

export function moveFolder(d: AppData, id: string, index: number): AppData {
  const moving = d.folders.find((f) => f.id === id)
  if (!moving) return d
  const rest = [...d.folders].filter((f) => f.id !== id).sort((a, b) => a.order - b.order)
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, moving)
  const folders = rest.map((f, i) => ({ ...f, order: i + 1 }))
  return { ...d, folders, lists: normalizeLists(d.lists, folders) }
}

interface Row {
  el: HTMLElement
  id: string
  folder: string
  rect: DOMRect
}

const rowsOf = (side: HTMLElement, sel: string, exclude: HTMLElement): Row[] =>
  [...side.querySelectorAll<HTMLElement>(sel)]
    .filter((el) => !exclude.contains(el) && !el.closest('[data-collapsed],[inert]'))
    .map((el) => ({ el, id: el.dataset.sideList ?? el.dataset.sideFolder!, folder: el.dataset.folder ?? '', rect: el.getBoundingClientRect() }))

function commit(side: HTMLElement, change: (d: AppData) => AppData, text: string) {
  const snap = getData()
  const before = measure(side)
  flushSync(() => setData(change))
  flip(side, before)
  toast(text, snap)
}

/** Drag a list: reorder, drop on a folder to move it in, drop among the lists outside folders to move it out. */
export function startListItemDrag(e: React.PointerEvent<HTMLElement>, listId: string, onLongPress: (x: number, y: number) => void) {
  const item = e.currentTarget
  pressToDrag(e, () => {
    const side = item.closest<HTMLElement>('.sidebar')
    const region = item.closest<HTMLElement>('[data-side-lists]')
    if (!side || !region) return null
    const origFolder = item.dataset.folder ?? ''
    type T = { kind: 'into'; folderId: string; el: HTMLElement } | { kind: 'at'; folder: string; index: number } | null
    let target: T = null
    return {
      source: item,
      onMove: (s) => {
        target = null
        hideLine()
        highlight(null)
        const el = hitAt(s.x, s.y)
        if (!el || !region.contains(el)) return
        const folderRow = el.closest<HTMLElement>('[data-side-folder]')
        if (folderRow) {
          target = { kind: 'into', folderId: folderRow.dataset.sideFolder!, el: folderRow }
          return highlight(folderRow)
        }
        const rows = rowsOf(region, '[data-side-list]', item)
        if (!rows.length) return
        let i = rows.findIndex((r) => s.y < r.rect.top + r.rect.height / 2)
        if (i < 0) i = rows.length
        const prev = rows[i - 1]
        const next = rows[i]
        let folder: string
        if (prev && next && prev.folder !== next.folder) folder = s.y <= (prev.rect.bottom + next.rect.top) / 2 ? prev.folder : next.folder
        else if (prev && !next && prev.folder && s.y > prev.rect.bottom + 6) folder = ''
        else folder = (next ?? prev)!.folder
        const box = rows.filter((r) => r.folder === folder)
        const index = next && next.folder === folder ? box.indexOf(next) : prev && prev.folder === folder ? box.indexOf(prev) + 1 : box.length
        const ref = box[index - 1] ?? box[index] ?? prev ?? next!
        const y = box[index - 1] && box[index] ? (box[index - 1].rect.bottom + box[index].rect.top) / 2 : box[index - 1] ? box[index - 1].rect.bottom : box[index] ? box[index].rect.top : ref.rect.bottom
        const indent = folder ? 30 : 10
        const r = region.getBoundingClientRect()
        target = { kind: 'at', folder, index }
        showLine(r.left + indent, y, r.width - indent - 10)
      },
      onDrop: () => {
        const tg = target as T
        if (!tg) return false
        const d = getData()
        const l = d.lists.find((x) => x.id === listId)
        if (!l) return false
        if (tg.kind === 'into') {
          if (l.folderId === tg.folderId) return false
          const f = d.folders.find((x) => x.id === tg.folderId)
          const count = d.lists.filter((x) => x.folderId === tg.folderId).length
          commit(side, (dd) => moveList(dd, listId, tg.folderId, count), t('tasks.dnd.intoFolder', { name: f?.name ?? t('tasks.dnd.folder') }))
          return true
        }
        const folderId = tg.folder || undefined
        // tg.index counts the container's lists without the dragged one, so its old index means "same place"
        const box = normalizeLists(d.lists, d.folders).filter((x) => (x.folderId ?? '') === tg.folder)
        if (tg.folder === origFolder && box.findIndex((x) => x.id === listId) === tg.index) return false
        const text =
          tg.folder === origFolder
            ? t('tasks.dnd.listsReordered')
            : folderId
              ? t('tasks.dnd.intoFolder', { name: d.folders.find((f) => f.id === folderId)?.name ?? t('tasks.dnd.folder') })
              : t('tasks.dnd.outOfFolder')
        commit(side, (dd) => moveList(dd, listId, folderId, tg.index), text)
        return true
      },
      onLongPress,
    }
  })
}

/** Drag a folder to reorder folders. */
export function startFolderDrag(e: React.PointerEvent<HTMLElement>, folderId: string) {
  const item = e.currentTarget
  pressToDrag(e, () => {
    const side = item.closest<HTMLElement>('.sidebar')
    const region = item.closest<HTMLElement>('[data-side-lists]')
    const block = item.closest<HTMLElement>('[data-folder-block]') ?? item
    if (!side || !region) return null
    let index = -1
    return {
      source: block,
      ghostOf: item,
      onMove: (s) => {
        index = -1
        hideLine()
        const r = region.getBoundingClientRect()
        if (s.x < r.left || s.x > r.right || s.y < r.top - 20 || s.y > r.bottom + 20) return
        const blocks = [...region.querySelectorAll<HTMLElement>('[data-folder-block]')].filter((b) => b !== block).map((b) => b.getBoundingClientRect())
        if (!blocks.length) return
        const i = blocks.findIndex((b) => s.y < b.top + Math.min(b.height, 72) / 2)
        index = i < 0 ? blocks.length : i
        const y = index < blocks.length ? blocks[index].top : blocks[blocks.length - 1].bottom
        showLine(r.left + 10, y, r.width - 20)
      },
      onDrop: () => {
        if (index < 0) return false
        const d = getData()
        const order = [...d.folders].sort((a, b) => a.order - b.order).map((f) => f.id)
        const without = order.filter((x) => x !== folderId)
        const next = [...without]
        next.splice(index, 0, folderId)
        if (next.every((x, i) => x === order[i])) return false
        commit(side, (dd) => moveFolder(dd, folderId, index), t('tasks.dnd.foldersReordered'))
        return true
      },
      onLongPress: () => setUI({ dialog: { kind: 'folder', id: folderId } }),
    }
  })
}
