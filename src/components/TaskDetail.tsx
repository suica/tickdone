import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { dueLabel, isOverdue } from '../dates'
import { startFocus } from '../pomo'
import { deleteTask, duplicateTask, setUI, toggleTask, uid, updateTask, useData, useUI, wontDo } from '../store'
import type { Subtask, Task } from '../types'
import { PRIORITY, priorityColor } from '../views'
import { DatePicker, reminderText, repeatText } from './DatePicker'
import { Flag, Icon } from './Icon'
import { anchorOf, MenuList, Popover, type Anchor } from './Popover'
import { Checkbox } from './TaskRow'

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

export function TaskDetail({ floating }: { floating?: boolean }) {
  const ui = useUI()
  const data = useData()
  const task = data.tasks.find((t) => t.id === ui.selectedTaskId)
  if (floating) {
    if (!task) return null
    return (
      <div className="detail-float">
        <div className="detail-float-close">
          <button className="icon-btn" onClick={() => setUI({ selectedTaskId: undefined })} title="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>
        <DetailBody task={task} key={task.id} />
      </div>
    )
  }
  return (
    <aside className="detail">
      {task ? (
        <DetailBody task={task} key={task.id} />
      ) : (
        <div className="empty" style={{ height: '100%' }}>
          <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
            <circle cx="48" cy="48" r="40" fill="var(--primary-soft)" />
            <path d="M32 50l10 10 22-24" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>点击任务标题查看详情</div>
        </div>
      )}
    </aside>
  )
}

