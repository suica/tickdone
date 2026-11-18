import { useRef, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react'
import { isDragging } from './dnd'

export interface PanOptions {
  axis: 'x' | 'y'
  /** Direction that moves the element: 1 = right/down, -1 = left/up. */
  dir: 1 | -1
  /** Pointer types that may start the pan. Default: touch and pen. */
  pointers?: readonly string[]
  /**
   * The pan only starts if the finger begins moving within this many ms of touching down.
   * Keeps quick swipes apart from long-press drags (which wait 350 ms). Default: no limit.
   */
  maxDelay?: number
  /** Return false to ignore this pointerdown. */
  filter?: (e: RPointerEvent<HTMLElement>) => boolean
  onStart?: () => void
  /** Offset along the axis since the pan started, clamped to `dir` (>= 0 for dir 1, <= 0 for dir -1). */
  onMove: (offset: number) => void
  /** Offset and release velocity (px/ms, signed along the axis). Also called on pointercancel with velocity 0. */
  onEnd: (offset: number, velocity: number) => void
}

const SLOP = 10

/**
 * A one-axis pan for drag-to-dismiss surfaces (drawer, bottom sheet, full-screen detail).
 * Spread the returned handlers on the element; it needs a `touch-action` that leaves this
 * axis to us (e.g. `pan-y` for a horizontal pan) so touch moves arrive as pointer events.
 */
export function usePan(o: PanOptions) {
  const opts = useRef(o)
  opts.current = o
  const st = useRef<{ id: number; x: number; y: number; t: number; base: number; active: boolean; offset: number; samples: { t: number; p: number }[] } | null>(null)
  const suppressClick = useRef(false)

  const along = (e: { clientX: number; clientY: number }) => (opts.current.axis === 'x' ? e.clientX : e.clientY)
  const finish = (cancelled: boolean) => {
    const s = st.current
    st.current = null
    if (!s?.active) return
    suppressClick.current = true
    setTimeout(() => (suppressClick.current = false), 400)
    let v = 0
    if (!cancelled && s.samples.length > 1) {
      const a = s.samples[0]
      const b = s.samples[s.samples.length - 1]
      v = b.t > a.t ? (b.p - a.p) / (b.t - a.t) : 0
    }
    opts.current.onEnd(s.offset, v)
  }

  return {
    onPointerDown(e: RPointerEvent<HTMLElement>) {
      const p = opts.current
      if (!(p.pointers ?? ['touch', 'pen']).includes(e.pointerType)) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (p.filter && !p.filter(e)) return
      st.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, base: 0, active: false, offset: 0, samples: [] }
    },
    onPointerMove(e: RPointerEvent<HTMLElement>) {
      const s = st.current
      if (!s || e.pointerId !== s.id) return
      const p = opts.current
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      const a = p.axis === 'x' ? dx : dy
      const c = p.axis === 'x' ? dy : dx
      if (!s.active) {
        if (isDragging()) return void (st.current = null)
        if (Math.abs(c) > SLOP && Math.abs(c) >= Math.abs(a)) return void (st.current = null)
        if (Math.abs(a) <= SLOP || Math.abs(a) < Math.abs(c) * 1.2) return
        if (Math.sign(a) !== p.dir || (p.maxDelay != null && e.timeStamp - s.t > p.maxDelay)) return void (st.current = null)
        s.active = true
        s.base = a - p.dir * SLOP
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* pointer already gone */
        }
        p.onStart?.()
      }
      const off = a - s.base
      s.offset = p.dir === 1 ? Math.max(0, off) : Math.min(0, off)
      s.samples.push({ t: e.timeStamp, p: along(e) })
      while (s.samples.length > 2 && e.timeStamp - s.samples[0].t > 100) s.samples.shift()
      p.onMove(s.offset)
    },
    onPointerUp(e: RPointerEvent<HTMLElement>) {
      if (st.current && e.pointerId === st.current.id) finish(false)
    },
    onPointerCancel(e: RPointerEvent<HTMLElement>) {
      if (st.current && e.pointerId === st.current.id) finish(true)
    },
    onClickCapture(e: RMouseEvent<HTMLElement>) {
      if (!suppressClick.current) return
      suppressClick.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
}
