import { useEffect, type RefObject } from 'react'
import { dur, easing, stripIds } from './calMotion'

// Pointer-event drag shared by the calendar and the matrix (mouse, pen and touch).
// Mouse/pen: the drag starts once the pointer has moved 4px. Touch: it starts after a 350ms press;
// moving more than 8px before that is a scroll and nothing is dragged. While dragging, a lifted copy of
// the source follows the pointer, a scroll container under the pointer scrolls when the pointer is within
// 48px of its edge, and Esc cancels (the copy flies back). The click that ends a drag is swallowed so it
// does not also select or create anything.

export interface DragCtx {
  /** Pointer position (client coordinates). */
  x: number
  y: number
  touch: boolean
  source: HTMLElement
  /** Topmost element under the pointer; the floating copy never counts. */
  hit: Element | null
  /** Box of the floating copy when the drop happened. */
  ghostRect?: DOMRect
  /** The floating copy, while there is one (a target may hide it where it draws its own preview). */
  ghost?: HTMLElement
}

export interface DragOptions {
  source: HTMLElement
  /** Float a lifted copy of `source` under the pointer (default true). */
  ghost?: boolean
  onStart?: (c: DragCtx) => void
  onMove?: (c: DragCtx) => void
  /** Return true when the drop changed something; otherwise the copy flies back to the source. */
  onDrop?: (c: DragCtx) => boolean | void
  onCancel?: (c: DragCtx) => void
  /** Always runs last, after a drop or a cancel. */
  onEnd?: (c: DragCtx) => void
}

const MOUSE_SLOP = 4
const TOUCH_SLOP = 8
const LONG_PRESS = 350
const EDGE = 48
const MAX_SPEED = 18

let active: { started: boolean } | null = null
/** True while a drag is in progress (after its start threshold). */
export const dragging = () => !!active?.started

/** Call from a pointerdown handler. Does nothing for secondary buttons or while another drag runs. */
export function beginDrag(ev: PointerEvent, o: DragOptions) {
  if (active) return
  if (ev.pointerType !== 'touch' && ev.button !== 0) return
  const touch = ev.pointerType === 'touch'
  const pid = ev.pointerId
  const sx = ev.clientX
  const sy = ev.clientY
  const c: DragCtx = { x: sx, y: sy, touch, source: o.source, hit: null }
  const session = { started: false }
  active = session
  let ghost: HTMLElement | null = null
  let timer = 0
  let raf = 0
  let dirty = false
  /** Vertical direction of the last pointer move: edges only scroll the way the pointer is heading. */
  let heading = 0

  const hitTest = () => {
    c.hit = document.elementFromPoint(c.x, c.y)
  }
  const place = () => {
    if (ghost) ghost.style.translate = `${c.x - sx}px ${c.y - sy}px`
  }

  function start() {
    if (session.started || active !== session) return
    session.started = true
    clearTimeout(timer)
    if (touch) {
      navigator.vibrate?.(10)
      const ae = document.activeElement as HTMLElement | null
      if (ae && o.source.contains(ae)) ae.blur()
    }
    window.getSelection()?.removeAllRanges()
    if (o.ghost !== false) ghost = c.ghost = makeGhost(o.source)
    document.documentElement.classList.add('cal-dragging')
    hitTest()
    o.onStart?.(c)
    raf = requestAnimationFrame(frame)
  }

  function frame() {
    raf = requestAnimationFrame(frame)
    const scrolled = autoScroll(c, heading)
    if (!dirty && !scrolled) return
    dirty = false
    place()
    hitTest()
    o.onMove?.(c)
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pid) return
    if (e.clientY !== c.y) heading = Math.sign(e.clientY - c.y)
    c.x = e.clientX
    c.y = e.clientY
    if (session.started) {
      dirty = true
      return
    }
    const d = Math.hypot(c.x - sx, c.y - sy)
    if (touch) {
      if (d > TOUCH_SLOP) stop()
    } else if (d >= MOUSE_SLOP) start()
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== pid) return
    if (!session.started) return stop()
    c.x = e.clientX
    c.y = e.clientY
    place()
    hitTest()
    o.onMove?.(c)
    c.ghostRect = ghost?.getBoundingClientRect()
    let changed = false
    try {
      changed = !!o.onDrop?.(c)
    } finally {
      if (changed) ghost?.remove()
      else flyBack(ghost, o.source)
      swallowClick()
      stop()
      o.onEnd?.(c)
    }
  }

  function cancel() {
    o.onCancel?.(c)
    flyBack(ghost, o.source)
    if (!touch) swallowClickAfterRelease(pid)
    stop()
    o.onEnd?.(c)
  }

  function onPointerCancel(e: PointerEvent) {
    if (e.pointerId !== pid) return
    if (session.started) cancel()
    else stop()
  }
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !session.started) return
    e.preventDefault()
    e.stopPropagation()
    cancel()
  }
  function onBlur() {
    if (session.started) cancel()
    else stop()
  }
  // A long press on touch would otherwise open the context menu or select text.
  function onContextMenu(e: Event) {
    if (!touch) return
    e.preventDefault()
    e.stopPropagation()
  }
  function onSelectStart(e: Event) {
    if (session.started) e.preventDefault()
  }

  function stop() {
    clearTimeout(timer)
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', onPointerCancel, true)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('contextmenu', onContextMenu, true)
    window.removeEventListener('selectstart', onSelectStart, true)
    document.documentElement.classList.remove('cal-dragging')
    session.started = false
    if (active === session) active = null
  }

  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', onPointerCancel, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('blur', onBlur)
  window.addEventListener('contextmenu', onContextMenu, true)
  window.addEventListener('selectstart', onSelectStart, true)
  if (touch) timer = window.setTimeout(start, LONG_PRESS)
}

