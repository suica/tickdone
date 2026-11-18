import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { isDragging } from '../dnd'
import { dur } from './taskMotion'

// Swipe actions on task rows (touch screens, phone layout).
// - A horizontal move of more than SLOP px that starts within LONG_PRESS ms of touching down is a swipe;
//   a vertical move first is a scroll, and holding still for LONG_PRESS ms leaves the row to the long-press drag.
// - Swiping left reveals the "end" actions at the right edge, swiping right the "start" actions at the left edge.
// - Letting go past half of the buttons keeps the row open; a full swipe (past FULL of the row width)
//   runs the first action of that side, which sits at the outer edge.
// - Only one row is open at a time; a tap anywhere else closes it (and does nothing else).

/** Width of one action button, px. */
export const ACTION_W = 68
const SLOP = 10
const LONG_PRESS = 350
/** Share of the row width past which a release runs the first action. */
const FULL = 0.6

/** The side whose actions are showing: 'end' = row moved left, 'start' = row moved right. */
export type SwipeSide = 'start' | 'end'

let openRow: { id: string; close: () => void } | null = null
/** Closes the open row, if any. */
export const closeSwipedRow = () => openRow?.close()

interface Options {
  id: string
  enabled: boolean
  /** Number of actions on each side. */
  count: Record<SwipeSide, number>
  /** A full swipe to that side was released. */
  onFull: (side: SwipeSide) => void
}

export function useRowSwipe({ id, enabled, count, onFull }: Options) {
  const rowRef = useRef<HTMLDivElement>(null)
  const actsRef = useRef<HTMLDivElement>(null)
  const [side, setSide] = useState<SwipeSide | null>(null)
  const opts = useRef({ count, onFull })
  opts.current = { count, onFull }
  const x = useRef(0)
  const st = useRef<{ pid: number; x0: number; y0: number; t0: number; base: number; active: boolean; samples: { t: number; x: number }[] } | null>(null)
  const swallow = useRef(false)
  const closeTimer = useRef(0)

  const reveal = (s: SwipeSide) => opts.current.count[s] * ACTION_W
  const isFull = (v: number) => {
    const w = rowRef.current?.offsetWidth ?? 1
    const s: SwipeSide = v < 0 ? 'end' : 'start'
    return Math.abs(v) > Math.max(w * FULL, reveal(s) + 48)
  }

  const apply = (v: number, animate: boolean) => {
    const row = rowRef.current
    if (!row) return
    x.current = v
    row.classList.toggle('swipe-anim', animate)
    row.style.transform = v ? `translateX(${v}px)` : ''
    actsRef.current?.classList.toggle('full', isFull(v))
  }

  const close = (animate = true) => {
    clearTimeout(closeTimer.current)
    if (openRow?.id === id) openRow = null
    apply(0, animate)
    const ms = animate ? dur('--dur') : 0
    const done = () => {
      rowRef.current?.classList.remove('swipe-anim', 'swiping')
      if (x.current === 0) setSide(null)
    }
    if (ms) closeTimer.current = window.setTimeout(done, ms)
    else done()
  }
  const closeRef = useRef(close)
  closeRef.current = close

  const open = (s: SwipeSide) => {
    if (openRow && openRow.id !== id) openRow.close()
    openRow = { id, close: () => closeRef.current() }
    apply(s === 'end' ? -reveal(s) : reveal(s), true)
  }

  // While open: a press anywhere outside this row and its buttons closes it and swallows the tap.
  const isOpen = side !== null
  useEffect(() => {
    if (!isOpen) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (rowRef.current?.contains(t) || actsRef.current?.contains(t) || x.current === 0) return
      if ((t as Element).closest?.('.popover, .sheet-layer')) return
      closeRef.current()
      const click = (ev: MouseEvent) => {
        ev.preventDefault()
        ev.stopPropagation()
      }
      window.addEventListener('click', click, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', click, true), 500)
    }
    document.addEventListener('pointerdown', down, true)
    return () => document.removeEventListener('pointerdown', down, true)
  }, [isOpen])

  useEffect(
    () => () => {
      clearTimeout(closeTimer.current)
      if (openRow?.id === id) openRow = null
    },
    [id],
  )

  const handlers = {
    onPointerDown(e: RPointerEvent<HTMLElement>) {
      if (!enabled || e.pointerType === 'mouse') return
      st.current = { pid: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, base: x.current, active: false, samples: [] }
    },
    onPointerMove(e: RPointerEvent<HTMLElement>) {
      const s = st.current
      if (!s || e.pointerId !== s.pid) return
      const dx = e.clientX - s.x0
      const dy = e.clientY - s.y0
      if (!s.active) {
        if (isDragging()) return void (st.current = null)
        if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) return void (st.current = null)
        if (Math.abs(dx) <= SLOP || Math.abs(dx) < Math.abs(dy) * 1.2) return
        if (s.base === 0 && e.timeStamp - s.t0 > LONG_PRESS) return void (st.current = null)
        s.active = true
        s.base -= Math.sign(dx) * SLOP
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* pointer already gone */
        }
        if (openRow && openRow.id !== id) openRow.close()
        rowRef.current?.classList.add('swiping')
      }
      const w = rowRef.current?.offsetWidth ?? 0
      const v = Math.max(-w, Math.min(w, s.base + dx))
      const want: SwipeSide | null = v < 0 ? 'end' : v > 0 ? 'start' : null
      if (want && want !== side) setSide(want)
      s.samples.push({ t: e.timeStamp, x: e.clientX })
      while (s.samples.length > 2 && e.timeStamp - s.samples[0].t > 100) s.samples.shift()
      apply(v, false)
    },
    onPointerUp(e: RPointerEvent<HTMLElement>) {
      const s = st.current
      if (!s || e.pointerId !== s.pid) return
      st.current = null
      if (!s.active) {
        // a tap on an open row closes it instead of opening the task
        if (x.current !== 0) {
          swallow.current = true
          close()
        }
        return
      }
      swallow.current = true
      const v = x.current
      const a = s.samples[0]
      const b = s.samples[s.samples.length - 1]
      const vel = a && b && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0
      const sd: SwipeSide = v < 0 ? 'end' : 'start'
      if (v !== 0 && isFull(v)) {
        close()
        opts.current.onFull(sd)
      } else if (v !== 0 && (Math.abs(v) > reveal(sd) / 2 || vel * Math.sign(v) > 0.4) && !(vel * Math.sign(v) < -0.3)) open(sd)
      else close()
    },
    onPointerCancel(e: RPointerEvent<HTMLElement>) {
      const s = st.current
      if (!s || e.pointerId !== s.pid) return
      st.current = null
      if (s.active) close()
    },
  }

  return {
    rowRef,
    actsRef,
    side,
    handlers,
    close,
    /** True once after a swipe or a closing tap: the click that follows should do nothing. */
    takeClick() {
      const v = swallow.current
      swallow.current = false
      return v
    },
  }
}
