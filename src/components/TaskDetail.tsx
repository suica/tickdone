import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { dueLabel, isOverdue } from '../dates'
import { usePan } from '../gestures'
import { useT, type MessageKey } from '../i18n'
import { fmtFullDate, fmtMonthDay, fmtTime } from '../i18n/format'
import { cancelAnimations, dur, ease, play } from '../motion'
import { startFocus } from '../pomo'
import { deleteTask, duplicateTask, getUI, setUI, toggleTask, uid, updateTask, useData, useUI, wontDo } from '../store'
import type { Priority, Subtask, Task } from '../types'
import { useNarrowTablet, usePhone, useTablet } from '../viewport'
import { PRIORITY, priorityColor } from '../views'
import { DatePicker, reminderText, repeatText } from './DatePicker'
import { Flag, Icon } from './Icon'
import { anchorOf, MenuList, Popover, type Anchor } from './Popover'
import { Subtasks } from './Subtasks'
import { Checkbox } from './TaskRow'
import './detail.css'

/** Priority names from the shared vocabulary. */
export const PRIORITY_NAME: Record<Priority, MessageKey> = {
  5: 'common.priorityGroup.high',
  3: 'common.priorityGroup.medium',
  1: 'common.priorityGroup.low',
  0: 'common.priorityGroup.none',
}

/** "Nov 18, 2026, 3:36 PM" style date and time of a timestamp, in the current language. */
const stamp = (ms: number, withYear: boolean) => `${withYear ? fmtFullDate(new Date(ms)) : fmtMonthDay(new Date(ms))} ${fmtTime(format(ms, 'HH:mm'))}`

function AutoTextarea({ value, onChange, className, placeholder, onKeyDown, autoFocus, readOnly }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; autoFocus?: boolean; readOnly?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return <textarea ref={ref} rows={1} className={className} value={value} placeholder={placeholder} autoFocus={autoFocus} readOnly={readOnly} onKeyDown={onKeyDown} onChange={(e) => onChange(e.target.value)} />
}

/**
 * Where the detail shows:
 * - pane: task module on desktops and wide tablets (≥1024px), a column next to the list with a
 *   draggable divider; it shows an empty state while no task is selected;
 * - float: desktop calendar/matrix/search, a panel over the right edge;
 * - overlay: calendar/matrix/search on tablets, and the task module on narrow tablets (768–1023px),
 *   a panel sliding in from the right over the list (click outside closes);
 * - page: phones, a full-screen page sliding in from the right (back button or swipe right closes).
 */
type Mode = 'pane' | 'float' | 'overlay' | 'page'

export function TaskDetail({ floating }: { floating?: boolean }) {
  const ui = useUI()
  const data = useData()
  const phone = usePhone()
  const tablet = useTablet()
  const narrow = useNarrowTablet()
  const task = data.tasks.find((t) => t.id === ui.selectedTaskId)
  const mode: Mode = phone ? 'page' : floating ? (tablet ? 'overlay' : 'float') : narrow ? 'overlay' : 'pane'
  if (mode === 'pane') return <DetailPane task={task} width={ui.detailWidth} />
  if (!task) return null
  return <DetailLayer task={task} mode={mode} />
}

/** Closes the task detail. Floating panels and full-screen pages slide out first. */
export function closeDetail() {
  const id = getUI().selectedTaskId
  if (!id) return
  const el = document.querySelector<HTMLElement>('[data-detail-layer]')
  if (el?.dataset.closing) return
  const d = dur('--dur')
  if (!el || !d) return setUI({ selectedTaskId: undefined })
  el.dataset.closing = '1'
  const from = getComputedStyle(el).transform
  el.style.transform = ''
  play(el, [{ transform: from === 'none' ? 'translateX(0)' : from }, { transform: 'translateX(100%)' }], d, ease('--ease-in-out')).then((finished) => {
    delete el.dataset.closing
    if (finished && getUI().selectedTaskId === id) setUI({ selectedTaskId: undefined })
  })
}

/** Clicks on these never count as "outside" a floating detail. */
const NOT_OUTSIDE = '.popover, .sheet-layer, .modal-mask, .dlg-mask, .toast, .drawer-layer'
/** If one of these is open when the pointer goes down, the click just dismisses it. */
const DISMISSABLE = '.popover, .sheet-layer, .modal-mask, .dlg-mask'

