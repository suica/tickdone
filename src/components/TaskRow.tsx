import { useContext, type CSSProperties, type MouseEvent } from 'react'
import { dayDiff, dueLabel, isOverdue } from '../dates'
import { setUI, updateTask, useData, useUI } from '../store'
import type { Task } from '../types'
import { useMedia } from '../viewport'
import { priorityColor } from '../views'
import { Icon } from './Icon'
import { toggleWithMotion, useLinger } from './taskMotion'
import { TaskDragContext } from './taskDnd'

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
}

export function TaskRow({ task, showList, depth = 0, fold }: Props) {
  const ui = useUI()
  const data = useData()
  const drag = useContext(TaskDragContext)
  const phase = useLinger().get(task.id)?.phase
  // On touch screens the title is plain text: a tap opens the task instead of starting to edit it.
  const touch = useMedia('(pointer: coarse)')
  const selected = ui.selectedTaskId === task.id
  const list = data.lists.find((l) => l.id === task.listId)
  const overdue = isOverdue(task) && !phase
  const done = (task.status !== 0 && phase !== 'uncheck') || phase === 'check'
  const subDone = task.subtasks.filter((s) => s.done).length
  const dateColor = done ? 'var(--text-4)' : overdue ? 'var(--overdue)' : task.dueDate && dayDiff(task.dueDate) <= 1 ? 'var(--primary)' : 'var(--text-3)'
  const draggable = !!drag && !task.deleted

  return (
    <div
      className={'task-row' + (selected ? ' selected' : '') + (done && !phase ? ' done' : '') + (phase ? ' is-' + phase + 'ing' : '') + (fold ? ' has-children' : '')}
      onPointerDown={draggable ? (e) => drag!.start(e, task, e.currentTarget) : undefined}
      onClick={() => setUI({ selectedTaskId: task.id })}
      onContextMenu={(e) => openTaskMenu(e, task.id)}
      data-task-id={task.id}
      data-flip={drag?.flipRows ? task.id : undefined}
      data-dnd-row={draggable ? task.id : undefined}
      data-depth={depth}
    >
      {fold ? (
        <button
          className={'task-fold' + (fold.folded ? ' folded' : '')}
          aria-label={fold.folded ? '展开子任务' : '收起子任务'}
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
            <span className={'task-title' + (task.title ? '' : ' empty')}>{task.title || '无标题'}</span>
          ) : (
            <input
              className="task-title"
              value={task.title}
              placeholder="无标题"
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
              <span>{task.title || '无标题'}</span>
            </span>
          )}
        </div>
        <div className="task-meta">
          {task.pinned && <Icon name="pin" size={13} className="meta-ic" />}
          {task.subtasks.length > 0 && (
            <span className="meta-ic meta-sub" title="子任务">
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
              {list?.name ?? '收件箱'}
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
}
