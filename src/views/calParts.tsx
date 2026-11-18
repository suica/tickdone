import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { toggleTask, setUI, useUI } from '../store'
import type { Task } from '../types'
import { Icon } from '../components/Icon'
import { Popover } from '../components/Popover'
import { QuickAdd } from '../components/QuickAdd'
import { useT } from '../i18n'
import { fmtTime } from '../i18n/format'
import { DAY_MIN, dayLabelWd, durOf, openTaskMenuAt, timeRange, toMin, type AddState } from './calUtil'

interface CalTaskProps {
  task: Task
  color: string
  showTime?: boolean
  /** A block in the time grid (title plus time range). */
  block?: boolean
  /** Range shown instead of the task's own one (while it is being moved or resized). */
  range?: string
  className?: string
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void
  /** Pointer down on the bottom edge of a block: resize. */
  onResizeDown?: (e: ReactPointerEvent<HTMLSpanElement>) => void
}

/** A task in the calendar: a bar in month cells and the all-day row, a block in the time grid. */
export function CalTask({ task, color, showTime, block, range, className = '', onPointerDown, onResizeDown }: CalTaskProps) {
  const ui = useUI()
  const t = useT()
  const done = task.status !== 0
  let label = range
  if (!label && block && task.dueTime) {
    const s = toMin(task.dueTime)
    label = timeRange(s, Math.min(s + durOf(task), DAY_MIN))
  }
  return (
    <div
      className={'cal-task' + (done ? ' done' : '') + (block ? ' block' : '') + (ui.selectedTaskId === task.id ? ' selected' : '') + (className ? ' ' + className : '')}
      style={{ '--c': color } as CSSProperties}
      title={task.title}
      data-task-id={task.id}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation()
        setUI({ selectedTaskId: task.id })
      }}
      onContextMenu={(e) => openTaskMenuAt(e, task.id)}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <span
        className={'cal-cb' + (done ? ' checked' : '')}
        onClick={(e) => {
          e.stopPropagation()
          toggleTask(task.id)
        }}
        title={done ? t('calendar.markUndone') : t('calendar.markDone')}
      >
        {done && <Icon name="check" size={9} stroke={3} />}
      </span>
      {showTime && task.dueTime && <span className="cal-task-time">{fmtTime(task.dueTime)}</span>}
      <span className="cal-task-title">{task.title || t('common.untitled')}</span>
      {block && label && <span className="cal-task-range">{label}</span>}
      {onResizeDown && <span className="cal-resize" onPointerDown={onResizeDown} onClick={(e) => e.stopPropagation()} />}
    </div>
  )
}

/** Quick add for one day of the calendar, optionally with a start time and a length. */
export function AddPopover({ s, onClose, onAdded }: { s: AddState; onClose: () => void; onAdded?: (t: Task) => void }) {
  const t = useT()
  const start = s.time ? toMin(s.time) : 0
  const ref = useRef<HTMLDivElement>(null)
  // The popover is hidden until it has been positioned, so focus the title once it is visible.
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.querySelector('input')?.focus())
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <Popover anchor={s.anchor} onClose={onClose} width={300} className="cal-add-pop">
      <div ref={ref}>
        <div className="cal-add-head">
          {dayLabelWd(s.date)}
          {s.time && ' ' + (s.duration ? timeRange(start, Math.min(start + s.duration, DAY_MIN)) : fmtTime(s.time))}
        </div>
        <QuickAdd
          compact
          autoFocus
          onCancel={onClose}
          placeholder={t('calendar.addPlaceholder')}
          defaults={s.time ? { dueDate: s.date, dueTime: s.time, ...(s.duration ? { duration: s.duration } : {}) } : { dueDate: s.date }}
          onAdded={(t) => {
            onAdded?.(t)
            onClose()
          }}
        />
      </div>
    </Popover>
  )
}