function DetailLayer({ task, mode }: { task: Task; mode: Exclude<Mode, 'pane'> }) {
  const ref = useRef<HTMLDivElement>(null)
  const data = useData()
  const t = useT()
  const list = data.lists.find((l) => l.id === task.listId)

  // Another task picked while the panel was sliding out: keep it open.
  useLayoutEffect(() => {
    const el = ref.current
    if (el?.dataset.closing) {
      delete el.dataset.closing
      cancelAnimations(el)
    }
  }, [task.id])

  // Floating panels close on a click outside them. A click that picks another task switches to it,
  // and a click that only dismisses an open popover, menu or dialog leaves the panel alone.
  useEffect(() => {
    if (mode === 'page') return
    let idAtDown: string | undefined
    let skip = true
    const down = (e: PointerEvent) => {
      const t = e.target as Element
      idAtDown = getUI().selectedTaskId
      skip = !!ref.current?.contains(t) || !!t.closest?.(NOT_OUTSIDE) || !!document.querySelector(DISMISSABLE) || !!getUI().menu || !!getUI().dialog
    }
    const click = (e: MouseEvent) => {
      const t = e.target as Element
      if (skip || !t.isConnected || ref.current?.contains(t) || t.closest(NOT_OUTSIDE)) return
      if (getUI().selectedTaskId !== idAtDown) return
      closeDetail()
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('click', click)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('click', click)
    }
  }, [mode])

  const springBack = () => {
    const el = ref.current
    if (!el) return
    const from = el.style.transform
    el.style.transform = ''
    play(el, [{ transform: from || 'none' }, { transform: 'translateX(0)' }], dur('--dur'), ease('--ease-out')).then(() => cancelAnimations(el))
  }
  // Swipe right on the full-screen page to go back.
  const swipe = usePan({
    axis: 'x',
    dir: 1,
    maxDelay: 300,
    filter: () => !ref.current?.dataset.closing,
    onStart: () => ref.current?.getAnimations().forEach((a) => a.finish()),
    onMove: (d) => {
      if (ref.current) ref.current.style.transform = `translateX(${d}px)`
    },
    onEnd: (d, v) => {
      const w = ref.current?.offsetWidth ?? 1
      if (d > w * 0.3 || v > 0.45) closeDetail()
      else springBack()
    },
  })

  const cls = mode === 'page' ? 'detail-page' : 'detail-float' + (mode === 'overlay' ? ' detail-overlay' : '')
  return createPortal(
    <div ref={ref} className={cls} data-detail-layer={mode} role="dialog" aria-label={t('shell.detail.label')} {...(mode === 'page' ? swipe : {})}>
      {mode === 'page' ? (
        <div className="detail-nav">
          <button className="detail-back" title={t('common.back')} aria-label={t('common.back')} onClick={closeDetail}>
            <Icon name="chevronLeft" size={24} />
          </button>
          <span className="detail-nav-title">{list?.name ?? t('common.list.inbox')}</span>
        </div>
      ) : (
        <div className="detail-float-close">
          <button className="icon-btn" onClick={closeDetail} title={t('common.close')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <DetailBody task={task} key={task.id} />
    </div>,
    document.body,
  )
}

function DetailPane({ task, width }: { task?: Task; width?: number }) {
  const ref = useRef<HTMLElement>(null)
  const t = useT()
  const style: CSSProperties | undefined = width ? { flex: `0 1 ${width}px`, maxWidth: 'none' } : undefined
  return (
    <aside className="detail" ref={ref} style={style}>
      <Divider pane={ref} width={width} />
      {task ? (
        <DetailBody task={task} key={task.id} />
      ) : (
        <div className="empty" style={{ height: '100%' }}>
          <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
            <circle cx="48" cy="48" r="40" fill="var(--primary-soft)" />
            <path d="M32 50l10 10 22-24" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>{t('shell.detail.empty')}</div>
        </div>
      )}
    </aside>
  )
}

const MIN_DETAIL = 320
const KEY_STEP = 16

/** The divider between the list and the desktop detail: drag (or arrow keys) to resize, double-click to reset. */
function Divider({ pane, width }: { pane: RefObject<HTMLElement | null>; width?: number }) {
  const t = useT()
  const limits = () => {
    const el = pane.current!
    const r = el.getBoundingClientRect()
    const list = el.previousElementSibling as HTMLElement | null
    if (!list) return { w: r.width, max: r.width }
    const listMin = parseFloat(getComputedStyle(list).minWidth) || 360
    return { w: r.width, max: Math.max(MIN_DETAIL, r.right - list.getBoundingClientRect().left - listMin) }
  }
  const apply = (w: number) => {
    const el = pane.current
    if (!el) return
    el.style.flex = `0 1 ${w}px`
    el.style.maxWidth = 'none'
  }
  const restore = () => {
    const el = pane.current
    if (!el) return
    el.style.flex = width ? `0 1 ${width}px` : ''
    el.style.maxWidth = width ? 'none' : ''
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pane.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    handle.focus({ preventScroll: true })
    const { w: w0, max } = limits()
    const x0 = e.clientX
    let w = w0
    let moved = false
    handle.classList.add('active')
    document.body.classList.add('col-resizing')
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      moved ||= Math.abs(ev.clientX - x0) > 1
      w = Math.round(Math.min(max, Math.max(MIN_DETAIL, w0 - (ev.clientX - x0))))
      apply(w)
    }
    const end = (commit: boolean) => {
      handle.classList.remove('active')
      document.body.classList.remove('col-resizing')
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      if (commit && moved) setUI({ detailWidth: w })
      else restore()
    }
    const up = () => end(true)
    const cancel = () => end(false)
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopPropagation()
      end(false)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
  }

  return (
    <div
      className="detail-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('shell.detail.resize')}
      aria-valuenow={width}
      aria-valuemin={MIN_DETAIL}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        restore()
        setUI({ detailWidth: undefined })
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const { w, max } = limits()
        setUI({ detailWidth: Math.round(Math.min(max, Math.max(MIN_DETAIL, w + (e.key === 'ArrowLeft' ? KEY_STEP : -KEY_STEP)))) })
      }}
    />
  )
}

