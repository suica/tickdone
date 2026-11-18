import { useState, type DragEvent, type MouseEvent } from 'react'
import { dayDiff, dueLabel, isOverdue } from '../dates'
import { getData, setUI, toggleTask, updateTask, useData, useUI } from '../store'
import type { Task } from '../types'
import { priorityColor } from '../views'
import { Icon } from './Icon'

export function Checkbox({ task, onToggle }: { task: Task; onToggle?: () => void }) {
  const color = priorityColor(task.priority)
  const cls = task.status === 2 ? ' checked' : task.status === -1 ? ' wontdo' : ''
  return (
    <span
      className={'checkbox' + cls}
      style={task.status === 0 ? ({ '--cb': color, '--cb-bg': task.priority ? `color-mix(in srgb, ${color} 8%, transparent)` : undefined } as React.CSSProperties) : undefined}
      role="checkbox"
      aria-checked={task.status === 2}
      onClick={(e) => {
        e.stopPropagation()
        if (task.deleted) return
        ;(onToggle ?? (() => toggleTask(task.id)))()
      }}
    >
      {task.status === 2 && <Icon name="check" size={12} stroke={3} />}
      {task.status === -1 && <Icon name="close" size={11} stroke={3} />}
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
  /** 拖拽到该行上方/下方时调用（列表内排序） */
  onReorder?: (dragId: string, targetId: string, after: boolean) => void
}

export function TaskRow({ task, showList, onReorder }: Props) {
  const ui = useUI()
  const data = useData()
  const [drop, setDrop] = useState<'before' | 'after' | null>(null)
  const [dragOk, setDragOk] = useState(true)
  const selected = ui.selectedTaskId === task.id
  const list = data.lists.find((l) => l.id === task.listId)
  const overdue = isOverdue(task)
  const done = task.status !== 0
  const subDone = task.subtasks.filter((s) => s.done).length
  const dateColor = done ? 'var(--text-4)' : overdue ? 'var(--overdue)' : task.dueDate && dayDiff(task.dueDate) <= 1 ? 'var(--primary)' : 'var(--text-3)'

  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData('text/task-id', task.id)
    e.dataTransfer.effectAllowed = 'move'
    document.body.classList.add('dragging-task')
  }
  const onDragOver = (e: DragEvent) => {
    if (!onReorder || !e.dataTransfer.types.includes('text/task-id')) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    setDrop(e.clientY - r.top < r.height / 2 ? 'before' : 'after')
  }
  const onDrop = (e: DragEvent) => {
    const id = e.dataTransfer.getData('text/task-id')
    const pos = drop
    setDrop(null)
    if (!onReorder || !id || id === task.id) return
    e.preventDefault()
    e.stopPropagation()
    onReorder(id, task.id, pos === 'after')
  }

  return (
    <div
      className={'task-row' + (selected ? ' selected' : '') + (done ? ' done' : '') + (drop ? ' drop-' + drop : '')}
      draggable={dragOk && !task.deleted}
      onDragStart={onDragStart}
      onDragEnd={() => document.body.classList.remove('dragging-task')}
      onDragOver={onDragOver}
      onDragLeave={() => setDrop(null)}
      onDrop={onDrop}
      onClick={() => setUI({ selectedTaskId: task.id })}
      onContextMenu={(e) => openTaskMenu(e, task.id)}
      data-task-id={task.id}
    >
      <span className="task-drag">
        <Icon name="drag" size={14} stroke={2.6} />
      </span>
      <Checkbox task={task} />
      <div className="task-main">
        <input
          className="task-title"
          value={task.title}
          placeholder="无标题"
          readOnly={!!task.deleted}
          onMouseEnter={() => setDragOk(false)}
          onMouseLeave={() => setDragOk(true)}
          onFocus={() => setUI({ selectedTaskId: task.id })}
          onChange={(e) => updateTask(task.id, { title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
          }}
        />
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
            const c = getData().tags.find((x) => x.name === tg)?.color
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
