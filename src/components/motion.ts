import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import './motion.css'

/**
 * Motion helpers. Durations and easings come from the tokens in index.css (they are 0 under
 * prefers-reduced-motion); JS animations check reducedMotion() first and are skipped entirely.
 */

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export type DurToken = '--dur-fast' | '--dur' | '--dur-slow'

/** A duration token in milliseconds. */
export function dur(name: DurToken): number {
  if (typeof document === 'undefined') return 0
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return 0
  return v.endsWith('ms') ? n : n * 1000
}

export function ease(name: '--ease-out' | '--ease-in-out' | '--ease-spring'): string {
  if (typeof document === 'undefined') return 'ease-out'
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'ease-out'
}

/** Press in, then spring back past the rest size (habit check-in). */
export function bounce(el: Element, strength = 1) {
  const d = dur('--dur-slow')
  if (reducedMotion() || !d) return
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: `scale(${1 - 0.16 * strength})`, offset: 0.28 },
      { transform: `scale(${1 + 0.12 * strength})`, offset: 0.62 },
      { transform: 'scale(1)' },
    ],
    { duration: d * 1.5, easing: 'ease-out' },
  )
}

/** A small shrink and back (undoing a check-in). */
export function shrink(el: Element) {
  const d = dur('--dur-slow')
  if (reducedMotion() || !d) return
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.86)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: d, easing: ease('--ease-in-out') })
}

/**
 * Particle burst: dots fly out radially from the element's center and fade out.
 * The layer is fixed on <body>, so scroll containers neither clip it nor grow a scrollbar for it.
 */
export function burst(el: Element, colors: string | string[], opts: { count?: number; from?: number; to?: number; size?: number; duration?: number } = {}) {
  const base = dur('--dur-slow')
  if (reducedMotion() || !base) return
  const { count = 8, from = 10, to = 24, size = 5, duration = base * 1.7 } = opts
  const r = el.getBoundingClientRect()
  const layer = document.createElement('div')
  layer.className = 'fx-burst'
  layer.setAttribute('aria-hidden', 'true')
  layer.style.left = r.left + r.width / 2 + 'px'
  layer.style.top = r.top + r.height / 2 + 'px'
  const list = Array.isArray(colors) ? colors : [colors]
  const easing = ease('--ease-out')
  const anims: Animation[] = []
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i')
    const s = size * (0.75 + Math.random() * 0.5)
    p.style.width = p.style.height = s + 'px'
    p.style.margin = -s / 2 + 'px'
    p.style.background = list[i % list.length]
    layer.appendChild(p)
    const a = (360 / count) * i + (Math.random() * 18 - 9)
    const d = to * (0.85 + Math.random() * 0.3)
    anims.push(
      p.animate(
        [
          { transform: `rotate(${a}deg) translateX(${from}px) scale(1)`, opacity: 1 },
          { transform: `rotate(${a}deg) translateX(${d}px) scale(0.25)`, opacity: 0 },
        ],
        { duration: duration * (0.85 + Math.random() * 0.3), easing, fill: 'forwards' },
      ),
    )
  }
  document.body.appendChild(layer)
  void Promise.all(anims.map((x) => x.finished.catch(() => undefined))).then(() => layer.remove())
}

/**
 * Exit animations: after value becomes empty, keeps returning the last value (with closing = true)
 * for the given duration token, so the caller can play a leave animation before unmounting.
 */
export function usePresence<T>(value: T | null | undefined, token: DurToken = '--dur'): [T | undefined, boolean] {
  const [shown, setShown] = useState<T | undefined>(value ?? undefined)
  const [closing, setClosing] = useState(false)
  if (value != null && value !== shown) {
    setShown(value)
    if (closing) setClosing(false)
  } else if (value == null && shown !== undefined && !closing) {
    setClosing(true)
  }
  useEffect(() => {
    if (!closing) return
    const t = window.setTimeout(() => {
      setShown(undefined)
      setClosing(false)
    }, dur(token))
    return () => clearTimeout(t)
  }, [closing, token])
  return [shown, closing]
}

/** Touch swipe: dir 1 = swiped left (go forward), -1 = swiped right. Give the element touch-action: pan-y. */
export function useSwipe(onSwipe: (dir: 1 | -1) => void) {
  const s = useRef<{ id: number; x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: RPointerEvent) => {
      if (e.pointerType === 'mouse') return
      s.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: RPointerEvent) => {
      const st = s.current
      s.current = null
      if (!st || st.id !== e.pointerId) return
      const dx = e.clientX - st.x
      const dy = e.clientY - st.y
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1)
    },
    onPointerCancel: () => {
      s.current = null
    },
  }
}