function DetailBody({ task }: { task: Task }) {
  const data = useData()
  const [pop, setPop] = useState<{ kind: 'date' | 'prio' | 'list' | 'more' | 'tag'; anchor: Anchor } | null>(null)
  const [focusSub, setFocusSub] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const titleRef = useRef<HTMLDivElement>(null)
  const ro = !!task.deleted
  const set = (p: Partial<Task>) => !ro && updateTask(task.id, p)
  const list = data.lists.find((l) => l.id === task.listId)
  const overdue = isOverdue(task)

  // 新建的空标题任务自动聚焦标题
  useEffect(() => {
    if (!task.title) titleRef.current?.querySelector('textarea')?.focus()
  }, [])

  const setSub = (id: string, p: Partial<Subtask>) => set({ subtasks: task.subtasks.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const addSubAfter = (idx: number) => {
    const s: Subtask = { id: uid(), title: '', done: false }
    const arr = [...task.subtasks]
    arr.splice(idx + 1, 0, s)
    set({ subtasks: arr })
    setFocusSub(s.id)
  }

  const dateText = task.dueDate ? dueLabel(task) : '日期与提醒'
  const dateColor = !task.dueDate ? 'var(--text-3)' : task.status !== 0 ? 'var(--text-3)' : overdue ? 'var(--overdue)' : 'var(--primary)'

  return (
    <div className="detail-inner">
      {ro && (
        <div className="detail-banner">
          该任务在垃圾桶中
          <button onClick={() => updateTask(task.id, { deleted: false })}>恢复</button>
          <button className="danger" onClick={() => deleteTask(task.id)}>
            永久删除
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
        <button className="icon-btn" title="优先级" disabled={ro} onClick={(e) => setPop({ kind: 'prio', anchor: anchorOf(e.currentTarget) })}>
          <Flag color={priorityColor(task.priority)} size={17} />
        </button>
      </div>

      <div className="detail-scroll">
        <div ref={titleRef}>
          <AutoTextarea
            className={'detail-title' + (task.status !== 0 ? ' done' : '')}
            value={task.title}
            placeholder="准备做什么？"
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

        {task.subtasks.length > 0 && (
          <div className="subtasks">
            {task.subtasks.map((s, i) => (
              <div className={'subtask' + (s.done ? ' done' : '')} key={s.id}>
                <span className={'checkbox sm' + (s.done ? ' checked' : '')} onClick={() => setSub(s.id, { done: !s.done })}>
                  {s.done && <Icon name="check" size={10} stroke={3} />}
                </span>
                <input
                  value={s.title}
                  autoFocus={focusSub === s.id}
                  placeholder="子任务"
                  readOnly={ro}
                  onChange={(e) => setSub(s.id, { title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      addSubAfter(i)
                    } else if (e.key === 'Backspace' && !s.title) {
                      e.preventDefault()
                      set({ subtasks: task.subtasks.filter((x) => x.id !== s.id) })
                      const prev = task.subtasks[i - 1]
                      if (prev) setFocusSub(prev.id)
                    }
                  }}
                />
                <button className="subtask-del" onClick={() => set({ subtasks: task.subtasks.filter((x) => x.id !== s.id) })}>
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <AutoTextarea className="detail-content" value={task.content} placeholder="描述" readOnly={ro} onChange={(v) => set({ content: v })} />

        {!ro && (
          <button className="detail-addsub" onClick={() => addSubAfter(task.subtasks.length - 1)}>
            <Icon name="plus" size={14} /> 添加子任务
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
          <span>{list?.name ?? '收件箱'}</span>
        </button>
        <div style={{ flex: 1 }} />
        {!ro && (
          <>
            <button className="icon-btn" title="标签" onClick={(e) => setPop({ kind: 'tag', anchor: anchorOf(e.currentTarget) })}>
              <Icon name="tag" size={16} />
            </button>
            <button className="icon-btn" title="开始专注" onClick={() => { startFocus(task.id); setUI({ module: 'pomo' }) }}>
              <Icon name="pomo" size={17} />
            </button>
          </>
        )}
        <button className="icon-btn" title="更多" onClick={(e) => setPop({ kind: 'more', anchor: anchorOf(e.currentTarget) })}>
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
                title={p.name}
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
            items={[{ id: 'inbox', name: '收件箱', color: undefined as string | undefined }, ...data.lists].map((l) => ({
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
              placeholder="输入标签"
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
                  <span className="menu-label">创建标签「{tagInput}」</span>
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
                    { label: '恢复', icon: <Icon name="restore" size={15} />, onClick: () => updateTask(task.id, { deleted: false }) },
                    { label: '永久删除', icon: <Icon name="trash" size={15} />, danger: true, onClick: () => deleteTask(task.id) },
                  ]
                : [
                    { label: '添加子任务', icon: <Icon name="subtask" size={15} />, onClick: () => addSubAfter(task.subtasks.length - 1) },
                    { label: task.pinned ? '取消置顶' : '置顶', icon: <Icon name="pin" size={15} />, onClick: () => set({ pinned: !task.pinned }) },
                    { label: task.status === -1 ? '取消放弃' : '放弃', icon: <Icon name="wontdo" size={15} />, onClick: () => (task.status === -1 ? set({ status: 0, completedAt: undefined }) : wontDo(task.id)) },
                    { label: '开始专注', icon: <Icon name="pomo" size={15} />, onClick: () => { startFocus(task.id); setUI({ module: 'pomo' }) } },
                    { label: '创建副本', icon: <Icon name="copy" size={15} />, onClick: () => duplicateTask(task.id) },
                    { label: task.status === 2 ? '标记为未完成' : '标记为已完成', icon: <Icon name="check" size={15} />, hint: 'Ctrl+Enter', onClick: () => toggleTask(task.id) },
                    { divider: true },
                    { label: '删除', icon: <Icon name="trash" size={15} />, danger: true, onClick: () => deleteTask(task.id) },
                  ]
            }
          />
        </Popover>
      )}
      <div className="detail-meta">
        创建于 {format(task.createdAt, 'yyyy年M月d日 HH:mm')}
        {task.completedAt && task.status !== 0 && ` · ${task.status === 2 ? '完成' : '放弃'}于 ${format(task.completedAt, 'M月d日 HH:mm')}`}
      </div>
    </div>
  )
}
