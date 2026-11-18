import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePan } from '../gestures'
import { cancelAnimations, dur, ease, play } from '../motion'
import { usePhone } from '../viewport'
import { useFocusTrap } from '../focus'

export interface Anchor {
  x: number
  y: number
  /** Height of the anchor element, used to flip the popover above it */
  h?: number
}

export const anchorOf = (el: Element): Anchor => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.bottom + 4, h: r.height + 8 }
}

interface PopoverProps {
  anchor: Anchor
  onClose: () => void
  children: ReactNode
  className?: string
  width?: number
}

/** Inside a bottom sheet: closes the sheet with its slide-down animation, then runs `then`. */
const SheetClose = createContext<((then: () => void) => void) | null>(null)

/** Open popovers and sheets, innermost last: Esc only closes the innermost one. */
const layers: object[] = []
function useLayer() {
  const [me] = useState(() => ({}))
  useEffect(() => {
    layers.push(me)
    return () => {
      const i = layers.indexOf(me)
      if (i >= 0) layers.splice(i, 1)
    }
  }, [me])
  return useCallback(() => layers[layers.length - 1] === me, [me])
}

/**
 * Popover. On tablets and desktops it floats at the anchor (below it, flipped/shifted to stay in
 * the viewport) and scales in from the anchor point; clicking outside or Esc closes it.
 * On phones it is a bottom sheet with a mask and a grip: it slides up, and dragging it down,
 * tapping the mask or Esc closes it.
 */
export function Popover(props: PopoverProps) {
  return usePhone() ? <Sheet {...props} /> : <Floating {...props} />
}

function Floating({ anchor, onClose, children, className = '', width }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Marks presses inside the popover, including nested portal popovers, through React event bubbling
  const inside = useRef(false)
  const isTop = useLayer()
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y, origin: '0 0', ready: false })
  useFocusTrap(ref)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const place = () => {
      // layout size: getBoundingClientRect would include the scale of the entry animation
      const r = { width: el.offsetWidth, height: el.offsetHeight }
      let left = anchor.x
      let top = anchor.y
      if (left + r.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - r.width - 8)
      if (top + r.height > window.innerHeight - 8) {
        const up = anchor.y - (anchor.h ?? 0) - r.height
        top = up > 8 ? up : Math.max(8, window.innerHeight - r.height - 8)
      }
      // Scale in from the point the popover was opened from.
      const ox = Math.min(Math.max(anchor.x - left, 0), r.width)
      const oy = Math.min(Math.max(anchor.y - top, 0), r.height)
      setPos((p) => (p.ready && p.left === left && p.top === top ? p : { left, top, origin: `${Math.round(ox)}px ${Math.round(oy)}px`, ready: true }))
    }
    place()
    // Content that grows (a menu turning into an editor) is placed again so it stays in the viewport.
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [anchor.x, anchor.y, anchor.h])

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (inside.current) {
        inside.current = false
        return
      }
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTop()) {
        e.stopPropagation()
        onClose()
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0)
    document.addEventListener('keydown', key, true)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key, true)
    }
  }, [onClose, isTop])

  return createPortal(
    <div
      ref={ref}
      className={'popover ' + className}
      tabIndex={-1}
      // Transparent (not visibility:hidden) until placed, so an autoFocus field inside can take the focus.
      style={{ left: pos.left, top: pos.top, width, transformOrigin: pos.origin, opacity: pos.ready ? undefined : 0 }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={() => (inside.current = true)}
    >
      {children}
    </div>,
    document.body,
  )
}

function Sheet({ onClose, children, className = '' }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null)
  const mask = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const height = useRef(0)
  const isTop = useLayer()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useFocusTrap(panel)

  const close = useCallback((then?: () => void) => {
    const done = then ?? (() => onCloseRef.current())
    const p = panel.current
    const m = mask.current
    if (closing.current) return
    closing.current = true
    if (!p || !m) return done()
    const d = dur('--dur')
    const from = getComputedStyle(p).transform
    const fade = getComputedStyle(m).opacity
    p.style.transform = ''
    m.style.opacity = ''
    Promise.all([
      play(p, [{ transform: from === 'none' ? 'translateY(0)' : from }, { transform: 'translateY(100%)' }], d, ease('--ease-in-out')),
      play(m, [{ opacity: fade }, { opacity: 0 }], d, 'linear'),
    ]).then(done)
  }, [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTop()) {
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener('keydown', key, true)
    return () => document.removeEventListener('keydown', key, true)
  }, [close, isTop])

  // Content that does not scroll can be dragged down anywhere; scrolling content only by the grip.
  useLayoutEffect(() => {
    const b = body.current
    if (!b) return
    const check = () => (b.style.touchAction = b.scrollHeight > b.clientHeight + 1 ? '' : 'none')
    check()
    const ro = new ResizeObserver(check)
    ro.observe(b)
    if (b.firstElementChild) ro.observe(b.firstElementChild)
    return () => ro.disconnect()
  }, [])

  const springBack = () => {
    const p = panel.current
    const m = mask.current
    if (!p || !m) return
    const from = p.style.transform
    const fade = m.style.opacity
    p.style.transform = ''
    m.style.opacity = ''
    const d = dur('--dur')
    play(p, [{ transform: from || 'none' }, { transform: 'translateY(0)' }], d, ease('--ease-out')).then(() => cancelAnimations(p))
    if (fade) play(m, [{ opacity: fade }, { opacity: 1 }], d, 'linear').then(() => cancelAnimations(m))
  }

  const pan = usePan({
    axis: 'y',
    dir: 1,
    pointers: ['touch', 'pen', 'mouse'],
    filter: (e) => {
      if (closing.current) return false
      const t = e.target as Element
      if (t.closest('.sheet-grip')) return true
      return e.pointerType !== 'mouse' && body.current?.style.touchAction === 'none' && !t.closest('input, textarea, select, [data-no-sheet-drag]')
    },
    onStart: () => {
      cancelAnimations(panel.current)
      height.current = panel.current?.offsetHeight ?? 1
    },
    onMove: (d) => {
      if (panel.current) panel.current.style.transform = `translateY(${d}px)`
      if (mask.current) mask.current.style.opacity = String(Math.max(0, 1 - d / height.current))
    },
    onEnd: (d, v) => (d > Math.min(160, height.current * 0.3) || v > 0.5 ? close() : springBack()),
  })

  return createPortal(
    <SheetClose.Provider value={close}>
      <div className="sheet-layer" onContextMenu={(e) => e.preventDefault()}>
        <div ref={mask} className="sheet-mask" onClick={() => close()} />
        <div ref={panel} className={'popover sheet ' + className} role="dialog" aria-modal="true" tabIndex={-1} {...pan}>
          <div className="sheet-grip" aria-hidden="true">
            <span />
          </div>
          <div ref={body} className="sheet-body">
            {children}
          </div>
        </div>
      </div>
    </SheetClose.Provider>,
    document.body,
  )
}

