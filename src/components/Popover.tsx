import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface Anchor {
  x: number
  y: number
  /** 锚点元素的高度，用于向上翻转 */
  h?: number
}

export const anchorOf = (el: Element): Anchor => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.bottom + 4, h: r.height + 8 }
}

/** 浮层：fixed 定位在锚点下方，超出视口时自动翻转/平移；点外部或 Esc 关闭 */
export function Popover({ anchor, onClose, children, className = '', width }: { anchor: Anchor; onClose: () => void; children: ReactNode; className?: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  // 通过 React 事件冒泡（含 portal 子浮层）标记“点在浮层内”
  const inside = useRef(false)
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y, ready: false })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let left = anchor.x
    let top = anchor.y
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - r.width - 8)
    if (top + r.height > window.innerHeight - 8) {
      const up = anchor.y - (anchor.h ?? 0) - r.height
      top = up > 8 ? up : Math.max(8, window.innerHeight - r.height - 8)
    }
    setPos({ left, top, ready: true })
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
      if (e.key === 'Escape') {
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
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className={'popover ' + className}
      style={{ left: pos.left, top: pos.top, width, visibility: pos.ready ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={() => (inside.current = true)}
    >
      {children}
    </div>,
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
  /** 子菜单 */
  children?: MenuItem[]
}

/** 通用下拉/右键菜单 */
export function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [sub, setSub] = useState<{ i: number; anchor: Anchor } | null>(null)
  return (
    <div className="menu">
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="menu-divider" />
        ) : (
          <div
            key={i}
            className={'menu-item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '')}
            onMouseEnter={(e) => {
              if (it.children) {
                const r = e.currentTarget.getBoundingClientRect()
                setSub({ i, anchor: { x: r.right + 2, y: r.top - 4 } })
              } else setSub(null)
            }}
            onClick={() => {
              if (it.disabled || it.children) return
              it.onClick?.()
              onClose()
            }}
          >
            <span className="menu-icon">{it.icon}</span>
            <span className="menu-label">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
            {it.checked && <span className="menu-check">✓</span>}
            {it.children && <span className="menu-hint">›</span>}
          </div>
        ),
      )}
      {sub && items[sub.i]?.children && (
        <Popover anchor={sub.anchor} onClose={() => setSub(null)}>
          <MenuList items={items[sub.i].children!} onClose={onClose} />
        </Popover>
      )}
    </div>
  )
}
