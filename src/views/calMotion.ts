// Motion helpers for the calendar and the matrix. Durations and easings come from the tokens in index.css
// (they drop to 0 under prefers-reduced-motion); every JS animation also checks the media query itself.

type DurToken = '--dur-fast' | '--dur' | '--dur-slow'
type EaseToken = '--ease-out' | '--ease-in-out' | '--ease-spring'

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Duration of a motion token in ms (0 when motion is reduced). */
export function dur(token: DurToken): number {
  if (reducedMotion()) return 0
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return 0
  return v.endsWith('ms') ? n : n * 1000
}

export function easing(token: EaseToken): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || 'ease-out'
}

/** Remove attributes that identify app objects so a visual copy is never mistaken for the real element. */
export function stripIds(root: HTMLElement) {
  const nodes = [root, ...root.querySelectorAll<HTMLElement>('*')]
  for (const n of nodes) {
    n.removeAttribute('id')
    for (const a of [...n.attributes]) if (a.name.startsWith('data-')) n.removeAttribute(a.name)
  }
  root.setAttribute('aria-hidden', 'true')
  root.inert = true
}

/** FLIP: animate `el` from the box `from` to where it sits now, optionally starting slightly lifted. */
export function flyFrom(el: Element, from: DOMRect | undefined, lift = 1, token: DurToken = '--dur') {
  const d = dur(token)
  if (!d || !from) return
  const to = el.getBoundingClientRect()
  const dx = from.left - to.left
  const dy = from.top - to.top
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && lift === 1) return
  el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${lift})` }, { transform: 'none' }], { duration: d, easing: easing('--ease-out') })
}

/** Measure the boxes of the elements carrying `attr` (keyed by its value). */
export function measure(root: ParentNode | null | undefined, attr: string): Map<string, DOMRect> {
  const m = new Map<string, DOMRect>()
  root?.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => m.set(el.getAttribute(attr)!, el.getBoundingClientRect()))
  return m
}

/** Elements that moved since `before` was measured glide from their old place to the new one. */
export function glide(root: ParentNode | null | undefined, before: Map<string, DOMRect>, attr: string, skip?: string) {
  const d = dur('--dur')
  if (!d || !root) return
  root.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
    const key = el.getAttribute(attr)!
    if (key === skip) return
    const from = before.get(key)
    if (!from) return
    const to = el.getBoundingClientRect()
    const dx = from.left - to.left
    const dy = from.top - to.top
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: d, easing: easing('--ease-out') })
  })
}

/**
 * Period change, step 1 (before React renders the new period): put still copies of the current
 * [data-slide] elements into `layer`, at the same place and with the same scroll positions.
 */
export function snapshotSlides(body: HTMLElement | null, layer: HTMLElement | null): boolean {
  if (!body || !layer || !dur('--dur-slow')) return false
  layer.replaceChildren()
  const base = layer.getBoundingClientRect()
  const els = [...body.querySelectorAll<HTMLElement>('[data-slide]')].filter((el) => !layer.contains(el))
  for (const el of els) {
    const r = el.getBoundingClientRect()
    const copy = el.cloneNode(true) as HTMLElement
    stripIds(copy)
    Object.assign(copy.style, {
      position: 'absolute',
      left: `${r.left - base.left}px`,
      top: `${r.top - base.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      margin: '0',
    })
    layer.appendChild(copy)
    const a = [el, ...el.querySelectorAll<HTMLElement>('*')]
    const b = [copy, ...copy.querySelectorAll<HTMLElement>('*')]
    a.forEach((n, i) => {
      if ((n.scrollTop || n.scrollLeft) && b[i]) {
        b[i].scrollTop = n.scrollTop
        b[i].scrollLeft = n.scrollLeft
      }
    })
  }
  return els.length > 0
}

/** Period change, step 2 (after React rendered it): the copies slide out, the new content slides in. */
export function playSlides(body: HTMLElement | null, layer: HTMLElement | null, dir: number) {
  const d = dur('--dur-slow')
  if (!body || !layer) return
  if (!d) return layer.replaceChildren()
  const e = easing('--ease-out')
  for (const copy of [...layer.children] as HTMLElement[]) {
    const w = copy.getBoundingClientRect().width
    copy
      .animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * Math.round(w * 0.3)}px)`, opacity: 0 }], { duration: d * 0.75, easing: e, fill: 'forwards' })
      .finished.then(() => copy.remove())
      .catch(() => copy.remove())
  }
  body.querySelectorAll<HTMLElement>('[data-slide]').forEach((el) => {
    if (layer.contains(el)) return
    const w = el.getBoundingClientRect().width
    el.animate([{ transform: `translateX(${dir * Math.round(w * 0.3)}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: d, easing: e })
  })
}