export interface MenuItem {
  label?: string
  icon?: ReactNode
  danger?: boolean
  checked?: boolean
  disabled?: boolean
  divider?: boolean
  hint?: string
  onClick?: () => void
  /** Submenu */
  children?: MenuItem[]
  /** A custom row (a row of buttons, a note) shown instead of a clickable item; the menu stays open. */
  render?: ReactNode
}

/** Dropdown and context menu list */
export function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [sub, setSub] = useState<{ i: number; anchor: Anchor } | null>(null)
  const phone = usePhone()
  const sheetClose = useContext(SheetClose)
  const openSub = (i: number, el: Element) => {
    const r = el.getBoundingClientRect()
    setSub({ i, anchor: { x: r.right + 2, y: r.top - 4 } })
  }
  // The keyboard: ↑ ↓ Home End move between items, Enter or Space picks one, → opens a submenu and ← closes it
  // (Esc closes the menu, see Popover).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const menu = e.currentTarget
    // the menu's own items, also those in a row of buttons (not those of a submenu)
    const own = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')].filter((el) => el.closest('[role="menu"]') === menu)
    const cur = own.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => {
      e.preventDefault()
      e.stopPropagation()
      own[(i + own.length) % own.length]?.focus()
    }
    if (e.key === 'ArrowDown') return go(cur + 1)
    if (e.key === 'ArrowUp') return go(cur < 0 ? -1 : cur - 1)
    if (e.key === 'Home') return go(0)
    if (e.key === 'End') return go(-1)
    const item = cur >= 0 ? own[cur] : null
    if (!item) return
    if (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowRight' && item.getAttribute('aria-haspopup'))) {
      e.preventDefault()
      e.stopPropagation()
      item.click()
    }
  }
  return (
    <div className="menu" role="menu" onKeyDown={onKeyDown}>
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="menu-divider" role="separator" />
        ) : it.render ? (
          <div key={i} className="menu-custom" role="group" onMouseEnter={() => setSub(null)}>
            {it.render}
          </div>
        ) : (
          <div
            key={i}
            role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={it.checked !== undefined ? !!it.checked : undefined}
            aria-disabled={it.disabled || undefined}
            aria-haspopup={it.children ? 'menu' : undefined}
            aria-expanded={it.children ? sub?.i === i : undefined}
            tabIndex={-1}
            className={'menu-item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '')}
            onMouseEnter={(e) => {
              // phones have no hover: submenus open on tap
              if (phone) return
              if (it.children) openSub(i, e.currentTarget)
              else setSub(null)
            }}
            onClick={(e) => {
              if (it.disabled) return
              if (it.children) return openSub(i, e.currentTarget)
              it.onClick?.()
              if (sheetClose) sheetClose(onClose)
              else onClose()
            }}
          >
            <span className="menu-icon">{it.icon}</span>
            <span className="menu-label">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
            {it.checked && (
              <span className="menu-check" aria-hidden="true">
                ✓
              </span>
            )}
            {it.children && (
              <span className="menu-hint" aria-hidden="true">
                ›
              </span>
            )}
          </div>
        ),
      )}
      {sub && items[sub.i]?.children && (
        <Popover anchor={sub.anchor} onClose={() => setSub(null)}>
          {phone && <div className="sheet-title">{items[sub.i].label}</div>}
          <div
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' || phone) return
              e.preventDefault()
              e.stopPropagation()
              setSub(null)
            }}
          >
            <MenuList items={items[sub.i].children!} onClose={onClose} />
          </div>
        </Popover>
      )}
    </div>
  )
}
