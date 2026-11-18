import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { format } from 'date-fns'
import { deleteTask, getData, reorderTask, setData, setUI, toast, uid, updateList, updateTask, useData, useUI } from '../store'
import type { GroupBy, SortBy, Task, ViewPrefs } from '../types'
import { defaultPrefs, groupTasks, sortTasks, tasksForView, viewDefaults, viewTitle, type Group } from '../views'
import { Icon } from './Icon'
import { anchorOf, MenuList, Popover, type Anchor, type MenuItem } from './Popover'
import { QuickAdd } from './QuickAdd'
import { TaskRow } from './TaskRow'
import './tasks.css'

const GROUP_NAMES: Record<GroupBy, string> = { date: '时间', list: '清单', priority: '优先级', tag: '标签', none: '无', section: '自定义分组' }
const SORT_NAMES: Record<SortBy, string> = { date: '时间', title: '标题', priority: '优先级', custom: '自定义' }

export function TaskListPane() {
  const ui = useUI()
  const data = useData()
  const view = ui.view
  const list = view.startsWith('list:') ? data.lists.find((l) => 'list:' + l.id === view) : undefined
  const prefs: ViewPrefs = ui.prefs[view] ?? defaultPrefs(view)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const { open, done } = useMemo(() => tasksForView(view, data), [view, data])
  const groupBy: GroupBy = prefs.groupBy === 'section' && !list ? 'none' : prefs.groupBy
  const groups = useMemo(() => groupTasks(sortTasks(open, prefs.sortBy), groupBy, data, view), [open, prefs.sortBy, groupBy, data, view])
  const title = viewTitle(view, data)
  const isTrash = view === 'trash'
  const isDoneView = view === 'completed' || view === 'wontdo'
  const canAdd = !isTrash && !isDoneView
  const showList = !view.startsWith('list:') && view !== 'inbox'
  const kanban = list?.view === 'kanban'

  const setPrefs = (p: Partial<ViewPrefs>) => setUI((u) => ({ prefs: { ...u.prefs, [view]: { ...prefs, ...p } } }))
  const collapsed = (k: string) => !!ui.collapsed[view + ':' + k]
  const toggle = (k: string) => setUI((u) => ({ collapsed: { ...u.collapsed, [view + ':' + k]: !u.collapsed[view + ':' + k] } }))

  // Delete 删除选中任务
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && getUIId()) deleteTask(getUIId()!)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const addSection = () => {
    if (!list) return
    const name = prompt('分组名称', '新分组')
    if (!name) return
    updateList(list.id, { sections: [...list.sections, { id: uid(), name }] })
    if (prefs.groupBy !== 'section') setPrefs({ groupBy: 'section' })
  }

  const menuItems: MenuItem[] = [
    ...(list
      ? [
          { label: kanban ? '切换为列表视图' : '切换为看板视图', icon: <Icon name={kanban ? 'list' : 'kanban'} size={15} />, onClick: () => updateList(list.id, { view: kanban ? 'list' : 'kanban' }) },
          { label: '添加分组', icon: <Icon name="plus" size={15} />, onClick: addSection },
          { divider: true },
        ]
      : []),
    {
      label: '分组',
      icon: <Icon name="matrix" size={15} />,
      hint: GROUP_NAMES[groupBy],
      children: (list ? (['section', 'date', 'priority', 'tag', 'none'] as GroupBy[]) : (['date', 'list', 'priority', 'tag', 'none'] as GroupBy[])).map((g) => ({
        label: GROUP_NAMES[g],
        checked: g === groupBy,
        onClick: () => setPrefs({ groupBy: g }),
      })),
    },
    {
      label: '排序',
      icon: <Icon name="sort" size={15} />,
      hint: SORT_NAMES[prefs.sortBy],
      children: (['date', 'title', 'priority', 'custom'] as SortBy[]).map((s) => ({ label: SORT_NAMES[s], checked: s === prefs.sortBy, onClick: () => setPrefs({ sortBy: s }) })),
    },
    { divider: true },
    {
      label: data.settings.showCompleted ? '隐藏已完成' : '显示已完成',
      icon: <Icon name={data.settings.showCompleted ? 'eyeOff' : 'eye'} size={15} />,
      onClick: () => setData((d) => ({ ...d, settings: { ...d.settings, showCompleted: !d.settings.showCompleted } })),
    },
    ...(list ? [{ divider: true }, { label: '编辑清单', icon: <Icon name="edit" size={15} />, onClick: () => setUI({ dialog: { kind: 'list', id: list.id } }) }] : []),
  ]

  const onReorder = (g: Group) => (dragId: string, targetId: string, after: boolean) => {
    const patch = { ...(g.patch ?? {}) }
    if (prefs.sortBy !== 'custom') setPrefs({ sortBy: 'custom' })
    reorderTask(dragId, targetId, after, patch)
  }
  const dropOnGroup = (g: Group) => (e: DragEvent) => {
    const id = e.dataTransfer.getData('text/task-id')
    if (!id || !g.patch) return
    e.preventDefault()
    updateTask(id, g.patch)
  }

  return (
    <main className="list-pane">
      <header className="list-head">
        <button className="icon-btn" title={ui.sidebarHidden ? '展开侧边栏' : '收起侧边栏'} onClick={() => setUI({ sidebarHidden: !ui.sidebarHidden })}>
          <Icon name="sidebar" size={18} />
        </button>
        <h1>{title}</h1>
        <div style={{ flex: 1 }} />
        {isTrash && open.length > 0 && (
          <button
            className="btn"
            style={{ height: 28 }}
            onClick={() => {
              if (!confirm('确定清空垃圾桶？此操作无法撤销')) return
              const snap = getData()
              setData((d) => ({ ...d, tasks: d.tasks.filter((t) => !t.deleted) }))
              toast('垃圾桶已清空', snap)
            }}
          >
            清空
          </button>
        )}
        {!isTrash && !isDoneView && (
          <button className="icon-btn" title="更多" onClick={(e) => setMenu(anchorOf(e.currentTarget))}>
            <Icon name="more" size={20} stroke={2.6} />
          </button>
        )}
      </header>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <MenuList items={menuItems} onClose={() => setMenu(null)} />
        </Popover>
      )}

      {kanban && list ? (
        <Kanban listId={list.id} />
      ) : (
        <div className="list-body" onClick={(e) => e.target === e.currentTarget && setUI({ selectedTaskId: undefined })}>
          {canAdd && (
            <div className="list-add">
              <QuickAdd defaults={viewDefaults(view)} key={view} />
            </div>
          )}
          {groups.map((g) =>
            g.tasks.length === 0 && groupBy !== 'section' ? null : (
              <section key={g.key} className="group" onDragOver={(e) => g.patch && e.preventDefault()} onDrop={dropOnGroup(g)}>
                {g.name && (
                  <div className="group-head" onClick={() => toggle(g.key)} onContextMenu={(e) => sectionMenu(e, list?.id, g)}>
                    <Icon name={collapsed(g.key) ? 'chevronRight' : 'chevronDown'} size={14} />
                    <span className={g.overdue ? 'overdue' : ''}>{g.name}</span>
                    <span className="group-count">{g.tasks.length}</span>
                    {g.overdue && (
                      <button
                        className="group-action"
                        onClick={(e) => {
                          e.stopPropagation()
                          const snap = getData()
                          const today = format(new Date(), 'yyyy-MM-dd')
                          setData((d) => ({ ...d, tasks: d.tasks.map((t) => (g.tasks.some((x) => x.id === t.id) ? { ...t, dueDate: today } : t)) }))
                          toast('已顺延到今天', snap)
                        }}
                      >
                        顺延
                      </button>
                    )}
                  </div>
                )}
                {!collapsed(g.key) && g.tasks.map((t) => <TaskRow key={t.id} task={t} showList={showList} onReorder={onReorder(g)} />)}
              </section>
            ),
          )}
          {isTrash && open.length > 0 && <TrashHint />}
          {(data.settings.showCompleted || isDoneView) && done.length > 0 && <DoneSection tasks={done} showList={showList || isDoneView} grouped={isDoneView} view={view} />}
          {open.length === 0 && (done.length === 0 || (!data.settings.showCompleted && !isDoneView)) && <EmptyState view={view} />}
        </div>
      )}
    </main>
  )
}

