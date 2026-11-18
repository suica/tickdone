import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { getData, setData, setUI, toggleTask } from '../store'
import type { AppData, Task } from '../types'

// Motion helpers for the task list: tokens, FLIP, row collapse/expand, the completion hold,
// and exit animations for rows that disappear. Everything is a no-op under reduced motion.

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** A duration token in ms; 0 when the user prefers reduced motion. */
export function dur(name: '--dur-fast' | '--dur' | '--dur-slow' = '--dur'): number {
  if (reducedMotion()) return 0
  const v = cssVar(name)
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return 0
  return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : n
}

/** An easing token, resolved so it can be used by the Web Animations API. */
export const easing = (name: '--ease-out' | '--ease-in-out' | '--ease-spring' = '--ease-out') => cssVar(name) || 'ease-out'

const settle = (a: Animation) => a.finished.then(
  () => undefined,
  () => undefined,
)

// ---------------- FLIP ----------------
export type Rects = Map<string, DOMRect>

/** Remember where every `[attr]` element inside root is. */
export function measure(root: ParentNode | null | undefined, attr = 'data-flip'): Rects {
  const m: Rects = new Map()
  root?.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => m.set(el.getAttribute(attr)!, el.getBoundingClientRect()))
  return m
}

/** Slide every `[attr]` element from its remembered position to where it is now. */
export function flip(root: ParentNode | null | undefined, before: Rects, attr = 'data-flip') {
  const ms = dur('--dur')
  if (!root || !ms) return
  const ease = easing('--ease-out')
  root.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
    const b = before.get(el.getAttribute(attr)!)
    if (!b || el.closest('[inert]')) return
    const a = el.getBoundingClientRect()
    if (!a.width && !a.height) return
    const dx = b.left - a.left
    const dy = b.top - a.top
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: ms, easing: ease })
  })
}

// ---------------- collapse / expand ----------------
/** Shrink an element to nothing (height + fade). The end state is held until the returned animation is cancelled. */
export function collapseEl(el: HTMLElement, ms = dur('--dur')): Animation | null {
  if (!ms || !el.isConnected) return null
  const cs = getComputedStyle(el)
  const h = el.getBoundingClientRect().height
  const overflow = el.style.overflow
  el.style.overflow = 'hidden'
  const a = el.animate(
    [
      { height: h + 'px', minHeight: '0px', opacity: 1, marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
      { height: '0px', minHeight: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' },
    ],
    { duration: ms, easing: easing('--ease-in-out'), fill: 'forwards' },
  )
  a.addEventListener('cancel', () => (el.style.overflow = overflow))
  return a
}

/** Grow an element from nothing while its first child slides down from the top ("new row slides in"). */
export function expandEl(el: HTMLElement, ms = dur('--dur')) {
  if (!ms || !el.isConnected) return
  const h = el.getBoundingClientRect().height
  if (!h) return
  const overflow = el.style.overflow
  el.style.overflow = 'hidden'
  const ease = easing('--ease-out')
  const a = el.animate([{ height: '0px', minHeight: '0px', opacity: 0 }, { height: h + 'px', minHeight: '0px', opacity: 1 }], { duration: ms, easing: ease })
  ;(el.firstElementChild as HTMLElement | null)?.animate([{ transform: 'translateY(-70%)' }, { transform: 'translateY(0)' }], { duration: ms, easing: ease })
  settle(a).then(() => (el.style.overflow = overflow))
}

// ---------------- new rows ----------------
const entering = new Map<string, number>()
/** The next row mounted for this task animates in (call right after creating the task). */
export function markEnter(id: string) {
  entering.set(id, performance.now() + 1500)
}
/** Run from a layout effect when a task row mounts. */
export function maybeEnter(id: string, el: HTMLElement | null) {
  const until = entering.get(id)
  if (until === undefined) return
  entering.delete(id)
  if (el && until > performance.now()) expandEl(el)
}

// ---------------- rows that disappear ----------------
const skip = new Map<string, number>()
let quietUntil = 0
/** Don't animate this task's row leaving for a moment (it is animated some other way). */
export function skipExit(id: string, ms = 300) {
  skip.set(id, performance.now() + ms)
}
/** Don't animate any row leaving for a moment (view switch, drop that re-renders the list). */
export function quietExits(ms = 250) {
  quietUntil = Math.max(quietUntil, performance.now() + ms)
}

/**
 * Rows removed from the element this ref is attached to (elements with `data-exit`) collapse instead of vanishing:
 * a copy of the removed element is put back where it was and shrinks away. This covers deletes and moves started
 * anywhere (menus, the detail panel, keys). `contextKey` changes (view, grouping, sorting) re-render whole sections
 * and are not animated.
 */
export function useExitAnimations(contextKey: string) {
  const key = useRef(contextKey)
  useLayoutEffect(() => {
    if (key.current !== contextKey) {
      key.current = contextKey
      quietExits()
    }
  }, [contextKey])
  return useCallback((root: HTMLElement | null) => {
    if (!root) return
    const mo = new MutationObserver((records) => {
      const now = performance.now()
      if (now < quietUntil || !dur()) return
      const gone: { el: HTMLElement; parent: Node; next: Node | null; prev: Node | null }[] = []
      for (const r of records)
        r.removedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement) || n.isConnected || !n.hasAttribute('data-exit')) return
          if ((skip.get(n.getAttribute('data-exit')!) ?? 0) > now) return
          gone.push({ el: n, parent: r.target, next: r.nextSibling, prev: r.previousSibling })
        })
      if (!gone.length || gone.length > 4) return
      for (const g of gone) {
        if (!g.parent.isConnected) continue
        const copy = g.el.cloneNode(true) as HTMLElement
        for (const x of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
          for (const attr of ['data-exit', 'data-flip', 'data-dnd-row', 'data-dnd-card', 'data-linger-node', 'data-task-id', 'id']) x.removeAttribute(attr)
        }
        copy.setAttribute('aria-hidden', 'true')
        copy.setAttribute('inert', '')
        copy.style.pointerEvents = 'none'
        const before = g.next && g.next.parentNode === g.parent ? g.next : g.prev && g.prev.parentNode === g.parent ? g.prev.nextSibling : null
        g.parent.insertBefore(copy, before)
        const a = collapseEl(copy)
        if (!a) copy.remove()
        else settle(a).then(() => copy.remove())
      }
    })
    mo.observe(root, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])
}

