/**
 * Where to open a context menu: the pointer, or, when the menu key (or Shift+F10) opened it, the element that
 * has the keyboard focus (those events carry no pointer position).
 */
export function menuPoint(e: { clientX: number; clientY: number; currentTarget: EventTarget | null }): { x: number; y: number } {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY }
  const r = (e.currentTarget as Element | null)?.getBoundingClientRect()
  return r ? { x: r.left + Math.min(24, r.width / 2), y: r.top + r.height / 2 } : { x: 0, y: 0 }
}
