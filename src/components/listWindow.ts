import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { resizing, skipExit } from './taskMotion'
import { windowParts, windowRange, type Part } from '../listWindowMath'

export type { Part }

// Windowing for long task lists: a group with many rows renders only the rows near the visible part of its
// scrolling box, with spacers standing in for the rest, so a list of thousands of tasks costs about as much as one
// of fifty. Rows that must stay in the document (the keyboard cursor, rows being dragged) are always rendered, at
// their place between the spacers. Heights of rows already seen are remembered; the others are estimated.

/** Groups with fewer rows than this render all of them (nothing to gain, and nothing changes for short lists). */
export const WINDOW_MIN = 30
/** Extra height rendered above and below the visible part, px. */
const OVERSCAN = 400
/** The height of a row not measured yet, until some have been. */
const ROW_ESTIMATE = 40

// ---------------- row heights ----------------
const heights = new Map<string, number>()
let measuredSum = 0
let measuredCount = 0
const estimate = () => (measuredCount ? measuredSum / measuredCount : ROW_ESTIMATE)
function remember(key: string, h: number) {
  const old = heights.get(key)
  if (old === h) return false
  if (old === undefined) {
    measuredSum += h
    measuredCount++
  } else measuredSum += h - old
  heights.set(key, h)
  return true
}

// ---------------- rows kept in the document ----------------
let pinned: ReadonlySet<string> = new Set()
const pinSubs = new Set<() => void>()
/** Keeps these tasks' rows rendered (a drag in progress); `[]` lets them go. */
export function pinRows(ids: string[]) {
  pinned = new Set(ids)
  pinSubs.forEach((f) => f())
}
const pinSubscribe = (f: () => void) => {
  pinSubs.add(f)
  return () => pinSubs.delete(f)
}
export const usePinnedRows = () => useSyncExternalStore(pinSubscribe, () => pinned)

/** The nearest ancestor that scrolls vertically: one marked `data-scroller`, else found from the styles. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  const marked = el.closest<HTMLElement>('[data-scroller]')
  if (marked) return marked
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return null
}

const sameRange = (a: readonly [number, number], b: readonly [number, number]) => a[0] === b[0] && a[1] === b[1]

/**
 * Windows the rows `keys` (top-level rows of one group, in order) inside the element the returned ref is put on.
 * Each rendered row must carry `data-vkey={key}` on its outermost element. `keep` are indexes always rendered.
 */
export function useListWindow(keys: readonly string[], keep: readonly number[] = []) {
  const on = keys.length >= WINDOW_MIN
  const box = useRef<HTMLElement | null>(null)
  // Nothing is rendered before the first measurement, which happens before the first paint: a group far down
  // the list renders no rows at all, and the visible ones render just what fits.
  const [range, setRange] = useState<[number, number]>([0, 0])
  const live = useRef({ keys, range, on })
  live.current = { keys, range, on }

  const sizes = () => {
    const est = estimate()
    return live.current.keys.map((k) => heights.get(k) ?? est)
  }

  const update = useCallback(() => {
    const el = box.current
    const { on, range } = live.current
    if (!el || !on) return
    const sc = scrollParent(el)
    if (!sc) return
    const sr = sc.getBoundingClientRect()
    const er = el.getBoundingClientRect()
    const next = windowRange(sizes(), sr.top - er.top - OVERSCAN, sr.bottom - er.top + OVERSCAN)
    if (sameRange(next, range)) return
    setRange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Measure the rendered rows, then check the window (both after every render: rows change height, groups move).
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !on) return
    el.querySelectorAll<HTMLElement>(':scope > [data-vkey]').forEach((row) => {
      if (resizing.has(row)) return // growing in: not its real height yet
      const h = row.offsetHeight
      if (h) remember(row.dataset.vkey!, h)
    })
    update()
  })

  // Scrolling and resizing move the window.
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !on) return
    const sc = scrollParent(el)
    if (!sc) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }
    sc.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll)
    ro.observe(sc)
    return () => {
      cancelAnimationFrame(frame)
      sc.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [on, update])

  const parts: Part[] = on ? windowParts(sizes(), range, keep) : [{ kind: 'rows', from: 0, to: keys.length }]
  // Rows that leave the window (or stop being kept) are still in the list: they must not play the exit animation
  // of a deleted row. (Idempotent, so it can run while rendering.)
  const shown = new Set<string>()
  for (const p of parts) if (p.kind === 'rows') for (let i = p.from; i < p.to; i++) shown.add(keys[i])
  const all = useRef<ReadonlySet<string>>(shown)
  const prev = all.current
  if (on) {
    const present = new Set(keys)
    for (const k of prev) if (!shown.has(k) && present.has(k)) skipExit(k, 500)
  }
  all.current = shown
  return { ref: box, parts }
}
