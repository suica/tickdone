// Motion helpers for JS (Web Animations API) animations. Durations and easings come from the
// tokens in index.css, so JS and CSS motion stay in sync; with prefers-reduced-motion every
// duration is 0 and animations resolve immediately.

type DurToken = '--dur-fast' | '--dur' | '--dur-slow'
type EaseToken = '--ease-out' | '--ease-in-out' | '--ease-spring'

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** Duration of a motion token in ms (0 when reduced motion is on). */
export function dur(name: DurToken): number {
  if (reducedMotion()) return 0
  const v = token(name)
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return 0
  return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : n
}

export const ease = (name: EaseToken) => token(name) || 'ease'

/**
 * Runs a WAAPI animation and resolves when it has finished (or right away when the duration is 0).
 * The end state is held (`fill: forwards`); callers cancel the animation once they have committed
 * the final state elsewhere. Resolves false when the animation was cancelled.
 */
export function play(el: Element, keyframes: Keyframe[], duration: number, easing: string): Promise<boolean> {
  if (duration <= 0 || typeof el.animate !== 'function') return Promise.resolve(true)
  const a = el.animate(keyframes, { duration, easing, fill: 'forwards' })
  // A detached element's animation can stall; never wait much longer than the duration.
  const timeout = new Promise<boolean>((r) => setTimeout(() => r(true), duration + 80))
  return Promise.race([a.finished.then(() => true, () => false), timeout])
}

/** Cancels every WAAPI animation on the element (CSS animations/transitions are left alone). */
export function cancelAnimations(el: Element | null | undefined) {
  el?.getAnimations?.().forEach((a) => {
    if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) a.cancel()
  })
}