/**
 * Touch drags need a non-passive touchmove listener that exists before the finger lands, so that the
 * browser lets us stop the page from scrolling once a long press has turned into a drag.
 */
export function useTouchGuard(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = (e: TouchEvent) => {
      if (active?.started && e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchmove', h, { passive: false })
    return () => el.removeEventListener('touchmove', h)
  }, [ref])
}

function makeGhost(src: HTMLElement) {
  const r = src.getBoundingClientRect()
  const g = document.createElement('div')
  g.className = 'cal-ghost'
  g.setAttribute('aria-hidden', 'true')
  Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
  const copy = src.cloneNode(true) as HTMLElement
  stripIds(copy)
  copy.classList.add('cal-ghost-body')
  g.appendChild(copy)
  document.body.appendChild(g)
  requestAnimationFrame(() => g.classList.add('lifted'))
  return g
}

function flyBack(ghost: HTMLElement | null, source: HTMLElement) {
  if (!ghost) return
  const d = dur('--dur')
  if (!d || !source.isConnected) return ghost.remove()
  const r = source.getBoundingClientRect()
  const to = `${r.left - parseFloat(ghost.style.left)}px ${r.top - parseFloat(ghost.style.top)}px`
  ghost
    .animate([{ translate: ghost.style.translate || '0px 0px', scale: '1.02' }, { translate: to, scale: '1' }], {
      duration: d,
      easing: easing('--ease-out'),
      fill: 'forwards',
    })
    .finished.then(
      () => ghost.remove(),
      () => ghost.remove(),
    )
}

function swallowClick() {
  const h = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('click', h, true)
  setTimeout(() => window.removeEventListener('click', h, true), 0)
}

function swallowClickAfterRelease(pid: number) {
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pid) return
    window.removeEventListener('pointerup', up, true)
    swallowClick()
  }
  window.addEventListener('pointerup', up, true)
}

function scrollerAt(el: Element | null): HTMLElement | null {
  for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1) {
      const oy = getComputedStyle(n).overflowY
      if (oy === 'auto' || oy === 'scroll') return n
    }
  }
  return null
}

function autoScroll(c: DragCtx, heading: number): boolean {
  const sc = scrollerAt(c.hit)
  if (!sc) return false
  const r = sc.getBoundingClientRect()
  let v = 0
  if (c.y < r.top + EDGE && heading <= 0) v = -((r.top + EDGE - c.y) / EDGE) * MAX_SPEED
  else if (c.y > r.bottom - EDGE && heading >= 0) v = ((c.y - (r.bottom - EDGE)) / EDGE) * MAX_SPEED
  if (!v) return false
  const before = sc.scrollTop
  sc.scrollTop = before + (Math.round(v) || Math.sign(v))
  return sc.scrollTop !== before
}
