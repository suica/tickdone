import { useContext, useLayoutEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import { dueLabel, isOverdue } from '../dates'
import { useT, type MessageKey } from '../i18n'
import { deleteTask, getData, setUI, toast, updateTask, useData, useUI } from '../store'
import type { Task } from '../types'
import { useMedia, usePhone } from '../viewport'
import { priorityColor } from '../views'
import { DatePicker } from './DatePicker'
import { Icon } from './Icon'
import { anchorOf, MenuList, Popover, type Anchor } from './Popover'
import { useRowSwipe, type SwipeSide } from './rowSwipe'
import { toggleWithMotion, useLinger } from './taskMotion'
import { moveTaskTo, TaskDragContext } from './taskDnd'

/** Check mark drawn with pathLength 1 so it can be stroked in. */
function Tick() {
  return (
    <svg className="cb-tick" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/**
 * The task checkbox. Completing fills it with the priority colour, strokes the tick in and bounces slightly;
 * un-completing plays it backwards.
 */
export function Checkbox({ task, onToggle }: { task: Task; onToggle?: () => void }) {
  const phase = useLinger().get(task.id)?.phase
  const color = priorityColor(task.priority)
  const cls = phase === 'check' ? ' cb-checking' : phase === 'uncheck' ? ' cb-unchecking' : task.status === 2 ? ' checked' : task.status === -1 ? ' wontdo' : ''
  const tinted = task.status === 0 || !!phase
  return (
    <span
      className={'checkbox cb' + cls}
      style={tinted ? ({ '--cb': color, '--cb-bg': task.priority && !phase ? `color-mix(in srgb, ${color} 8%, transparent)` : undefined } as CSSProperties) : undefined}
      role="checkbox"
      aria-checked={phase ? phase === 'check' : task.status === 2}
      data-no-drag
      onClick={(e) => {
        e.stopPropagation()
        if (task.deleted) return
        ;(onToggle ?? (() => toggleWithMotion(task.id)))()
      }}
    >
      {phase && <span className="cb-fill" />}
      {(phase || task.status === 2) && <Tick />}
      {task.status === -1 && !phase && <Icon name="close" size={11} stroke={3} />}
    </span>
  )
}

export function openTaskMenu(e: MouseEvent, id: string) {
  e.preventDefault()
  e.stopPropagation()
  setUI({ menu: { x: e.clientX, y: e.clientY, kind: 'task', id }, selectedTaskId: id })
}

interface Props {
  task: Task
  showList?: boolean
  /** nesting level inside the list (subtasks) */
  depth?: number
  /** rows with subtasks: folded state and toggle */
  fold?: { folded: boolean; toggle: () => void }
  /** never start a list drag from this row, even inside a task list (views that drag rows themselves) */
  dragDisabled?: boolean
}

export function TaskRow({ task, showList, depth = 0, fold, dragDisabled }: Props) {
  const t = useT()
  const ui = useUI()
  const data = useData()
  const drag = useContext(TaskDragContext)
  const phase = useLinger().get(task.id)?.phase
  // On touch screens the title is plain text: a tap opens the task instead of starting to edit it.
  const touch = useMedia('(pointer: coarse)')
  const selected = ui.selectedTaskId === task.id
  const list = data.lists.find((l) => l.id === task.listId)
  const overdue = isOverdue(task) && !phase
  // "Show details": the start of the notes under the title, on one line
  const notes = task.content.trim().replace(/\s+/g, ' ').slice(0, 200)
  const done = (task.status !== 0 && phase !== 'uncheck') || phase === 'check'
  const subDone = task.subtasks.filter((s) => s.done).length
  // Every open date is blue; overdue ones are red.
  const dateColor = done ? 'var(--text-4)' : overdue ? 'var(--overdue)' : 'var(--primary)'
  const draggable = !!drag && !task.deleted && !dragDisabled

  // Phone list rows: swipe left for date / move / delete, swipe right for complete / pin.
  const phone = usePhone()
  const swipeable = phone && touch && draggable && !!drag?.flipRows && task.status === 0
  const [pop, setPop] = useState<{ kind: 'date' | 'move'; anchor: Anchor; snap: ReturnType<typeof getData> } | null>(null)
  const actions: Record<SwipeSide, SwipeAction[]> = {
    end: [
      { id: 'date', label: 'tasks.swipe.date', icon: 'calendar', color: 'var(--swipe-blue)', run: (a) => setPop({ kind: 'date', anchor: a, snap: getData() }) },
      { id: 'move', label: 'tasks.swipe.move', icon: 'move', color: 'var(--swipe-orange)', run: (a) => setPop({ kind: 'move', anchor: a, snap: getData() }) },
      { id: 'delete', label: 'common.delete', icon: 'trash', color: 'var(--swipe-red)', run: () => deleteTask(task.id) },
    ],
    start: [
      { id: 'complete', label: 'tasks.swipe.complete', icon: 'check', color: 'var(--swipe-green)', run: () => toggleWithMotion(task.id) },
      {
        id: 'pin',
        label: task.pinned ? 'shell.task.unpin' : 'shell.task.pin',
        icon: 'pin',
        color: 'var(--swipe-orange)',
        run: () => {
          const snap = getData()
          updateTask(task.id, { pinned: !task.pinned })
          toast(t(task.pinned ? 'tasks.swipe.unpinned' : 'tasks.swipe.pinned'), snap)
        },
      },
    ],
  }
  const rowAnchor = () => (swipe.rowRef.current ? anchorOf(swipe.rowRef.current) : { x: 0, y: 0 })
  const swipe = useRowSwipe({ id: task.id, enabled: swipeable, count: { start: 2, end: 3 }, onFull: (sd) => actions[sd][0].run(rowAnchor()) })
  useLayoutEffect(() => {
    const row = swipe.rowRef.current
    const acts = swipe.actsRef.current
    if (!row || !acts) return
    acts.style.cssText = `top:${row.offsetTop}px;left:${row.offsetLeft}px;width:${row.offsetWidth}px;height:${row.offsetHeight}px`
  }, [swipe.side])

  const closePop = () => {
    if (pop?.kind === 'date') {
      const before = pop.snap.tasks.find((x) => x.id === task.id)
      const now = getData().tasks.find((x) => x.id === task.id)
      if (before && now && (['dueDate', 'dueTime', 'reminder', 'repeat'] as const).some((k) => JSON.stringify(before[k]) !== JSON.stringify(now[k]))) toast(t('tasks.swipe.dateChanged'), pop.snap)
    }
    setPop(null)
  }

  const row = (
    <div
      ref={swipe.rowRef}
      className={'task-row' + (selected ? ' selected' : '') + (done && !phase ? ' done' : '') + (phase ? ' is-' + phase + 'ing' : '') + (fold ? ' has-children' : '') + (swipeable ? ' swipeable' : '')}
      style={list?.color && depth === 0 ? ({ '--list-c': list.color } as CSSProperties) : undefined}
      onPointerDown={
        draggable
          ? (e) => {
              const wasOpen = !!swipe.side
              swipe.handlers.onPointerDown(e)
              if (!wasOpen) drag!.start(e, task, e.currentTarget)
            }
          : undefined
      }
      onPointerMove={swipeable ? swipe.handlers.onPointerMove : undefined}
      onPointerUp={swipeable ? swipe.handlers.onPointerUp : undefined}
      onPointerCancel={swipeable ? swipe.handlers.onPointerCancel : undefined}
      onClick={() => {
        if (swipe.takeClick()) return
        setUI({ selectedTaskId: task.id })
      }}
      onContextMenu={(e) => openTaskMenu(e, task.id)}
      data-task-id={task.id}
      data-flip={drag?.flipRows && !dragDisabled ? task.id : undefined}
      data-dnd-row={draggable ? task.id : undefined}
      data-depth={depth}
    >
      {fold ? (
        <button
          className={'task-fold' + (fold.folded ? ' folded' : '')}
          aria-label={fold.folded ? t('tasks.row.showSubtasks') : t('tasks.row.hideSubtasks')}
          aria-expanded={!fold.folded}
          onClick={(e) => {
            e.stopPropagation()
            fold.toggle()
          }}
        >
          <Icon name="chevronDown" size={14} className="chev" />
        </button>
      ) : (
        draggable && (
          <span className="task-drag" aria-hidden>
            <Icon name="drag" size={14} stroke={2.6} />
          </span>
        )
      )}
      <Checkbox task={task} />
      <div className="task-main">
        <div className="task-title-wrap">
          {touch ? (
            <span className={'task-title' + (task.title ? '' : ' empty')}>{task.title || t('common.untitled')}</span>
          ) : (
            <input
              className="task-title"
              value={task.title}
              placeholder={t('common.untitled')}
              readOnly={!!task.deleted}
              onFocus={() => setUI({ selectedTaskId: task.id })}
              onChange={(e) => updateTask(task.id, { title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
              }}
            />
          )}
          {phase && (
            <span className="task-strike" aria-hidden>
              <span>{task.title || t('common.untitled')}</span>
            </span>
          )}
        </div>
        {data.settings.showDetails && notes && <div className="task-notes">{notes}</div>}
        <div className="task-meta">
          {task.pinned && <Icon name="pin" size={13} className="meta-ic meta-pin" />}
          {task.subtasks.length > 0 && (
            <span className="meta-ic meta-sub" title={t('tasks.row.subtasks')}>
              <Icon name="subtask" size={13} /> {subDone}/{task.subtasks.length}
            </span>
          )}
          {task.content.trim() && <Icon name="list" size={13} className="meta-ic" />}
          {task.repeat && <Icon name="repeat" size={13} className="meta-ic" />}
          {task.reminder != null && <Icon name="bell" size={13} className="meta-ic" />}
          {task.tags.map((tg) => {
            const c = data.tags.find((x) => x.name === tg)?.color
            return (
              <span key={tg} className="tag-pill" style={c ? { background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c } : undefined}>
                {tg}
              </span>
            )
          })}
          {showList && (
            <span className="task-list-name">
              {list?.color && <i style={{ background: list.color }} />}
              {list?.name ?? t('common.list.inbox')}
            </span>
          )}
          {task.dueDate && (
            <span className="task-date" style={{ color: dateColor }}>
              {dueLabel(task)}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  if (!swipeable && !pop) return row
  const side = swipe.side
  return (
    <>
      {side && (
        <div ref={swipe.actsRef} className={'swipe-acts swipe-' + side} style={{ background: actions[side][0].color }}>
          {actions[side].map((a) => (
            <button
              key={a.id}
              className={'swipe-btn swipe-' + a.id}
              style={{ background: a.color }}
              aria-label={t(a.label)}
              title={t(a.label)}
              onClick={(e) => {
                e.stopPropagation()
                const anchor = anchorOf(e.currentTarget)
                swipe.close()
                a.run(anchor)
              }}
            >
              <Icon name={a.icon} size={22} stroke={2} />
            </button>
          ))}
        </div>
      )}
      {row}
      {pop?.kind === 'date' && (
        <DatePicker
          anchor={pop.anchor}
          value={{ dueDate: task.dueDate, dueTime: task.dueTime, reminder: task.reminder, repeat: task.repeat }}
          onChange={(v) => updateTask(task.id, { dueDate: v.dueDate, dueTime: v.dueTime, reminder: v.reminder ?? null, repeat: v.repeat ?? null })}
          onClose={closePop}
        />
      )}
      {pop?.kind === 'move' && (
        <Popover anchor={pop.anchor} onClose={closePop}>
          <MenuList
            onClose={closePop}
            items={[{ id: 'inbox', name: t('common.list.inbox'), color: undefined as string | undefined }, ...data.lists].map((l) => ({
              label: l.name,
              icon: l.color ? <i className="dot" style={{ background: l.color }} /> : <Icon name={l.id === 'inbox' ? 'inbox' : 'list'} size={14} />,
              checked: l.id === task.listId,
              onClick: () => moveTaskTo(task, l.id === 'inbox' ? 'inbox' : 'list:' + l.id),
            }))}
          />
        </Popover>
      )}
    </>
  )
}

interface SwipeAction {
  id: string
  label: MessageKey
  icon: string
  color: string
  run: (anchor: Anchor) => void
}
