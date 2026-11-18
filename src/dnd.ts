// Pointer-event drag and drop for mouse and touch, following the app-wide drag rules:
// - mouse: the drag starts once the pointer has moved 4px with the button held;
// - touch/pen: long-press 350ms (with a short vibration); moving more than 8px before that is a
//   scroll or swipe, so no drag starts;
// - while dragging, the scroll container auto-scrolls when the pointer is within 48px of its edges;
// - Esc cancels; the click that follows a finished drag is swallowed.

export interface Point {
  x: number
  y: number
}

export interface DragHandlers {
  /** The drag has started (threshold passed / long press fired). */
  onStart(p: Point): void
  /** The pointer moved, or auto-scroll moved the content under it. */
  onMove(p: Point): void
  onDrop(p: Point): void
  /** Esc, pointercancel or a lost pointer: put things back. */
  onCancel(): void
}

const MOUSE_SLOP = 4
const TOUCH_SLOP = 8
const LONG_PRESS = 350
const EDGE = 48
const MAX_SPEED = 14

let active = false
/** True while any pointer drag started through `pressToDrag` is in progress. */
export const isDragging = () => active

/**
 * Arms a drag from a pointerdown. Nothing visible happens until the drag actually starts.
 * `scroller` is the container to auto-scroll near its edges.
 */
export function pressToDrag(down: PointerEvent, h: DragHandlers, scroller?: HTMLElement | null) {
  if (active) return
  const touch = down.pointerType !== 'mouse'
  if (!touch && down.button !== 0) return
  const id = down.pointerId
  const x0 = down.clientX
  const y0 = down.clientY
  let last: Point = { x: x0, y: y0 }
  let started = false
  let timer = 0
  let raf = 0
  let xArmed = false

  const stop = () => {
    clearTimeout(timer)
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', cancel, true)
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('contextmenu', menu, true)
    window.removeEventListener('blur', cancel)
    if (started) {
      active = false
      document.body.classList.remove('dnd-active')
      swallowNextClick()
    }
  }
  const begin = () => {
    started = true
    active = true
    document.body.classList.add('dnd-active')
    window.getSelection()?.removeAllRanges()
    if (touch) navigator.vibrate?.(10)
    h.onStart(last)
    raf = requestAnimationFrame(autoScroll)
  }
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return
    last = { x: e.clientX, y: e.clientY }
    if (!started) {
      const d = Math.hypot(e.clientX - x0, e.clientY - y0)
      if (touch && d > TOUCH_SLOP) stop()
      else if (!touch && d > MOUSE_SLOP) begin()
      return
    }
    e.preventDefault()
    h.onMove(last)
  }
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return
    const was = started
    stop()
    if (was) h.onDrop({ x: e.clientX, y: e.clientY })
  }
  const cancel = (e: Event) => {
    if (e instanceof PointerEvent && e.pointerId !== id) return
    const was = started
    stop()
    if (was) h.onCancel()
  }
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !started) return
    e.preventDefault()
    e.stopPropagation()
    stop()
    h.onCancel()
  }
  // A long press would also open the context menu on touch devices.
  const menu = (e: Event) => {
    if (touch || started) e.preventDefault()
  }
  const autoScroll = () => {
    if (scroller) {
      const r = scroller.getBoundingClientRect()
      let v = 0
      if (last.y < r.top + EDGE) v = -MAX_SPEED * Math.min(1, (r.top + EDGE - last.y) / EDGE)
      else if (last.y > r.bottom - EDGE) v = MAX_SPEED * Math.min(1, (last.y - (r.bottom - EDGE)) / EDGE)
      // Sideways too, for containers that scroll horizontally (the timeline)
      let vx = 0
      // Only once the pointer has been well inside it, so a drag coming in from a panel beside it
      // does not scroll it on the way past the edge.
      if (last.x > r.left + EDGE && last.x < r.right - EDGE && last.y > r.top && last.y < r.bottom) xArmed = true
      if (xArmed && scroller.scrollWidth > scroller.clientWidth && last.x >= r.left && last.x <= r.right) {
        if (last.x < r.left + EDGE) vx = -MAX_SPEED * Math.min(1, (r.left + EDGE - last.x) / EDGE)
        else if (last.x > r.right - EDGE) vx = MAX_SPEED * Math.min(1, (last.x - (r.right - EDGE)) / EDGE)
      }
      if (v || vx) {
        const top = scroller.scrollTop
        const left = scroller.scrollLeft
        scroller.scrollTop += v
        scroller.scrollLeft += vx
        if (scroller.scrollTop !== top || scroller.scrollLeft !== left) h.onMove(last)
      }
    }
    raf = requestAnimationFrame(autoScroll)
  }

  if (touch) timer = window.setTimeout(begin, LONG_PRESS)
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', cancel, true)
  window.addEventListener('keydown', key, true)
  window.addEventListener('contextmenu', menu, true)
  window.addEventListener('blur', cancel)
}

function swallowNextClick() {
  const f = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    done()
  }
  const done = () => {
    window.removeEventListener('click', f, true)
    clearTimeout(t)
  }
  const t = setTimeout(done, 400)
  window.addEventListener('click', f, true)
}

/**
 * Keeps the page from scrolling under a touch drag. Pointer events cannot cancel scrolling, so a
 * non-passive touchmove listener has to be in place before the touch starts; it only acts while a
 * drag is active. Returns the cleanup.
 */
export function blockTouchScrollWhileDragging(el: HTMLElement | null) {
  if (!el) return
  const f = (e: TouchEvent) => {
    if (active && e.cancelable) e.preventDefault()
  }
  el.addEventListener('touchmove', f, { passive: false })
  return () => el.removeEventListener('touchmove', f)
}
