import type { PointerEvent as RPointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { getData, setData, toast } from '../store'
import type { HabitSection } from '../types'
import { dur, ease, reducedMotion } from '../components/motion'
import { t, type MessageKey } from '../i18n'

/**
 * Drag-to-reorder for the habit list, with Pointer Events so mouse and touch both work.
 * - Mouse: the drag starts after the pointer moves 4px. Touch: after a 350ms press; moving 8px before that
 *   is a scroll and cancels the drag.
 * - The lifted row follows the pointer (scale 1.02 + shadow); a 2px line marks the insert position; a section
 *   header under the pointer is highlighted and dropping there moves the habit to the end of that section.
 * - Auto-scrolls within 48px of the list's top/bottom edge; Escape cancels and the row glides back.
 * - Rows opt in with data-drag-id / data-section; headers with data-drop-section.
 */

const SECTION_KEYS: Record<HabitSection, MessageKey> = {
  morning: 'misc.habit.section.morning',
  afternoon: 'misc.habit.section.afternoon',
  night: 'misc.habit.section.night',
  other: 'misc.habit.section.other',
}

/** The name of a habit section (time of day) in the current language. */
export const sectionName = (s: HabitSection) => t(SECTION_KEYS[s])

const LONG_PRESS = 350
const MOUSE_SLOP = 4
const TOUCH_SLOP = 8
const EDGE = 48
const MAX_SPEED = 14

type Target = { kind: 'row'; id: string; after: boolean; section: HabitSection } | { kind: 'section'; section: HabitSection; el: HTMLElement }

interface Gesture {
  id: string
  row: HTMLElement
  scroller: HTMLElement
  pointerId: number
  touch: boolean
  x0: number
  y0: number
  x: number
  y: number
  scroll0: number
  started: boolean
  timer?: number
  raf?: number
  target?: Target
  line?: HTMLElement
  hl?: HTMLElement
}

let g: Gesture | null = null

/** Row pointerdown handler. Presses on buttons inside the row (the check-in button) never start a drag. */
export function habitDragStart(e: RPointerEvent<HTMLElement>, id: string) {
  if (g || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
  if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return
  const row = e.currentTarget
  const scroller = row.closest<HTMLElement>('.habit-scroll')
  if (!scroller) return
  const s: Gesture = {
    id,
    row,
    scroller,
    pointerId: e.pointerId,
    touch: e.pointerType !== 'mouse',
    x0: e.clientX,
    y0: e.clientY,
    x: e.clientX,
    y: e.clientY,
    scroll0: scroller.scrollTop,
    started: false,
  }
  g = s
  if (s.touch) s.timer = window.setTimeout(() => g === s && begin(s), LONG_PRESS)
  window.addEventListener('pointermove', onMove, { passive: false })
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('contextmenu', onContextMenu, true)
}

function begin(s: Gesture) {
  s.started = true
  clearTimeout(s.timer)
  if (s.touch) navigator.vibrate?.(10)
  s.scroll0 = s.scroller.scrollTop
  window.getSelection()?.removeAllRanges()
  s.row.classList.add('lifted', 'dragging')
  document.body.classList.add('habit-dragging')
  s.line = document.createElement('div')
  s.line.className = 'habit-drop-line'
  s.hl = document.createElement('div')
  s.hl.className = 'habit-drop-hl'
  s.line.hidden = s.hl.hidden = true
  document.body.append(s.line, s.hl)
  update(s)
  const tick = () => {
    autoScroll(s)
    s.raf = requestAnimationFrame(tick)
  }
  s.raf = requestAnimationFrame(tick)
}

function update(s: Gesture) {
  const dx = s.x - s.x0
  const dy = s.y - s.y0 + (s.scroller.scrollTop - s.scroll0)
  s.row.style.transform = `translate(${dx}px, ${dy}px) scale(1.02)`
  s.target = findTarget(s)
  paint(s)
}

function findTarget(s: Gesture): Target | undefined {
  const sr = s.scroller.getBoundingClientRect()
  // Above or below the list counts as its first/last visible position
  const y = Math.min(Math.max(s.y, sr.top + 1), sr.bottom - 1)
  for (const h of s.scroller.querySelectorAll<HTMLElement>('[data-drop-section]')) {
    const r = h.getBoundingClientRect()
    if (y >= r.top && y <= r.bottom) return { kind: 'section', section: h.dataset.dropSection as HabitSection, el: h }
  }
  let best: { el: HTMLElement; r: DOMRect; d: number } | undefined
  for (const el of s.scroller.querySelectorAll<HTMLElement>('[data-drag-id]')) {
    if (el === s.row) continue
    const r = el.getBoundingClientRect()
    if (r.bottom < sr.top || r.top > sr.bottom) continue
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    if (!best || d < best.d) best = { el, r, d }
  }
  if (!best) return undefined
  return { kind: 'row', id: best.el.dataset.dragId!, after: y > best.r.top + best.r.height / 2, section: (best.el.dataset.section ?? 'other') as HabitSection }
}

function paint(s: Gesture) {
  const { line, hl, target: t } = s
  if (!line || !hl) return
  line.hidden = hl.hidden = true
  if (t?.kind === 'row') {
    const el = s.scroller.querySelector<HTMLElement>(`[data-drag-id="${CSS.escape(t.id)}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    line.hidden = false
    line.style.width = r.width - 12 + 'px'
    line.style.transform = `translate(${r.left + 6}px, ${(t.after ? r.bottom : r.top) - 1}px)`
  } else if (t?.kind === 'section') {
    const r = t.el.getBoundingClientRect()
    hl.hidden = false
    hl.style.width = r.width + 'px'
    hl.style.height = r.height + 'px'
    hl.style.transform = `translate(${r.left}px, ${r.top}px)`
  }
}

function autoScroll(s: Gesture) {
  const r = s.scroller.getBoundingClientRect()
  let v = 0
  if (s.y < r.top + EDGE) v = -MAX_SPEED * Math.min(1, (r.top + EDGE - s.y) / EDGE)
  else if (s.y > r.bottom - EDGE) v = MAX_SPEED * Math.min(1, (s.y - (r.bottom - EDGE)) / EDGE)
  if (!v) return
  const before = s.scroller.scrollTop
  s.scroller.scrollTop = before + Math.sign(v) * Math.max(1, Math.round(Math.abs(v)))
  if (s.scroller.scrollTop !== before) update(s)
}

function onMove(e: PointerEvent) {
  const s = g
  if (!s || e.pointerId !== s.pointerId) return
  s.x = e.clientX
  s.y = e.clientY
  if (!s.started) {
    const d = Math.hypot(s.x - s.x0, s.y - s.y0)
    if (s.touch) {
      if (d > TOUCH_SLOP) end(false) // moved before the long press: let the list scroll
    } else if (d > MOUSE_SLOP) begin(s)
    return
  }
  e.preventDefault()
  update(s)
}

function onUp(e: PointerEvent) {
  if (g && e.pointerId === g.pointerId) end(true)
}

function onCancel(e: PointerEvent) {
  if (g && e.pointerId === g.pointerId) end(false)
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !g) return
  if (g.started) {
    e.preventDefault()
    e.stopPropagation()
  }
  end(false)
}

/** Once the drag has started the finger moves the row, not the page. */
function onTouchMove(e: TouchEvent) {
  if (g?.started && e.cancelable) e.preventDefault()
}

/** No long-press menu or text selection callout while pressing a row. */
function onContextMenu(e: Event) {
  if (g) e.preventDefault()
}

function end(commit: boolean) {
  const s = g
  if (!s) return
  g = null
  clearTimeout(s.timer)
  if (s.raf) cancelAnimationFrame(s.raf)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('contextmenu', onContextMenu, true)
  if (!s.started) return
  swallowClick()
  s.line?.remove()
  s.hl?.remove()
  document.body.classList.remove('habit-dragging')
  const from = s.row.getBoundingClientRect()
  if (commit && s.target) drop(s.id, s.target)
  // Glide from where the row was let go to its (new or original) slot
  const el = s.scroller.querySelector<HTMLElement>(`[data-drag-id="${CSS.escape(s.id)}"]`) ?? s.row
  for (const x of new Set([s.row, el])) {
    x.style.transform = ''
    x.classList.remove('dragging', 'lifted')
  }
  const to = el.getBoundingClientRect()
  const d = dur('--dur-slow')
  if (reducedMotion() || !d || !el.isConnected) return
  el.classList.add('lifted')
  const dx = from.left + from.width / 2 - (to.left + to.width / 2)
  const dy = from.top + from.height / 2 - (to.top + to.height / 2)
  const a = el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(1.02)` }, { transform: 'none' }], { duration: d, easing: ease('--ease-out') })
  const settle = () => el.classList.remove('lifted')
  a.onfinish = settle
  a.oncancel = settle
}

/**
 * The click the browser synthesizes from the drop's pointerup must not select the row under the pointer.
 * Any new press is a real click again, so the next pointerdown ends this.
 */
function swallowClick() {
  const stop = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
    off()
  }
  const off = () => {
    window.removeEventListener('click', stop, true)
    window.removeEventListener('pointerdown', off, true)
    clearTimeout(timer)
  }
  window.addEventListener('click', stop, true)
  window.addEventListener('pointerdown', off, true)
  const timer = window.setTimeout(off, 600)
}

