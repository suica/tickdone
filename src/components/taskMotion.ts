import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { getData, getUI, setData, setUI, toggleTask, undoToast } from '../store'
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
          for (const attr of ['data-exit', 'data-motion', 'data-flip', 'data-dnd-row', 'data-dnd-card', 'data-task-id', 'id']) x.removeAttribute(attr)
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

// ---------------- moving rows with FLIP ----------------
// Elements marked `data-motion="<key>"` (task rows `t:<id>`, groups `g:<key>`, group headers `h:<key>`) are measured before a
// change and slide from where they were to where they are after it. Elements that appear fade in; elements that
// disappear leave a copy behind that slides sideways and fades while the rows below move up into its place.
// Only transform and opacity are animated; all reads happen before all writes.

type Seen = { el: HTMLElement; rect: DOMRect; host: HTMLElement | null }
const running = new WeakMap<HTMLElement, Animation>()
const motionKey = (el: HTMLElement) => el.getAttribute('data-motion')!
const visible = (r: DOMRect) => r.bottom > 0 && r.top < innerHeight && (r.width > 0 || r.height > 0)

function snapshot(): Map<string, Seen> {
  const m = new Map<string, Seen>()
  document.querySelectorAll<HTMLElement>('[data-motion]').forEach((el) => {
    if (el.closest('[inert],[data-collapsed]')) return
    m.set(motionKey(el), { el, rect: el.getBoundingClientRect(), host: el.closest<HTMLElement>('[data-motion-host]') })
  })
  return m
}

/** Lets rows move outside the clipping box of their group (or card) while they slide; groups clip so they can fold. */
function unclip(els: HTMLElement[], ms: number) {
  const boxes = new Set<HTMLElement>()
  for (const el of els)
    for (let p = el.parentElement; p && !p.hasAttribute('data-motion-host'); p = p.parentElement)
      if (p.classList.contains('group-inner') || p.classList.contains('task-children-inner') || p.classList.contains('group')) boxes.add(p)
  boxes.forEach((b) => b.classList.add('motion-unclip'))
  window.setTimeout(() => boxes.forEach((b) => b.classList.remove('motion-unclip')), ms + 50)
}

/** A row that changes groups travels above the others (and its group above the other groups). */
function lift(el: HTMLElement, a: Animation) {
  const sec = el.parentElement?.closest<HTMLElement>('.group')
  el.classList.add('motion-lift')
  sec?.classList.add('motion-lift-host')
  settle(a).then(() => {
    el.classList.remove('motion-lift')
    sec?.classList.remove('motion-lift-host')
  })
}

/** A group card that changed height: its background layer (::before) shrinks or grows from the old height. */
function resizeCard(el: HTMLElement, from: DOMRect, to: DOMRect, ms: number, ease: string, delay: number) {
  if (!to.height || Math.abs(from.height - to.height) < 0.5) return
  el.animate([{ transform: `scaleY(${from.height / to.height})` }, { transform: 'none' }], { duration: ms, easing: ease, delay, fill: 'backwards', pseudoElement: '::before' })
  el.classList.add('motion-unclip')
  window.setTimeout(() => el.classList.remove('motion-unclip'), ms + delay + 50)
}

/** A copy of a removed element, left where it was, sliding out sideways. */
function ghost(s: Seen, ms: number, ease: string) {
  const host = s.host
  if (!host?.isConnected || !visible(s.rect)) return
  const copy = s.el.cloneNode(true) as HTMLElement
  for (const x of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
    for (const attr of ['data-motion', 'data-exit', 'data-flip', 'data-dnd-row', 'data-dnd-card', 'data-task-id', 'id']) x.removeAttribute(attr)
  }
  copy.classList.add('motion-ghost')
  copy.setAttribute('aria-hidden', 'true')
  copy.setAttribute('inert', '')
  const h = host.getBoundingClientRect()
  Object.assign(copy.style, {
    position: 'absolute',
    left: s.rect.left - h.left - host.clientLeft + host.scrollLeft + 'px',
    top: s.rect.top - h.top - host.clientTop + host.scrollTop + 'px',
    width: s.rect.width + 'px',
    height: s.rect.height + 'px',
    margin: '0',
    pointerEvents: 'none',
  })
  host.appendChild(copy)
  const a = copy.animate(
    [
      { transform: 'translateX(0)', opacity: 1 },
      { transform: 'translateX(28px)', opacity: 0 },
    ],
    { duration: ms * 0.6, easing: ease, fill: 'forwards' },
  )
  settle(a).then(() => copy.remove())
}

