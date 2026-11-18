import { useEffect, type RefObject } from 'react'

// Keyboard focus for layers that sit over the page (dialogs, popovers, sheets, the drawer): focus moves in when
// they open, Tab stays inside them, and focus goes back to where it came from when they close.

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/** The elements Tab can reach inside `root`, in order. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => !el.closest('[inert]') && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0))
}

const typing = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)

interface TrapOptions {
  /** Move focus in when it opens (default true). It stays where it is when it is already inside, or when the
   *  layer was opened while typing in a field outside it (the quick add field keeps the keyboard). */
  focusIn?: boolean
  /** Whether the trap is on (a layer that stays mounted while closed turns it off). */
  active?: boolean
}

/**
 * Traps Tab inside `ref` while it is mounted (and active), and gives focus back to the element that had it when
 * the layer opened. The first element marked `data-autofocus`, the first menu item, or the first tabbable
 * element takes the focus; the layer itself (it should have tabIndex -1) when there is none.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, { focusIn = true, active = true }: TrapOptions = {}) {
  useEffect(() => {
    const root = ref.current
    if (!root || !active) return
    const opener = document.activeElement as HTMLElement | null
    const inside = () => root.contains(document.activeElement)
    if (focusIn && !inside() && !typing(opener)) {
      // after the layer is placed and painted, so a scale-in animation does not scroll the page
      const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? tabbables(root)[0] ?? root
      target.focus({ preventScroll: true })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !inside()) return
      const els = tabbables(root)
      if (!els.length) {
        e.preventDefault()
        return
      }
      const i = els.indexOf(document.activeElement as HTMLElement)
      const next = e.shiftKey ? (i <= 0 ? els[els.length - 1] : els[i - 1]) : i < 0 || i === els.length - 1 ? els[0] : els[i + 1]
      e.preventDefault()
      next.focus()
    }
    root.addEventListener('keydown', onKey)
    return () => {
      root.removeEventListener('keydown', onKey)
      // back to the opener, unless the focus has gone somewhere on purpose in the meantime
      const now = document.activeElement
      const lost = !now || now === document.body || root.contains(now) || !now.isConnected
      if (lost && opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