/** Moves habit `id` to the target position (and section); returns false when nothing changes. */
function drop(id: string, target: Target): boolean {
  const snap = getData()
  const all = [...snap.habits].sort((a, b) => a.order - b.order)
  const moving = all.find((h) => h.id === id)
  if (!moving) return false
  const fromSection = moving.section ?? 'other'
  const section = target.section
  const rest = all.filter((h) => h.id !== id)
  let idx: number
  if (target.kind === 'row') {
    idx = rest.findIndex((h) => h.id === target.id)
    if (idx < 0) return false
    if (target.after) idx++
  } else {
    let last = -1
    rest.forEach((h, i) => {
      if (!h.archived && (h.section ?? 'other') === section) last = i
    })
    idx = last >= 0 ? last + 1 : all.indexOf(moving)
  }
  const next = [...rest]
  next.splice(idx, 0, moving)
  const reordered = next.some((h, i) => h.id !== all[i].id)
  if (!reordered && fromSection === section) return false
  const pos = new Map(next.map((h, i) => [h.id, i]))
  flushSync(() =>
    setData((d) => ({
      ...d,
      habits: d.habits.map((h) => ({ ...h, order: pos.get(h.id) ?? h.order, ...(h.id === id ? { section } : {}) })),
    })),
  )
  toast(fromSection !== section ? t('misc.habit.moved', { name: moving.name, section: sectionName(section) }) : t('misc.habit.reordered', { name: moving.name }), snap)
  return true
}
