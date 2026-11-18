import { useEffect, useState, type ReactNode } from 'react'
import { dur, reducedMotion } from './motion'

/**
 * Horizontal slide between pages (months, weeks). When `order` grows the old page leaves to the left and
 * the new one enters from the right; reversed when it shrinks. `render` draws the page for an order, so the
 * leaving page is drawn from current state too. The leaving page is inert and only kept while it animates.
 */
export function SlideSwap({ order, render, className = '' }: { order: number; render: (order: number) => ReactNode; className?: string }) {
  const [seen, setSeen] = useState(order)
  const [out, setOut] = useState<{ id: number; order: number; dir: number } | null>(null)
  if (seen !== order) {
    setSeen(order)
    setOut(reducedMotion() ? null : { id: (out?.id ?? 0) + 1, order: seen, dir: Math.sign(order - seen) })
  }
  useEffect(() => {
    if (!out) return
    const t = window.setTimeout(() => setOut(null), dur('--dur-slow') + 40)
    return () => clearTimeout(t)
  }, [out])
  const d = out?.dir ?? 0
  return (
    <div className={'slide-swap ' + className}>
      {out && (
        <div key={'out' + out.id} className={'slide-pane slide-out ' + (d > 0 ? 'to-left' : 'to-right')} aria-hidden="true" inert>
          {render(out.order)}
        </div>
      )}
      <div key={order} className={'slide-pane' + (out ? ' slide-in ' + (d > 0 ? 'from-right' : 'from-left') : '')}>
        {render(order)}
      </div>
    </div>
  )
}

/** A number that jumps when it changes: up from below when it grows, down from above when it shrinks. */
export function NumberRoll({ value, className = '' }: { value: number; className?: string }) {
  const [st, setSt] = useState({ v: value, dir: '' })
  if (st.v !== value) setSt({ v: value, dir: value > st.v ? 'up' : 'down' })
  return (
    <span key={value} className={'num-roll ' + (st.dir ? 'roll-' + st.dir + ' ' : '') + className}>
      {value}
    </span>
  )
}