const getUIId = () => {
  // 仅当焦点不在输入框时，Delete 作用于选中任务
  const sel = document.querySelector('.task-row.selected')
  return sel?.getAttribute('data-task-id') ?? undefined
}

function sectionMenu(e: React.MouseEvent, listId: string | undefined, g: Group) {
  if (!listId || !g.patch?.sectionId) return
  e.preventDefault()
  setUI({ menu: { x: e.clientX, y: e.clientY, kind: 'section', id: listId + '/' + g.patch.sectionId } })
}

function DoneSection({ tasks, showList, grouped, view }: { tasks: Task[]; showList: boolean; grouped: boolean; view: string }) {
  const ui = useUI()
  const key = view + ':__done'
  const isCollapsed = !!ui.collapsed[key]
  if (grouped) {
    // 已完成 / 已放弃 视图按完成日期分组
    const byDay = new Map<string, Task[]>()
    for (const t of tasks) {
      const k = t.completedAt ? format(new Date(t.completedAt), 'yyyy-MM-dd') : '—'
      if (!byDay.has(k)) byDay.set(k, [])
      byDay.get(k)!.push(t)
    }
    return (
      <>
        {[...byDay].map(([day, ts]) => (
          <section className="group" key={day}>
            <div className="group-head static">
              <span>{day === format(new Date(), 'yyyy-MM-dd') ? '今天' : format(new Date(day), 'M月d日')}</span>
              <span className="group-count">{ts.length}</span>
            </div>
            {ts.map((t) => (
              <TaskRow key={t.id} task={t} showList={showList} />
            ))}
          </section>
        ))}
      </>
    )
  }
  return (
    <section className="group group-done">
      <div className="group-head" onClick={() => setUI((u) => ({ collapsed: { ...u.collapsed, [key]: !u.collapsed[key] } }))}>
        <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={14} />
        <span>已完成</span>
        <span className="group-count">{tasks.length}</span>
      </div>
      {!isCollapsed && tasks.map((t) => <TaskRow key={t.id} task={t} showList={showList} />)}
    </section>
  )
}