function DetailBody({ task }: { task: Task }) {
  const data = useData()
  const phone = usePhone()
  const t = useT()
  const [pop, setPop] = useState<{ kind: 'date' | 'prio' | 'list' | 'more' | 'tag'; anchor: Anchor } | null>(null)
  const [focusSub, setFocusSub] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const titleRef = useRef<HTMLDivElement>(null)
  const ro = !!task.deleted
  const set = (p: Partial<Task>) => !ro && updateTask(task.id, p)
  const list = data.lists.find((l) => l.id === task.listId)
  const overdue = isOverdue(task)

  // A new task with an empty title gets the focus in its title
  useEffect(() => {
    if (!task.title) titleRef.current?.querySelector('textarea')?.focus()
  }, [])

  const addSubAfter = (idx: number) => {
    const s: Subtask = { id: uid(), title: '', done: false }
    const arr = [...task.subtasks]
    arr.splice(idx + 1, 0, s)
    set({ subtasks: arr })
    setFocusSub(s.id)
  }

  const dateText = task.dueDate ? dueLabel(task) : t('shell.detail.dateAndReminder')
  const dateColor = !task.dueDate ? 'var(--text-3)' : task.status !== 0 ? 'var(--text-3)' : overdue ? 'var(--overdue)' : 'var(--primary)'

  return (
    <div className="detail-inner">
      {ro && (
        <div className="detail-banner">
          {t('shell.detail.inTrash')}
          <button onClick={() => updateTask(task.id, { deleted: false })}>{t('shell.task.restore')}</button>
          <button className="danger" onClick={() => deleteTask(task.id)}>
            {t('shell.task.deleteForever')}
          </button>
        </div>
      )}
      <div className="detail-top">
        <Checkbox task={task} />
        <button className="detail-date" style={{ color: dateColor }} disabled={ro} onClick={(e) => setPop({ kind: 'date', anchor: anchorOf(e.currentTarget) })}>
          <Icon name="calendar" size={16} />
          <span>{dateText}</span>
          {task.reminder != null && <Icon name="bell" size={13} />}
          {task.repeat && <Icon name="repeat" size={13} />}
        </button>
        <div style={{ flex: 1 }} />
        <button className="icon-btn" title={t('common.priority')} disabled={ro} onClick={(e) => setPop({ kind: 'prio', anchor: anchorOf(e.currentTarget) })}>
          <Flag color={priorityColor(task.priority)} size={17} />
        </button>
      </div>

      <div className="detail-scroll">
        <div ref={titleRef}>
          <AutoTextarea
            className={'detail-title' + (task.status !== 0 ? ' done' : '')}
            value={task.title}
            placeholder={t('shell.detail.titlePlaceholder')}
            readOnly={ro}
            onChange={(v) => set({ title: v.replace(/\n/g, '') })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(document.querySelector('.detail-content') as HTMLTextAreaElement | null)?.focus()
              }
            }}
          />
        </div>

        {task.subtasks.length > 0 && <Subtasks task={task} ro={ro} set={set} focusSub={focusSub} setFocusSub={setFocusSub} addSubAfter={addSubAfter} />}

        <AutoTextarea className="detail-content" value={task.content} placeholder={t('shell.detail.description')} readOnly={ro} onChange={(v) => set({ content: v })} />

        {!ro && (
          <button className="detail-addsub" onClick={() => addSubAfter(task.subtasks.length - 1)}>
            <Icon name="plus" size={14} /> {t('shell.detail.addSubtask')}
          </button>
        )}

        <div className="detail-tags">
          {task.tags.map((tg) => {
            const c = data.tags.find((x) => x.name === tg)?.color
            return (
              <span key={tg} className="tag-pill lg" style={c ? { background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c } : undefined}>
                {tg}
                {!ro && (
                  <button onClick={() => set({ tags: task.tags.filter((x) => x !== tg) })}>
                    <Icon name="close" size={11} stroke={2.4} />
                  </button>
                )}
              </span>
            )
          })}
        </div>

        {(task.reminder != null || task.repeat) && (
          <div className="detail-extra">
            {task.reminder != null && (
              <span>
                <Icon name="bell" size={13} /> {reminderText(task.reminder, !!task.dueTime)}
              </span>
            )}
            {task.repeat && (
              <span>
                <Icon name="repeat" size={13} /> {repeatText(task.repeat, task.dueDate)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="detail-foot">
        <button className="detail-list" disabled={ro} onClick={(e) => setPop({ kind: 'list', anchor: anchorOf(e.currentTarget) })}>
          {list?.color ? <i className="dot" style={{ background: list.color }} /> : <Icon name={list ? 'list' : 'inbox'} size={15} />}
          <span>{list?.name ?? t('common.list.inbox')}</span>
        </button>
        <div style={{ flex: 1 }} />
        {!ro && (
          <>
            <button className="icon-btn" title={t('shell.task.tags')} onClick={(e) => setPop({ kind: 'tag', anchor: anchorOf(e.currentTarget) })}>
              <Icon name="tag" size={16} />
            </button>
            <button className="icon-btn" title={t('shell.task.startFocus')} onClick={() => { startFocus(task.id); setUI({ module: 'pomo' }) }}>
              <Icon name="pomo" size={17} />
            </button>
          </>
        )}
        <button className="icon-btn" title={t('common.more')} onClick={(e) => setPop({ kind: 'more', anchor: anchorOf(e.currentTarget) })}>
          <Icon name="more" size={18} stroke={2.6} />
        </button>
      </div>

      {pop?.kind === 'date' && (
        <DatePicker
          anchor={pop.anchor}
          value={{ dueDate: task.dueDate, dueTime: task.dueTime, reminder: task.reminder, repeat: task.repeat }}
          onChange={(v) => set({ dueDate: v.dueDate, dueTime: v.dueTime, reminder: v.reminder ?? null, repeat: v.repeat ?? null })}
          onClose={() => setPop(null)}
        />
      )}
      {pop?.kind === 'prio' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)}>
          <div className="prio-row">
            {PRIORITY.map((p) => (
              <button
                key={p.v}
                title={t(PRIORITY_NAME[p.v])}
                className={'prio-btn' + (p.v === task.priority ? ' on' : '')}
                onClick={() => {
                  set({ priority: p.v })
                  setPop(null)
                }}
              >
                <Flag color={p.color} size={18} />
              </button>
            ))}
          </div>
        </Popover>
      )}
      {pop?.kind === 'list' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)}>
          <MenuList
            onClose={() => setPop(null)}
            items={[{ id: 'inbox', name: t('common.list.inbox'), color: undefined as string | undefined }, ...data.lists].map((l) => ({
              label: l.name,
              icon: l.color ? <i className="dot" style={{ background: l.color }} /> : <Icon name={l.id === 'inbox' ? 'inbox' : 'list'} size={14} />,
              checked: l.id === task.listId,
              onClick: () => set({ listId: l.id, sectionId: undefined }),
            }))}
          />
        </Popover>
      )}
      {pop?.kind === 'tag' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={220}>
          <div className="tag-picker">
            <input
              className="input"
              autoFocus
              placeholder={t('shell.tagPicker.placeholder')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value.replace(/[#\s]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput && !e.nativeEvent.isComposing) {
                  if (!task.tags.includes(tagInput)) set({ tags: [...task.tags, tagInput] })
                  setTagInput('')
                }
              }}
            />
            <div className="tag-picker-list">
              {data.tags
                .filter((t) => t.name.includes(tagInput))
                .map((t) => {
                  const on = task.tags.includes(t.name)
                  return (
                    <div key={t.name} className="menu-item" onClick={() => set({ tags: on ? task.tags.filter((x) => x !== t.name) : [...task.tags, t.name] })}>
                      <span className="menu-icon" style={{ color: t.color }}>
                        <Icon name="tag" size={14} />
                      </span>
                      <span className="menu-label">{t.name}</span>
                      {on && <span className="menu-check">✓</span>}
                    </div>
                  )
                })}
              {tagInput && !data.tags.some((t) => t.name === tagInput) && (
                <div
                  className="menu-item"
                  onClick={() => {
                    set({ tags: [...task.tags, tagInput] })
                    setTagInput('')
                  }}
                >
                  <span className="menu-icon">
                    <Icon name="plus" size={14} />
                  </span>
                  <span className="menu-label">{t('shell.tagPicker.create', { name: tagInput })}</span>
                </div>
              )}
            </div>
          </div>
        </Popover>
      )}
      {pop?.kind === 'more' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)}>
          <MenuList
            onClose={() => setPop(null)}
            items={
              ro
                ? [
                    { label: t('shell.task.restore'), icon: <Icon name="restore" size={15} />, onClick: () => updateTask(task.id, { deleted: false }) },
                    { label: t('shell.task.deleteForever'), icon: <Icon name="trash" size={15} />, danger: true, onClick: () => deleteTask(task.id) },
                  ]
                : [
                    { label: t('shell.detail.addSubtask'), icon: <Icon name="subtask" size={15} />, onClick: () => addSubAfter(task.subtasks.length - 1) },
                    { label: t(task.pinned ? 'shell.task.unpin' : 'shell.task.pin'), icon: <Icon name="pin" size={15} />, onClick: () => set({ pinned: !task.pinned }) },
                    { label: t(task.status === -1 ? 'shell.task.reopen' : 'shell.task.wontDo'), icon: <Icon name="wontdo" size={15} />, onClick: () => (task.status === -1 ? set({ status: 0, completedAt: undefined }) : wontDo(task.id)) },
                    { label: t('shell.task.startFocus'), icon: <Icon name="pomo" size={15} />, onClick: () => { startFocus(task.id); setUI({ module: 'pomo' }) } },
                    { label: t('shell.task.duplicate'), icon: <Icon name="copy" size={15} />, onClick: () => duplicateTask(task.id) },
                    { label: t(task.status === 2 ? 'shell.task.markNotDone' : 'shell.task.markDone'), icon: <Icon name="check" size={15} />, hint: phone ? undefined : 'Ctrl+Enter', onClick: () => toggleTask(task.id) },
                    { divider: true },
                    { label: t('common.delete'), icon: <Icon name="trash" size={15} />, danger: true, onClick: () => deleteTask(task.id) },
                  ]
            }
          />
        </Popover>
      )}
      <div className="detail-meta">
        {t('shell.detail.created', { date: stamp(task.createdAt, true) })}
        {task.completedAt && task.status !== 0 && ` · ${t(task.status === 2 ? 'shell.detail.completedOn' : 'shell.detail.wontDoOn', { date: stamp(task.completedAt, false) })}`}
      </div>
    </div>
  )
}
