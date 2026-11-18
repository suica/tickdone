import { dur, easing } from './taskMotion'

// A small Pointer Events drag engine shared by the task list, the kanban board and the sidebar.
// Mouse / pen: the drag starts after the pointer moves 4px. Touch: it starts after a 350ms press; moving more than
// 8px before that is a scroll and cancels it. A copy of the dragged element follows the pointer (lifted: scale 1.02 +
// shadow), containers scroll when the pointer is within 48px of their edge, Esc puts everything back.
// Controllers do the hit testing in `onMove` and show the drop indicator with `showLine` / `highlight`.

export interface DragState {
  pointerType: string
  startX: number
  startY: number
  x: number
  y: number
  /** pointer movement since the press */
  dx: number
  dy: number
  /** the floating copy */
  ghost: HTMLElement
}

export type DropResult = boolean | 'fade' | void

export interface DragSpec {
  /** fades while dragging; its copy follows the pointer */
  source: HTMLElement
  /** copy this element instead of `source` */
  ghostOf?: HTMLElement
  onStart?: (s: DragState) => void
  onMove: (s: DragState) => void
  /** true: accepted (the copy disappears, the controller animates the result); 'fade': the copy fades out where it is */
  onDrop: (s: DragState) => DropResult
  /** always called when the drag ends, to clear indicators */
  onEnd?: () => void
  /** touch: pressed long and released without moving */
  onLongPress?: (x: number, y: number) => void
}

const MOUSE_SLOP = 4
const TOUCH_SLOP = 8
const LONG_PRESS = 350
const EDGE = 48
const MAX_SPEED = 16

let current: Session | null = null
export const dragging = () => !!current?.spec

// While a touch drag is on, the page must not scroll under the finger. This listener has to exist before the
// touch starts, otherwise the browser treats the whole touch sequence as non-cancelable.
if (typeof document !== 'undefined')
  document.addEventListener(
    'touchmove',
    (e) => {
      if (current?.spec && e.cancelable) e.preventDefault()
    },
    { passive: false },
  )

const swallow = (e: Event) => {
  e.preventDefault()
  e.stopPropagation()
}

/**
 * Call from onPointerDown. `spec` is asked for when the drag actually starts; return null to refuse.
 * Presses on buttons, links, the checkbox (`[data-no-drag]`) or a focused text field are ignored.
 */
export function pressToDrag(e: React.PointerEvent | PointerEvent, spec: () => DragSpec | null, opts: { pressOnly?: boolean } = {}) {
  if (current || !e.isPrimary) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('[data-no-drag], button, a, select, textarea, [contenteditable="true"]')) return
  if (target instanceof HTMLInputElement && document.activeElement === target) return
  current = new Session(e, spec, !!opts.pressOnly)
}

class Session {
  spec: DragSpec | null = null
  readonly id: number
  readonly type: string
  readonly sx: number
  readonly sy: number
  x: number
  y: number
  timer = 0
  raf = 0
  dirty = false
  moved = false
  ghost: HTMLDivElement | null = null
  scrollers: { x?: HTMLElement; y?: HTMLElement } = {}
  getSpec: () => DragSpec | null
  pressOnly: boolean

  constructor(e: React.PointerEvent | PointerEvent, getSpec: () => DragSpec | null, pressOnly: boolean) {
    this.getSpec = getSpec
    this.pressOnly = pressOnly
    this.id = e.pointerId
    this.type = e.pointerType
    this.sx = this.x = e.clientX
    this.sy = this.y = e.clientY
    window.addEventListener('pointermove', this.move, true)
    window.addEventListener('pointerup', this.up, true)
    window.addEventListener('pointercancel', this.cancel, true)
    window.addEventListener('keydown', this.key, true)
    window.addEventListener('blur', this.blur)
    if (this.touch) {
      this.timer = window.setTimeout(this.activate, LONG_PRESS)
      // the long-press menu of the browser would fire at the same time
      window.addEventListener('contextmenu', swallow, true)
    }
  }

  get touch() {
    return this.type !== 'mouse' && this.type !== 'pen'
  }

  state(): DragState {
    return { pointerType: this.type, startX: this.sx, startY: this.sy, x: this.x, y: this.y, dx: this.x - this.sx, dy: this.y - this.sy, ghost: this.ghost! }
  }

