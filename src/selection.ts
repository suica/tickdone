// The selection in a task list, as pure functions over the order of the visible rows.
//
// `cursor` is the row the keyboard is on; it is also the task the detail shows while only one task is selected.
// `ids` holds the selected tasks once there are two or more (empty otherwise), or any number while selection
// mode is on (phones, or "Select" in the list menu). `anchor` is where Shift ranges start.

export interface Selection {
  ids: string[]
  cursor?: string
  anchor?: string
  mode: boolean
}

export const EMPTY_SELECTION: Selection = { ids: [], mode: false }

/** The selected tasks: the multi-selection, or the single task under the cursor. */
export function selectedIds(s: Selection): string[] {
  if (s.ids.length || s.mode) return s.ids
  return s.cursor ? [s.cursor] : []
}

/** Several tasks are selected, or selection mode is on: the batch actions apply. */
export const isBatch = (s: Selection) => s.mode || s.ids.length >= 2

/** `ids` in the order of `order`; ids that are not in it go last. */
export function inOrder(order: string[], ids: Iterable<string>): string[] {
  const at = new Map(order.map((id, i) => [id, i]))
  return [...new Set(ids)].sort((a, b) => (at.get(a) ?? Infinity) - (at.get(b) ?? Infinity))
}

/** The rows from `a` to `b`, both included, in list order. */
export function range(order: string[], a: string, b: string): string[] {
  const i = order.indexOf(a)
  const j = order.indexOf(b)
  if (j < 0) return []
  if (i < 0) return [b]
  return order.slice(Math.min(i, j), Math.max(i, j) + 1)
}

/** Outside selection mode, a selection of one is not a multi-selection: it is the cursor alone. */
function settle(s: Selection): Selection {
  if (!s.mode && s.ids.length < 2) return { ...s, ids: [] }
  return s
}

export interface ClickMods {
  /** Ctrl / ⌘: add or remove one task */
  toggle?: boolean
  /** Shift: select from the anchor to here */
  range?: boolean
}

/** A click (or tap) on the row `id`. */
export function clickSelect(order: string[], s: Selection, id: string, mods: ClickMods = {}): Selection {
  const current = selectedIds(s)
  if (mods.range) {
    const anchor = s.anchor ?? s.cursor ?? id
    const span = range(order, anchor, id)
    const ids = mods.toggle ? inOrder(order, [...current, ...span]) : span
    return settle({ ...s, ids, cursor: id, anchor })
  }
  if (mods.toggle || s.mode) {
    const on = current.includes(id)
    const ids = on ? current.filter((x) => x !== id) : inOrder(order, [...current, id])
    const cursor = on ? (s.mode ? s.cursor : ids[ids.length - 1]) : id
    return settle({ ...s, ids, cursor, anchor: id })
  }
  return { ids: [], cursor: id, anchor: id, mode: false }
}

/** ↑ / ↓ (delta -1 / +1): move the cursor; with Shift (`extend`) the selection grows or shrinks from the anchor. */
export function stepSelect(order: string[], s: Selection, delta: number, extend = false): Selection {
  if (!order.length) return s
  const i = s.cursor ? order.indexOf(s.cursor) : -1
  const next = i < 0 ? order[delta > 0 ? 0 : order.length - 1] : order[Math.min(order.length - 1, Math.max(0, i + delta))]
  if (extend) {
    const anchor = s.anchor ?? s.cursor ?? next
    return settle({ ...s, ids: range(order, anchor, next), cursor: next, anchor })
  }
  if (s.mode) return { ...s, cursor: next }
  return { ids: [], cursor: next, anchor: next, mode: false }
}

/** Ctrl / ⌘ + A: every visible row. */
export function selectAll(order: string[], s: Selection): Selection {
  return settle({ ...s, ids: [...order], cursor: s.cursor && order.includes(s.cursor) ? s.cursor : order[0], anchor: order[0] })
}

/** Turns selection mode on, starting with `id` selected (long press on a phone, or "Select" in the list menu). */
export function enterMode(order: string[], s: Selection, id?: string): Selection {
  const ids = id ? inOrder(order, [...s.ids, id]) : s.ids
  return { ids, cursor: id ?? s.cursor, anchor: id ?? s.anchor, mode: true }
}

/** Drops tasks that are no longer in the list (deleted, moved away). */
export function prune(order: string[], s: Selection): Selection {
  const keep = new Set(order)
  const ids = s.ids.filter((x) => keep.has(x))
  if (ids.length === s.ids.length) return s
  return settle({ ...s, ids })
}

/** The row to move the cursor to after the rows in `gone` leave the list: the next one, else the one before. */
export function after(order: string[], gone: string[]): string | undefined {
  const out = new Set(gone)
  const last = Math.max(-1, ...gone.map((id) => order.indexOf(id)))
  return order.slice(last + 1).find((id) => !out.has(id)) ?? [...order.slice(0, last + 1)].reverse().find((id) => !out.has(id))
}