function TrashHint() {
  return <div className="trash-hint">垃圾桶中的任务可右键恢复或永久删除</div>
}

function EmptyState({ view }: { view: string }) {
  const msg: Record<string, [string, string]> = {
    today: ['今天没有任务', '享受轻松的一天，或添加新任务'],
    tomorrow: ['明天还没有安排', '提前计划，从容应对'],
    week: ['最近 7 天没有任务', '添加任务，规划你的一周'],
    completed: ['还没有已完成的任务', ''],
    wontdo: ['没有已放弃的任务', ''],
    trash: ['垃圾桶是空的', ''],
  }
  const [a, b] = msg[view] ?? ['没有任务', '添加任务，开始高效的一天']
  return (
    <div className="empty">
      <svg width="120" height="96" viewBox="0 0 120 96" fill="none">
        <rect x="22" y="14" width="76" height="68" rx="8" fill="var(--primary-soft)" />
        <rect x="34" y="30" width="10" height="10" rx="2" stroke="var(--primary)" strokeWidth="2" />
        <rect x="50" y="32" width="36" height="6" rx="3" fill="var(--primary-soft2)" />
        <rect x="34" y="50" width="10" height="10" rx="2" stroke="var(--primary)" strokeWidth="2" />
        <rect x="50" y="52" width="26" height="6" rx="3" fill="var(--primary-soft2)" />
      </svg>
      <div style={{ color: 'var(--text-2)', fontSize: 14 }}>{a}</div>
      {b && <div>{b}</div>}
    </div>
  )
}

// ---------------- 看板 ----------------
function Kanban({ listId }: { listId: string }) {
  const data = useData()
  const ui = useUI()
  const list = data.lists.find((l) => l.id === listId)!
  const prefs = ui.prefs['list:' + listId] ?? defaultPrefs('list:' + listId)
  const tasks = sortTasks(
    data.tasks.filter((t) => t.listId === listId && !t.deleted && t.status === 0),
    prefs.sortBy,
  )
  const cols = [{ id: undefined as string | undefined, name: '未分组' }, ...list.sections]
  const [over, setOver] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  return (
    <div className="kanban">
      {cols.map((c) => {
        const ts = tasks.filter((t) => (c.id ? t.sectionId === c.id : !t.sectionId || !list.sections.some((s) => s.id === t.sectionId)))
        if (!c.id && ts.length === 0 && list.sections.length > 0) return null
        const k = c.id ?? 'none'
        return (
          <div
            key={k}
            className={'kanban-col' + (over === k ? ' over' : '')}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(k)
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              setOver(null)
              const id = e.dataTransfer.getData('text/task-id')
              if (id) updateTask(id, { sectionId: c.id })
            }}
          >
            <div className="kanban-head" onContextMenu={(e) => c.id && sectionMenu(e, listId, { key: k, name: c.name, tasks: ts, patch: { sectionId: c.id } })}>
              <span>{c.name}</span>
              <span className="group-count">{ts.length}</span>
            </div>
            <div className="kanban-add">
              <QuickAdd defaults={{ listId, sectionId: c.id }} placeholder="+ 添加任务" compact />
            </div>
            <div className="kanban-cards">
              {ts.map((t) => (
                <div className="kanban-card" key={t.id}>
                  <TaskRow task={t} onReorder={(d, tg, after) => reorderTask(d, tg, after, { sectionId: c.id })} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <div className="kanban-col kanban-new">
        {adding ? (
          <input
            className="input"
            autoFocus
            placeholder="分组名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setAdding(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                updateList(listId, { sections: [...list.sections, { id: uid(), name: name.trim() }] })
                setName('')
                setAdding(false)
              }
              if (e.key === 'Escape') setAdding(false)
            }}
          />
        ) : (
          <button className="kanban-new-btn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> 添加分组
          </button>
        )}
      </div>
    </div>
  )
}