// ---------------- completing a task ----------------
// The data changes at once (toast, sound, undo all work immediately), but the list keeps showing the task where it
// was for a moment: the checkbox fills and ticks, the title gets struck through, then the row collapses and the task
// shows up in its new place.
export type Linger = { snapshot: Task; phase: 'check' | 'uncheck'; before: AppData }
let lingering: ReadonlyMap<string, Linger> = new Map()
const lingerSubs = new Set<() => void>()
const timers = new Map<string, number>()
function setLingering(next: ReadonlyMap<string, Linger>) {
  lingering = next
  lingerSubs.forEach((f) => f())
}
const lingerSubscribe = (f: () => void) => {
  lingerSubs.add(f)
  return () => lingerSubs.delete(f)
}
export const useLinger = () => useSyncExternalStore(lingerSubscribe, () => lingering, () => lingering)

/** The data as the task list should draw it: tasks still animating their completion keep their old state. */
export function withLinger(d: AppData, l: ReadonlyMap<string, Linger>): AppData {
  if (!l.size) return d
  return { ...d, tasks: d.tasks.map((t) => l.get(t.id)?.snapshot ?? t) }
}

const HOLD = { check: 300, uncheck: 220 }

/** Toggle a task's completion with the check / uncheck animation. */
export function toggleWithMotion(id: string) {
  const cur = lingering.get(id)
  if (cur) {
    // Clicked again while it is still animating: take the first click back.
    clearTimeout(timers.get(id))
    timers.delete(id)
    const m = new Map(lingering)
    m.delete(id)
    setLingering(m)
    setData(() => cur.before)
    setUI({ toast: undefined })
    return
  }
  const t = getData().tasks.find((x) => x.id === id)
  if (!t || t.deleted) return
  if (!dur()) return toggleTask(id)
  const before = getData()
  const phase = t.status === 0 ? 'check' : 'uncheck'
  toggleTask(id)
  setLingering(new Map(lingering).set(id, { snapshot: t, phase, before }))
  timers.set(
    id,
    window.setTimeout(() => void finishLinger(id), HOLD[phase]),
  )
}

async function finishLinger(id: string) {
  timers.delete(id)
  const entry = lingering.get(id)
  if (!entry) return
  const now = getData().tasks.find((x) => x.id === id)
  // Undone from the toast in the meantime: just stop animating.
  const undone = !now || (now.status === entry.snapshot.status && now.dueDate === entry.snapshot.dueDate)
  const anims: Animation[] = []
  if (!undone) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-linger-node="${CSS.escape(id)}"]`)) {
      // the last task of a group takes its group header with it
      const top = el.parentElement?.classList.contains('group-inner')
      const sec = top ? el.closest<HTMLElement>('[data-group]') : null
      const alone = !!sec && !sec.hasAttribute('data-keep') && sec.querySelectorAll(':scope .group-inner > .task-node').length === 1
      const a = collapseEl(alone && sec ? sec : el)
      if (a) anims.push(a)
    }
    await Promise.all(anims.map(settle))
  }
  if (!lingering.has(id)) return
  quietExits(120)
  const m = new Map(lingering)
  m.delete(id)
  flushSync(() => setLingering(m))
  anims.forEach((a) => a.cancel())
  if (!undone) document.querySelectorAll<HTMLElement>(`[data-linger-node="${CSS.escape(id)}"]`).forEach((el) => expandEl(el))
}
