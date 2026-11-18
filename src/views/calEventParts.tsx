import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react'
import type { FeedEvent } from '../feeds'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { anchorOf, Popover, type Anchor } from '../components/Popover'
import type { DayEvent } from './calEvents'
import './calEvents.css'
import { eventWhen, timeLabel, timeRange } from './calUtil'

export type OpenEvent = (ev: FeedEvent, anchor: Anchor) => void

/**
 * Events can't be dragged. A press that moves and is released elsewhere would still end in a click on
 * whatever is under both points (a day column, which adds a task): swallow that click.
 */
function swallowClickAfterMove(x0: number, y0: number) {
  const up = (u: globalThis.PointerEvent) => {
    window.removeEventListener('pointerup', up, true)
    if (Math.hypot(u.clientX - x0, u.clientY - y0) <= 4) return
    const kill = (c: Event) => {
      c.stopPropagation()
      c.preventDefault()
    }
    window.addEventListener('click', kill, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', kill, true), 0)
  }
  window.addEventListener('pointerup', up, true)
}

/** Click and Enter open the event; presses never start a drag or a new task underneath. */
function handlers(ev: FeedEvent, onOpen: OpenEvent) {
  return {
    role: 'button',
    tabIndex: 0,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.stopPropagation()
      swallowClickAfterMove(e.clientX, e.clientY)
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      e.stopPropagation()
      onOpen(ev, e.detail === 0 ? anchorOf(e.currentTarget) : { x: e.clientX, y: e.clientY + 4, h: 8 })
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      e.stopPropagation()
      onOpen(ev, anchorOf(e.currentTarget))
    },
    onDoubleClick: (e: { stopPropagation(): void }) => e.stopPropagation(),
    onContextMenu: (e: { preventDefault(): void; stopPropagation(): void }) => {
      e.preventDefault()
      e.stopPropagation()
    },
  }
}

/** An event of a subscribed calendar: a bar in month cells and the all-day row, a block in the time grid. Read-only. */
export function CalEvent({ d, block, showTime, onOpen }: { d: DayEvent; block?: boolean; showTime?: boolean; onOpen: OpenEvent }) {
  const t = useT()
  const ev = d.ev
  return (
    <div
      className={'cal-task cal-event' + (block ? ' block' : '')}
      style={{ '--c': ev.color } as CSSProperties}
      title={`${ev.title || t('common.untitled')} · ${ev.feedName}`}
      data-event-id={ev.id}
      aria-label={t('calendar.event.label', { title: ev.title || t('common.untitled'), calendar: ev.feedName })}
      {...handlers(ev, onOpen)}
    >
      <span className="cal-ev-dot" />
      {showTime && !d.allDay && <span className="cal-task-time">{timeLabel(d.s)}</span>}
      <span className="cal-task-title">{ev.title || t('common.untitled')}</span>
      {block && !d.allDay && <span className="cal-task-range">{d.e > d.s ? timeRange(d.s, d.e) : timeLabel(d.s)}</span>}
    </div>
  )
}

/** A row for an event in the phone day list and the list view. */
export function EventRow({ d, onOpen }: { d: DayEvent; onOpen: OpenEvent }) {
  const t = useT()
  const ev = d.ev
  return (
    <div className="cal-ev-row" style={{ '--c': ev.color } as CSSProperties} data-event-id={ev.id} {...handlers(ev, onOpen)}>
      <span className="cal-ev-row-bar" />
      <span className="cal-ev-row-main">
        <span className="cal-ev-row-title">{ev.title || t('common.untitled')}</span>
        <span className="cal-ev-row-sub">
          {d.allDay ? t('calendar.allDay') : d.e > d.s ? timeRange(d.s, d.e) : timeLabel(d.s)}
          {' · '}
          {ev.feedName}
        </span>
      </span>
    </div>
  )
}

/** Text with its web addresses as links that open in a new tab. */
function Linked({ text }: { text: string }) {
  const parts: ReactNode[] = []
  const re = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer">
        {m[0]}
      </a>,
    )
    last = m.index + m[0].length
  }
  parts.push(text.slice(last))
  return <>{parts}</>
}

/** Details of an event: title, time, place, notes and the calendar it comes from. */
export function EventPopover({ ev, anchor, onClose }: { ev: FeedEvent; anchor: Anchor; onClose: () => void }) {
  const t = useT()
  return (
    <Popover anchor={anchor} onClose={onClose} width={320} className="cal-ev-pop">
      <div className="cal-ev-pop-body" style={{ '--c': ev.color } as CSSProperties} role="dialog" aria-label={ev.title || t('common.untitled')}>
        <div className="cal-ev-pop-head">
          <span className="cal-ev-pop-swatch" />
          <h3 className="cal-ev-pop-title">{ev.title || t('common.untitled')}</h3>
          <button className="icon-btn" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="cal-ev-pop-row">
          <Icon name="clock" size={15} />
          <span>{eventWhen(ev)}</span>
        </div>
        {ev.location && (
          <div className="cal-ev-pop-row">
            <Icon name="place" size={15} />
            <span className="cal-ev-pop-text">
              <Linked text={ev.location} />
            </span>
          </div>
        )}
        {ev.description && (
          <div className="cal-ev-pop-desc">
            <Linked text={ev.description} />
          </div>
        )}
        <div className="cal-ev-pop-feed">
          <Icon name="calendar" size={14} />
          <span>{ev.feedName}</span>
          <span className="cal-ev-pop-ro">{t('calendar.event.readOnly')}</span>
        </div>
      </div>
    </Popover>
  )
}