/**
 * Runs `change` (which updates React state; it is flushed at once) and animates the rows from where they were to
 * where they end up. With reduced motion it just runs the change.
 */
export function flipChange(change: () => void) {
  const ms = dur('--dur-slow')
  if (!ms) return change()
  const before = snapshot()
  quietExits(ms)
  flushSync(change)
  const ease = easing('--ease-out')
  // write: drop the transforms of moves still running, so the new layout can be read without them
  const now = [...document.querySelectorAll<HTMLElement>('[data-motion]')].filter((el) => !el.closest('[inert],[data-collapsed]'))
  for (const el of now) running.get(el)?.cancel()
  // read
  const after = now.map((el) => ({ el, key: motionKey(el), rect: el.getBoundingClientRect() }))
  const keys = new Set(after.map((x) => x.key))
  // when a row slides out, the rows below wait a beat so the two do not cross while both are clear
  const delay = [...before.keys()].some((k) => k.startsWith('t:') && !keys.has(k)) ? ms * 0.15 : 0
  // write
  const shift = new Map<HTMLElement, [number, number] | 'new'>()
  const moved: HTMLElement[] = []
  for (const { el, key, rect } of after) {
    const parent = el.parentElement?.closest<HTMLElement>('[data-motion]')
    const ps = parent ? shift.get(parent) : undefined
    const b = before.get(key)
    if (!b && key.startsWith('g:')) {
      // a new group: its card grows in; its header and rows come in on their own
      shift.set(el, [0, 0])
      if (visible(rect)) el.animate([{ transform: 'scaleY(0.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: ms, easing: ease, fill: 'backwards', pseudoElement: '::before' })
      continue
    }
    if (!b) {
      shift.set(el, 'new')
      if (ps === 'new' || !visible(rect)) continue // it comes in with its parent
      // rows come in from the side, headers drop in
      const side = key.startsWith('t:')
      const a = el.animate([{ transform: side ? 'translateX(28px)' : 'translateY(-6px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: ms, easing: ease, delay: side ? ms * 0.25 : 0, fill: 'backwards' })
      running.set(el, a)
      moved.push(el)
      continue
    }
    const base = ps && ps !== 'new' ? ps : [0, 0]
    const dx = b.rect.left - rect.left - base[0]
    const dy = b.rect.top - rect.top - base[1]
    shift.set(el, [dx + base[0], dy + base[1]])
    if (key.startsWith('g:') && (visible(rect) || visible(b.rect))) resizeCard(el, b.rect, rect, ms, ease, delay)
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
    if (!visible(rect) && !visible(b.rect)) continue
    const a = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: ms, easing: ease, delay, fill: 'backwards' })
    running.set(el, a)
    moved.push(el)
    if (b.el !== el && key.startsWith('t:')) lift(el, a)
  }
  unclip(moved, ms)
  // rows that are gone leave a copy that slides out
  for (const [key, s] of before) {
    if (keys.has(key) || s.el.isConnected) continue
    const parent = s.el.parentElement?.closest('[data-motion]')
    if (parent && !parent.isConnected && parent !== s.el) {
      // inside a removed element that is copied as a whole
      const pk = (parent as HTMLElement).getAttribute('data-motion')
      if (pk && before.has(pk) && !keys.has(pk)) continue
    }
    ghost(s, ms, ease)
  }
}

// ---------------- completing a task ----------------
// The data changes at once (toast, sound, undo all work immediately), but the list keeps showing the task where it
// was for a moment: the checkbox fills with the priority colour, the tick strokes in, a small burst goes off and a
// line is drawn through the title. Then the row moves (FLIP) to its new place, or slides out when completed tasks
// are hidden. Un-completing (a second click, or undo) plays it backwards.
export type Linger = { snapshot: Task; phase: 'check' | 'uncheck'; before: AppData; light?: boolean }
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

/** The data as the task lists should draw it: tasks still animating their completion keep their old state. */
export function withLinger(d: AppData, l: ReadonlyMap<string, Linger>): AppData {
  if (!l.size) return d
  return { ...d, tasks: d.tasks.map((t) => l.get(t.id)?.snapshot ?? t) }
}

/** How long a row stays in place so the tick can be seen, in ms (the move after it takes --dur-slow). */
export const HOLD = { check: 400, uncheck: 260, light: 300 }

// Rows that just landed in the completed group: their checkbox fades from the priority colour to grey.
const landed = new Map<string, number>()
export const justLanded = (id: string) => (landed.get(id) ?? 0) > performance.now()

function linger(entries: [string, Linger][], hold: number) {
  const m = new Map(lingering)
  for (const [id, e] of entries) {
    clearTimeout(timers.get(id))
    m.set(id, e)
  }
  setLingering(m)
  const ids = entries.map(([id]) => id)
  const timer = window.setTimeout(() => settleLinger(ids), hold)
  for (const id of ids) timers.set(id, timer)
}

/** Ends the hold: the rows move to where the data puts them. */
function settleLinger(ids: string[]) {
  const live = ids.filter((id) => lingering.has(id) && timers.has(id))
  if (!live.length) return
  const m = new Map(lingering)
  const until = performance.now() + 1000
  for (const id of live) {
    timers.delete(id)
    if (m.get(id)?.phase === 'check') landed.set(id, until)
    m.delete(id)
  }
  flipChange(() => setLingering(m))
}

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
  linger([[id, { snapshot: t, phase, before }]], HOLD[phase])
  toggleTask(id)
}

/**
 * Completes or reopens several tasks at once (`apply` changes the data and returns whether anything changed):
 * the same feel as one checkbox, a little lighter (no burst), then the rows leave together.
 */
export function batchWithMotion(ids: string[], phase: Linger['phase'], apply: () => boolean): boolean {
  const d = getData()
  const ts = ids.map((id) => lingering.get(id)?.snapshot ?? d.tasks.find((x) => x.id === id)).filter((x): x is Task => !!x && !x.deleted)
  if (!dur() || !ts.length || ts.length > 100) return apply()
  linger(ts.map((t) => [t.id, { snapshot: t, phase, before: d, light: true }]), HOLD.light)
  const ok = apply()
  if (!ok) {
    const m = new Map(lingering)
    for (const t of ts) {
      clearTimeout(timers.get(t.id))
      timers.delete(t.id)
      m.delete(t.id)
    }
    setLingering(m)
  }
  return ok
}

/**
 * Undo from the toast. Tasks it takes back from done to open play the uncheck animation where they are, then move
 * back to their place; rows that come back from hidden slide in.
 */
export function undoWithMotion() {
  const snap = getUI().toast?.undo
  const cur = getData()
  if (!snap || !dur()) return undoToast()
  const reopen = snap.tasks.filter((t) => {
    const c = cur.tasks.find((x) => x.id === t.id)
    return t.status === 0 && !t.deleted && c && c.status !== 0
  })
  if (!reopen.length) return undoToast()
  const shown = reopen.filter((t) => document.querySelector(`[data-motion="t:${CSS.escape(t.id)}"]`))
  const light = reopen.length > 1
  const entries: [string, Linger][] = shown.map((t) => {
    const was = lingering.get(t.id)?.snapshot ?? cur.tasks.find((x) => x.id === t.id)!
    return [t.id, { snapshot: was, phase: 'uncheck', before: cur, light }]
  })
  const run = () => {
    if (entries.length) linger(entries, HOLD.uncheck)
    undoToast()
  }
  if (shown.length < reopen.length) flipChange(run)
  else run()
}
