import { memo, useContext, useLayoutEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import { dueLabel, isOverdue } from '../dates'
import { useT, type MessageKey } from '../i18n'
import { deleteTask, getData, setUI, toast, updateTask, useDataSel, useUISel, type UIState } from '../store'
import { markdownToText } from '../markdown'
import type { Task } from '../types'
import { useMedia, usePhone } from '../viewport'
import { activeLists, isLocked, priorityColor } from '../views'
import { DatePicker } from './DatePicker'
import { Icon } from './Icon'
import { anchorOf, MenuList, Popover, type Anchor } from './Popover'
import { useRowSwipe, type SwipeSide } from './rowSwipe'
import { justLanded, toggleWithMotion, useLingerOf } from './taskMotion'
import { moveTaskTo, TaskDragContext } from './taskDnd'
import { clickRow } from './batchActions'
import { menuPoint } from '../menuPoint'

const PRIORITY_LEVEL: Record<Task['priority'], MessageKey> = { 0: 'common.priority.none', 1: 'common.priority.low', 3: 'common.priority.medium', 5: 'common.priority.high' }

/** Check mark drawn with pathLength 1 so it can be stroked in. */
function Tick() {
  return (
    <svg className="cb-tick" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/** The burst around a checkbox that was just ticked: a ring and a few sparks in the checkbox colour. */
const SPARKS = [0, 60, 120, 180, 240, 300]
function Burst() {
  return (
    <span className="cb-burst" aria-hidden>
      {SPARKS.map((a) => (
        <i key={a} style={{ '--a': a + 'deg' } as CSSProperties} />
      ))}
    </span>
  )
}

/**
 * The task checkbox. It presses in under the pointer; completing fills it with the priority colour, strokes the
 * tick in, pops and sends out a small burst; un-completing plays it backwards. Batch changes skip the burst.
 */
export function Checkbox({ task, onToggle }: { task: Task; onToggle?: () => void }) {
  const t = useT()
  const lg = useLingerOf(task.id)
  const phase = lg?.phase
  const color = priorityColor(task.priority)
  const cls = phase === 'check' ? ' cb-checking' : phase === 'uncheck' ? ' cb-unchecking' : task.status === 2 ? ' checked' : task.status === -1 ? ' wontdo' : ''
  const tinted = task.status === 0 || !!phase
  // a row that just moved into the completed group fades its colour to grey
  const landing = !phase && task.status === 2 && task.priority > 0 && justLanded(task.id)
  return (
    <span
      className={'checkbox cb' + cls + (lg?.light ? ' cb-light' : '')}
      style={tinted || landing ? ({ '--cb': color } as CSSProperties) : undefined}
      role="checkbox"
      title={t('tasks.row.priority', { level: t(PRIORITY_LEVEL[task.priority]) })}
      // named by the task it completes; its priority is the description
      aria-label={task.title || t('common.untitled')}
      aria-description={t('tasks.row.priority', { level: t(PRIORITY_LEVEL[task.priority]) })}
      aria-checked={phase ? phase === 'check' : task.status === 2}
      data-no-drag
      onClick={(e) => {
        e.stopPropagation()
        // tasks in the trash or in an archived list are read-only
        if (isLocked(task, getData())) return
        ;(onToggle ?? (() => toggleWithMotion(task.id)))()
      }}
    >
      {(phase || landing) && <span className={'cb-fill' + (landing ? ' cb-landing' : '')} />}
      {(phase || task.status === 2) && <Tick />}
      {phase === 'check' && !lg?.light && <Burst />}
      {task.status === -1 && !phase && <Icon name="close" size={11} stroke={3} />}
    </span>
  )
}

export function openTaskMenu(e: MouseEvent, id: string) {
  e.preventDefault()
  e.stopPropagation()
  const p = menuPoint(e)
  setUI({ menu: { x: p.x, y: p.y, kind: 'task', id }, selectedTaskId: id })
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

// What a row needs from the UI state, as bits, so a row renders again only when its own state changes.
const SEL_MULTI = 1
const SEL_ON = 2
const SEL_CURSOR = 4
const SEL_MODE = 8
function selFlags(u: UIState, id: string): number {
  const multi = u.selectMode || u.selectedIds.length > 0
  const on = multi ? u.selectedIds.includes(id) : u.selectedTaskId === id
  return (multi ? SEL_MULTI : 0) | (on ? SEL_ON : 0) | (u.selectedTaskId === id ? SEL_CURSOR : 0) | (u.selectMode ? SEL_MODE : 0)
}

/**
 * A task row. It is memoised and reads only its own part of the stores, so a change to one task (or to the
 * selection) renders that row again, not every row in the list.
 */
export const TaskRow = memo(function TaskRow({ task, showList, depth = 0, fold, dragDisabled }: Props) {
  const t = useT()
  const sel = useUISel((u) => selFlags(u, task.id))
  const lists = useDataSel((d) => d.lists)
  const tags = useDataSel((d) => d.tags)
  const showDetails = useDataSel((d) => !!d.settings.showDetails)
  const drag = useContext(TaskDragContext)
  const phase = useLingerOf(task.id)?.phase
  // On touch screens the title is plain text: a tap opens the task instead of starting to edit it.
  const touch = useMedia('(pointer: coarse)')
  // While several tasks are selected (or in selection mode) the highlight shows the selection; the keyboard
  // cursor (selectedTaskId) is shown by the focus ring.
  const multi = !!(sel & SEL_MULTI)
  const selected = !!(sel & SEL_ON)
  const cursor = !!(sel & SEL_CURSOR)
  const selectMode = !!(sel & SEL_MODE)
  const list = lists.find((l) => l.id === task.listId)
  const overdue = isOverdue(task) && !phase
  // "Show details": the start of the notes under the title, on one line
  // the preview shows the notes as plain text, without their Markdown marks
  const notes = useMemo(() => (showDetails && task.content.trim() ? markdownToText(task.content).replace(/\s+/g, ' ').trim().slice(0, 200) : ''), [task.content, showDetails])
  const done = (task.status !== 0 && phase !== 'uncheck') || phase === 'check'
  const subDone = task.subtasks.filter((s) => s.done).length
  // Every open date is blue; overdue ones are red.
  const dateColor = done ? 'var(--text-3)' : overdue ? 'var(--overdue)' : 'var(--primary)'
  const locked = isLocked(task, { lists })
  const draggable = !!drag && !locked && !dragDisabled

  // Phone list rows: swipe left for date / move / delete, swipe right for complete / pin.
  const phone = usePhone()
  const swipeable = phone && touch && draggable && !!drag?.flipRows && task.status === 0 && !selectMode
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
      className={'task-row' + (selected ? ' selected' : '') + (multi && selected ? ' multi' : '') + (cursor ? ' cursor' : '') + (done && !phase ? ' done' : '') + (phase ? ' is-' + phase + 'ing' : '') + (fold ? ' has-children' : '') + (swipeable ? ' swipeable' : '')}
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
      onMouseDown={(e) => {
        // Ctrl / ⌘ / Shift clicks select; they neither focus the title nor select text
        if (e.shiftKey || e.ctrlKey || e.metaKey || selectMode) e.preventDefault()
      }}
      onClick={(e) => {
        if (swipe.takeClick()) return
        // multi-selection belongs to the task list; elsewhere a click just opens the task
        if (!e.currentTarget.closest('.list-pane')) return setUI({ selectedTaskId: task.id })
        clickRow(task.id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey })
        // the keyboard goes on from the clicked row (unless the click went into its title)
        if (!(e.target as HTMLElement).closest('input')) e.currentTarget.focus({ preventScroll: true })
      }}
      onContextMenu={(e) => openTaskMenu(e, task.id)}
      data-task-id={task.id}
      // focusable from script (the keyboard cursor); the list makes one row the Tab stop (roving tabindex)
      tabIndex={-1}
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
      {selectMode ? (
        <span className={'sel-check' + (selected ? ' on' : '')} aria-hidden>
          <Icon name="check" size={12} stroke={3} />
        </span>
      ) : (
        <Checkbox task={task} />
      )}
      <div className="task-main">
        <div className="task-title-wrap">
          {touch ? (
            <span className={'task-title' + (task.title ? '' : ' empty')}>{task.title || t('common.untitled')}</span>
          ) : (
            <input
              className="task-title"
              value={task.title}
              placeholder={t('common.untitled')}
              readOnly={locked}
              onFocus={() => setUI({ selectedTaskId: task.id })}
              onChange={(e) => updateTask(task.id, { title: e.target.value })}
              onKeyDown={(e) => {
                // Enter / Esc leave the title; the keyboard goes on from the row
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  const row = swipe.rowRef.current
                  if (row) row.focus({ preventScroll: true })
                  else (e.target as HTMLInputElement).blur()
                }
              }}
            />
          )}
          {phase && (
            <span className="task-strike" aria-hidden>
              <span>{task.title || t('common.untitled')}</span>
            </span>
          )}
        </div>
        {showDetails && notes && <div className="task-notes">{notes}</div>}
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
            const c = tags.find((x) => x.name === tg)?.color
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
            items={[{ id: 'inbox', name: t('common.list.inbox'), color: undefined as string | undefined }, ...activeLists({ lists })].map((l) => ({
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
})

interface SwipeAction {
  id: string
  label: MessageKey
  icon: string
  color: string
  run: (anchor: Anchor) => void
}
