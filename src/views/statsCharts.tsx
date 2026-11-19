// Charts for the statistics view, drawn as plain SVG. Colours come from the theme tokens, so they
// follow light and dark; bars and rings animate in with the motion tokens (none with reduced motion).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { fmtPercent } from '../i18n/format'

/** The width of an element, kept up to date as it resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * The hovered (mouse) or tapped (touch) item of a chart. A tap elsewhere on the page clears it;
 * moving the mouse out of the chart does too.
 */
function useActive(root: React.RefObject<HTMLElement | null>) {
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    if (active === null) return
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setActive(null)
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [active, root])
  const item = (i: number) => ({
    onPointerEnter: () => setActive(i),
    onClick: () => setActive(i),
    onFocus: () => setActive(i),
  })
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setActive(null)
  }
  return { active, item, leave, clear: () => setActive(null) }
}

const stagger = (i: number) => ({ '--i': i }) as CSSProperties

export interface Bar {
  /** The label under the bar (may be left out when bars are narrow). */
  label: string
  /** Tooltip: what the bar is (a date, an hour) and its value as text. */
  tipTitle: string
  tip: string
  /** null: no value (nothing planned); drawn as an empty column. */
  value: number | null
}

/**
 * A vertical bar chart. `ticks` are the gridline values (the last one is the top of the chart),
 * formatted with `fmtTick`.
 */
export function BarChart({ bars, ticks, fmtTick, label, height = 168 }: { bars: Bar[]; ticks: number[]; fmtTick: (v: number) => string; label: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const { active, item, leave } = useActive(ref)
  const padL = 46
  const padR = 4
  const padT = 10
  const padB = 24
  const plotW = Math.max(0, width - padL - padR)
  const plotH = height - padT - padB
  const top = ticks[ticks.length - 1] || 1
  const step = bars.length ? plotW / bars.length : 0
  const barW = Math.max(2, Math.min(28, step * 0.62))
  const y = (v: number) => padT + plotH * (1 - Math.min(1, v / top))
  // Every k-th label, so they don't run into each other.
  const every = Math.max(1, Math.ceil(40 / Math.max(1, step)))
  const cur = active !== null ? bars[active] : undefined
  const tipX = active !== null ? Math.min(Math.max(padL + step * (active + 0.5), 70), Math.max(70, width - 70)) : 0
  const tipY = cur ? y(cur.value ?? 0) : 0
  return (
    <div ref={ref} className={'stats-chart' + (active !== null ? ' has-active' : '')} onPointerLeave={leave}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {ticks.map((v) => (
            <g key={v} className="stats-grid-line">
              <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} />
              <text x={padL - 8} y={y(v)} dy="0.32em" textAnchor="end">
                {fmtTick(v)}
              </text>
            </g>
          ))}
          <g>
            {bars.map((b, i) =>
              b.value ? (
                <rect
                  key={i}
                  className={'stats-bar' + (i === active ? ' active' : '')}
                  style={stagger(i)}
                  x={padL + step * i + (step - barW) / 2}
                  y={y(b.value)}
                  width={barW}
                  height={Math.max(1, padT + plotH - y(b.value))}
                  rx={Math.min(4, barW / 2)}
                />
              ) : null,
            )}
          </g>
          {bars.map((b, i) =>
            i % every === 0 ? (
              <text key={i} className={'stats-x-label' + (i === active ? ' active' : '')} x={padL + step * (i + 0.5)} y={height - 6} textAnchor="middle">
                {b.label}
              </text>
            ) : null,
          )}
          {bars.map((b, i) => (
            <rect key={i} className="stats-hit" x={padL + step * i} y={padT} width={step} height={plotH + padB} role="img" aria-label={`${b.tipTitle}: ${b.tip}`} {...item(i)} />
          ))}
        </svg>
      )}
      {cur && (
        <div key={active} className="stats-tip" style={{ left: tipX, top: tipY }} role="status">
          <div className="stats-tip-title">{cur.tipTitle}</div>
          <div className="stats-tip-value">{cur.tip}</div>
        </div>
      )}
    </div>
  )
}

export interface Slice {
  key: string
  label: string
  value: number
  color: string
  /** The value as text, e.g. "12" or "1h 20m". */
  text: string
}

/** A ring split by share, with a legend; hovering or tapping a part (or its legend row) shows it in the middle. */
export function Donut({ slices, total, label }: { slices: Slice[]; total: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { active, item, leave } = useActive(ref)
  const size = 132
  const r = 52
  const sw = 16
  const C = 2 * Math.PI * r
  const sum = slices.reduce((s, x) => s + x.value, 0) || 1
  const gap = slices.length > 1 ? 2 : 0
  // Where each part starts along the ring.
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((s, x) => s + (x.value / sum) * C, 0))
  const cur = active !== null ? slices[active] : undefined
  return (
    <div ref={ref} className={'stats-donut' + (active !== null ? ' has-active' : '')} onPointerLeave={leave}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle className="stats-donut-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={sw} />
        <g className="stats-donut-ring">
          {slices.map((s, i) => {
            const len = (s.value / sum) * C
            return (
              <circle
                key={s.key}
                className={'stats-donut-part' + (i === active ? ' active' : '')}
                cx={size / 2}
                cy={size / 2}
                r={r}
                strokeWidth={sw}
                stroke={s.color}
                strokeDasharray={`${Math.max(0.5, len - gap)} ${C}`}
                strokeDashoffset={-starts[i]}
                role="img"
                aria-label={`${s.label}: ${s.text}`}
                {...item(i)}
              />
            )
          })}
        </g>
        <text className="stats-donut-value" x={size / 2} y={size / 2 - (cur ? 4 : 0)} textAnchor="middle" dy="0.32em">
          {cur ? cur.text : total}
        </text>
        {cur && (
          <text className="stats-donut-sub" x={size / 2} y={size / 2 + 16} textAnchor="middle" dy="0.32em">
            {fmtPercent(cur.value / sum)}
          </text>
        )}
      </svg>
      <ul className="stats-legend">
        {slices.map((s, i) => (
          <li key={s.key} className={i === active ? 'active' : undefined} {...item(i)}>
            <span className="stats-dot" style={{ background: s.color }} />
            <span className="stats-legend-name">{s.label}</span>
            <span className="stats-legend-value">{s.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface Row {
  key: string
  label: ReactNode
  value: number
  text: string
  color?: string
}

/** Horizontal bars, longest first, each scaled to the largest value. */
export function BarList({ rows, max = 6 }: { rows: Row[]; max?: number }) {
  const top = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="stats-bars">
      {rows.slice(0, max).map((r, i) => (
        <li key={r.key}>
          <div className="stats-bars-head">
            <span className="stats-bars-name">{r.label}</span>
            <span className="stats-bars-value">{r.text}</span>
          </div>
          <div className="stats-bars-track">
            <div className="stats-bars-fill" style={{ ...stagger(i), transform: `scaleX(${r.value / top})`, background: r.color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** A small progress ring for a share (0–1); null draws the empty track. */
export function Ring({ share, size = 44, color = 'var(--primary)' }: { share: number | null; size?: number; color?: string }) {
  const sw = 5
  const r = (size - sw) / 2
  const C = 2 * Math.PI * r
  return (
    <svg className="stats-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="stats-donut-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={sw} />
      {share !== null && share > 0 && (
        <g className="stats-ring-arc">
          <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={sw} stroke={color} fill="none" strokeLinecap="round" strokeDasharray={`${share * C} ${C}`} />
        </g>
      )}
    </svg>
  )
}