  move = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return
    // the button was released outside the window
    if (e.pointerType === 'mouse' && e.buttons === 0) return this.spec ? this.end(false) : this.dispose()
    this.x = e.clientX
    this.y = e.clientY
    const dist = Math.hypot(this.x - this.sx, this.y - this.sy)
    if (!this.spec) {
      if (this.pressOnly && this.timer === 0) return this.dispose()
      if (!this.touch) {
        if (dist >= MOUSE_SLOP && !this.pressOnly) this.activate()
      } else if (dist > TOUCH_SLOP) this.dispose()
      return
    }
    if (dist > TOUCH_SLOP) this.moved = true
    this.dirty = true
  }

  activate = () => {
    clearTimeout(this.timer)
    this.timer = 0
    if (this.pressOnly) {
      // long press only (no dragging): remember it, the menu opens on release
      this.moved = false
      navigator.vibrate?.(10)
      this.spec = { source: document.body, onMove: () => {}, onDrop: () => false, onLongPress: this.getSpec()?.onLongPress }
      this.pressOnly = true
      return
    }
    const spec = this.getSpec()
    if (!spec) return this.dispose()
    this.spec = spec
    const src = spec.ghostOf ?? spec.source
    const active = document.activeElement as HTMLElement | null
    if (active && src.contains(active)) active.blur()
    window.getSelection()?.removeAllRanges()
    document.body.classList.add('dnd-active')
    if (this.touch) navigator.vibrate?.(10)

    const r = src.getBoundingClientRect()
    const ghost = document.createElement('div')
    ghost.className = 'dnd-ghost'
    ghost.setAttribute('aria-hidden', 'true')
    ghost.setAttribute('inert', '')
    ghost.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`
    const lift = document.createElement('div')
    lift.className = 'dnd-lift'
    const copy = src.cloneNode(true) as HTMLElement
    // inputs keep their typed value only as a property
    const from = src.querySelectorAll('input')
    copy.querySelectorAll('input').forEach((x, i) => (x.value = from[i]?.value ?? x.value))
    for (const x of [copy, ...copy.querySelectorAll<HTMLElement>('*')])
      for (const attr of ['data-dnd-row', 'data-dnd-card', 'data-dnd-view', 'data-flip', 'data-flip-col', 'data-exit', 'data-linger-node', 'data-task-id', 'data-kanban-col', 'data-group', 'id'])
        x.removeAttribute(attr)
    copy.classList.add('dnd-copy')
    copy.classList.remove('selected', 'dnd-source')
    lift.appendChild(copy)
    ghost.appendChild(lift)
    document.body.appendChild(ghost)
    this.ghost = ghost
    requestAnimationFrame(() => ghost.classList.add('lifted'))
    spec.source.classList.add('dnd-source')
    spec.onStart?.(this.state())
    this.frame()
    this.raf = requestAnimationFrame(this.tick)
  }

  frame() {
    if (!this.spec || !this.ghost) return
    this.ghost.style.transform = `translate3d(${this.x - this.sx}px, ${this.y - this.sy}px, 0)`
    this.spec.onMove(this.state())
  }

  tick = () => {
    if (!this.spec) return
    const scrolled = this.autoscroll()
    if (scrolled || this.dirty) {
      this.dirty = false
      this.frame()
    }
    this.raf = requestAnimationFrame(this.tick)
  }

  autoscroll(): boolean {
    const under = document.elementFromPoint(this.x, this.y)
    let changed = false
    for (const axis of ['y', 'x'] as const) {
      const el = scrollParent(under, axis) ?? this.scrollers[axis]
      if (!el || !el.isConnected) continue
      this.scrollers[axis] = el
      const r = el.getBoundingClientRect()
      const [lo, hi, a0, a1, p] = axis === 'y' ? [r.top, r.bottom, r.left, r.right, this.y] : [r.left, r.right, r.top, r.bottom, this.x]
      const cross = axis === 'y' ? this.x : this.y
      if (cross < a0 || cross > a1) continue
      let v = 0
      if (p < lo + EDGE) v = -speed(p - lo)
      else if (p > hi - EDGE) v = speed(hi - p)
      if (!v) continue
      if (axis === 'y') {
        const before = el.scrollTop
        el.scrollTop += v
        changed ||= el.scrollTop !== before
      } else {
        const before = el.scrollLeft
        el.scrollLeft += v
        changed ||= el.scrollLeft !== before
      }
    }
    return changed
  }

  up = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return
    if (!this.spec) return this.dispose()
    if (this.pressOnly || (this.touch && !this.moved)) {
      const lp = this.spec.onLongPress
      const at = [this.x, this.y] as const
      this.end(false, true)
      lp?.(...at)
      return
    }
    this.x = e.clientX
    this.y = e.clientY
    this.frame()
    let res: DropResult = false
    try {
      res = this.spec.onDrop(this.state())
    } catch (err) {
      console.error(err)
    }
    this.end(res)
  }

  cancel = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return
    if (this.spec) this.end(false)
    else this.dispose()
  }

  key = (e: KeyboardEvent) => {
    if (!this.spec || this.pressOnly) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      this.end(false)
    }
  }

  blur = () => (this.spec ? this.end(false) : this.dispose())

  end(res: DropResult, instant = false) {
    cancelAnimationFrame(this.raf)
    const spec = this.spec!
    const ghost = this.ghost
    spec.source.classList.remove('dnd-source')
    document.body.classList.remove('dnd-active')
    hideLine()
    highlight(null)
    try {
      spec.onEnd?.()
    } catch (err) {
      console.error(err)
    }
    if (ghost) {
      const ms = dur('--dur')
      if (res === true || instant || !ms) ghost.remove()
      else if (res === 'fade') {
        const t = ghost.style.transform
        ghost.animate([{ transform: t, opacity: 1 }, { transform: t + ' scale(0.6)', opacity: 0 }], { duration: dur('--dur-fast') || 1, easing: easing('--ease-out') }).finished.then(
          () => ghost.remove(),
          () => ghost.remove(),
        )
      } else {
        // back to where it came from
        ghost.classList.remove('lifted')
        ghost
          .animate([{ transform: ghost.style.transform }, { transform: 'translate3d(0, 0, 0)' }], { duration: ms, easing: easing('--ease-out'), fill: 'forwards' })
          .finished.then(
            () => ghost.remove(),
            () => ghost.remove(),
          )
      }
      // the click that follows the release must not select or open anything
      window.addEventListener('click', swallow, true)
      setTimeout(() => window.removeEventListener('click', swallow, true), 60)
    }
    this.dispose()
  }

  dispose() {
    clearTimeout(this.timer)
    cancelAnimationFrame(this.raf)
    window.removeEventListener('pointermove', this.move, true)
    window.removeEventListener('pointerup', this.up, true)
    window.removeEventListener('pointercancel', this.cancel, true)
    window.removeEventListener('keydown', this.key, true)
    window.removeEventListener('blur', this.blur)
    if (this.touch) setTimeout(() => window.removeEventListener('contextmenu', swallow, true), 600)
    if (current === this) current = null
  }
}

const speed = (dist: number) => Math.ceil(MAX_SPEED * Math.min(1, 1 - Math.max(0, dist) / EDGE + 0.05))

function scrollParent(el: Element | null, axis: 'x' | 'y'): HTMLElement | undefined {
  for (let p = el as HTMLElement | null; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p)
    const o = axis === 'y' ? s.overflowY : s.overflowX
    if ((o === 'auto' || o === 'scroll') && (axis === 'y' ? p.scrollHeight > p.clientHeight + 1 : p.scrollWidth > p.clientWidth + 1)) return p
  }
  return undefined
}

/** The element under the pointer, ignoring the floating copy and anything inert. */
export function hitAt(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  return el && !el.closest('[inert]') ? el : null
}

// ---------------- indicators ----------------
let line: HTMLDivElement | null = null
/** The 2px insertion line, horizontal (w) or vertical (h). */
export function showLine(x: number, y: number, size: number, vertical = false) {
  if (!line) {
    line = document.createElement('div')
    line.className = 'dnd-line'
    line.setAttribute('aria-hidden', 'true')
  }
  if (!line.isConnected) document.body.appendChild(line)
  line.classList.toggle('vertical', vertical)
  line.style.transform = vertical ? `translate(${Math.round(x - 1)}px, ${Math.round(y)}px)` : `translate(${Math.round(x)}px, ${Math.round(y - 1)}px)`
  line.style.width = vertical ? '' : Math.max(0, size) + 'px'
  line.style.height = vertical ? Math.max(0, size) + 'px' : ''
}
export function hideLine() {
  line?.remove()
}

let lit: HTMLElement | null = null
/** Highlight one drop target (or none). */
export function highlight(el: HTMLElement | null) {
  if (lit === el) return
  lit?.classList.remove('dnd-over')
  lit = el
  el?.classList.add('dnd-over')
}
