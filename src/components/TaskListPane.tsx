import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { format } from 'date-fns'
import { deleteTask, getData, setData, setUI, toast, uid, updateList, useData, useUI } from '../store'
import type { AppData, GroupBy, SortBy, Task, TaskList, ViewPrefs } from '../types'
import { usePhone } from '../viewport'
import { defaultPrefs, groupTasks, sortTasks, tasksForView, viewDefaults, viewTitle, type Group } from '../views'
import { Icon } from './Icon'
import { maybeEnter, useExitAnimations, useLinger, withLinger } from './taskMotion'
import { anchorOf, MenuList, Popover, type Anchor, type MenuItem } from './Popover'
import { QuickAdd } from './QuickAdd'
import { PhoneQuickAdd } from './QuickAddSheet'
import { startCardDrag, startColumnDrag, startListDrag, TaskDragContext, type KanbanEnv, type ListEnv, type TaskDragApi } from './taskDnd'
import { buildTree, countTree, type TaskTree } from './taskTree'
import { TaskRow } from './TaskRow'
import './tasks.css'

const GROUP_NAMES: Record<GroupBy, string> = { date: '时间', list: '清单', priority: '优先级', tag: '标签', none: '无', section: '自定义分组' }
const SORT_NAMES: Record<SortBy, string> = { date: '时间', title: '标题', priority: '优先级', custom: '自定义' }
const NO_TREE: TaskTree = { roots: [], children: new Map() }

function MenuIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </svg>
  )
}

const toggleCollapsed = (key: string) => setUI((u) => ({ collapsed: { ...u.collapsed, [key]: !u.collapsed[key] } }))

export function TaskListPane() {
  const ui = useUI()
  const raw = useData()
  const linger = useLinger()
  // tasks whose completion is still animating are drawn in their previous state
  const data = useMemo(() => withLinger(raw, linger), [raw, linger])
  const phone = usePhone()
  const view = ui.view
  const list = view.startsWith('list:') ? data.lists.find((l) => 'list:' + l.id === view) : undefined
  const prefs: ViewPrefs = ui.prefs[view] ?? defaultPrefs(view)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const { open, done } = useMemo(() => tasksForView(view, data), [view, data])
  const groupBy: GroupBy = prefs.groupBy === 'section' && !list ? 'none' : prefs.groupBy
  const tree = useMemo(() => buildTree(sortTasks(open, prefs.sortBy)), [open, prefs.sortBy])
  const groups = useMemo(() => groupTasks(tree.roots, groupBy, data, view), [tree, groupBy, data, view])
  const title = viewTitle(view, data)
  const isTrash = view === 'trash'
  const isDoneView = view === 'completed' || view === 'wontdo'
  const canAdd = !isTrash && !isDoneView
  const showList = !view.startsWith('list:') && view !== 'inbox'
  const kanban = list?.view === 'kanban'

  const setPrefs = (p: Partial<ViewPrefs>) => setUI((u) => ({ prefs: { ...u.prefs, [view]: { ...(u.prefs[view] ?? defaultPrefs(view)), ...p } } }))
  const collapsed = (k: string) => !!ui.collapsed[view + ':' + k]

  // drag and drop: the controller reads the current grouping when the drag starts
  const env = useRef<ListEnv>({ groupBy, sortBy: prefs.sortBy, setCustomSort: () => {}, groups: new Map() })
  useLayoutEffect(() => {
    env.current = {
      groupBy,
      sortBy: prefs.sortBy,
      setCustomSort: () => setPrefs({ sortBy: 'custom' }),
      groups: new Map(groups.map((g) => [g.key, { name: g.name, patch: g.patch }])),
    }
  })
  const dnd = useMemo<TaskDragApi>(() => ({ start: (e, task, row) => startListDrag(e, task, row, env), flipRows: true }), [])
  const exitRef = useExitAnimations([view, groupBy, prefs.sortBy, kanban ? 'k' : 'l', data.settings.showCompleted].join('|'))

  // Delete / Backspace deletes the selected task
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

  return (
    <main className="list-pane">
      <header className="list-head">
        {phone ? (
          <button className="icon-btn list-head-btn" title="清单" aria-label="打开侧栏" onClick={() => setUI({ drawerOpen: true })}>
            <MenuIcon />
          </button>
        ) : (
          <button className="icon-btn list-head-btn" title={ui.sidebarHidden ? '展开侧边栏' : '收起侧边栏'} onClick={() => setUI({ sidebarHidden: !ui.sidebarHidden })}>
            <Icon name="sidebar" size={18} />
          </button>
        )}
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
          <button className="icon-btn list-head-btn" title="更多" onClick={(e) => setMenu(anchorOf(e.currentTarget))}>
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
        <Kanban list={list} data={data} sortBy={prefs.sortBy} setCustomSort={() => setPrefs({ sortBy: 'custom' })} boardRef={exitRef} />
      ) : (
        <div
          className="list-body"
          ref={exitRef}
          onClick={(e) => {
            const el = e.target as HTMLElement
            if (el === e.currentTarget || el.classList.contains('list-content')) setUI({ selectedTaskId: undefined })
          }}
        >
          <div className="list-content" key={view}>
            {canAdd && !phone && (
              <div className="list-add">
                <QuickAdd defaults={viewDefaults(view)} key={view} />
              </div>
            )}
            <TaskDragContext.Provider value={dnd}>
              {groups.map((g) =>
                g.tasks.length === 0 && groupBy !== 'section' ? null : (
                  <GroupSection key={g.key} g={g} tree={tree} listId={list?.id} showList={showList} collapsed={collapsed(g.key)} onToggle={() => toggleCollapsed(view + ':' + g.key)} keep={groupBy === 'section' && !!g.patch?.sectionId} />
                ),
              )}
            </TaskDragContext.Provider>
            {isTrash && open.length > 0 && <TrashHint />}
            {(data.settings.showCompleted || isDoneView) && done.length > 0 && <DoneSection tasks={done} showList={showList || isDoneView} grouped={isDoneView} view={view} />}
            {open.length === 0 && (done.length === 0 || (!data.settings.showCompleted && !isDoneView)) && <EmptyState view={view} />}
          </div>
        </div>
      )}
      {phone && canAdd && <PhoneQuickAdd defaults={kanban && list ? { listId: list.id } : viewDefaults(view)} />}
    </main>
  )
}

const getUIId = () => {
  // the selected row (the key handler ignores keys typed into inputs)
  const sel = document.querySelector('.task-row.selected')
  return sel?.getAttribute('data-task-id') ?? undefined
}

function sectionMenu(e: React.MouseEvent, listId: string | undefined, g: Pick<Group, 'patch'>) {
  if (!listId || !g.patch?.sectionId) return
  e.preventDefault()
  setUI({ menu: { x: e.clientX, y: e.clientY, kind: 'section', id: listId + '/' + g.patch.sectionId } })
}

/** A task with its subtasks (indented below it, foldable). New tasks grow in from the top. */
function TaskNode({ task, tree, depth, showList }: { task: Task; tree: TaskTree; depth: number; showList: boolean }) {
  const ui = useUI()
  const ref = useRef<HTMLDivElement>(null)
  const kids = tree.children.get(task.id)
  const key = 'task:' + task.id
  const folded = !!ui.collapsed[key]
  useLayoutEffect(() => maybeEnter(task.id, ref.current), [task.id])
  return (
    <div className="task-node" ref={ref} data-exit={task.id} data-linger-node={task.id}>
      <TaskRow task={task} showList={showList} depth={depth} fold={kids?.length ? { folded, toggle: () => toggleCollapsed(key) } : undefined} />
      {kids && kids.length > 0 && <Children tasks={kids} tree={tree} depth={depth + 1} showList={showList} folded={folded} />}
    </div>
  )
}

function Children({ tasks, tree, depth, showList, folded }: { tasks: Task[]; tree: TaskTree; depth: number; showList: boolean; folded: boolean }) {
  return (
    <div className={'task-children' + (folded ? ' collapsed' : '')} data-collapsed={folded || undefined}>
      <div className="task-children-inner" inert={folded || undefined}>
        {tasks.map((c) => (
          <TaskNode key={c.id} task={c} tree={tree} depth={depth} showList={showList} />
        ))}
      </div>
    </div>
  )
}

function GroupSection({ g, tree, listId, showList, collapsed, onToggle, keep }: { g: Group; tree: TaskTree; listId?: string; showList: boolean; collapsed: boolean; onToggle: () => void; keep: boolean }) {
  return (
    <section className="group" data-group={g.key} data-exit={'group:' + g.key} data-keep={keep || undefined}>
      {g.name && (
        <div className={'group-head' + (collapsed ? ' is-collapsed' : '')} data-group-head={g.key} onClick={onToggle} onContextMenu={(e) => sectionMenu(e, listId, g)}>
          <Icon name="chevronDown" size={14} className="chev" />
          <span className={g.overdue ? 'overdue' : ''}>{g.name}</span>
          <span className="group-count">{countTree(g.tasks, tree.children)}</span>
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
      <div className={'group-body' + (collapsed ? ' collapsed' : '')} data-collapsed={collapsed || undefined}>
        <div className="group-inner" inert={collapsed || undefined}>
          {g.tasks.map((t) => (
            <TaskNode key={t.id} task={t} tree={tree} depth={0} showList={showList} />
          ))}
        </div>
      </div>
    </section>
  )
}

function DoneSection({ tasks, showList, grouped, view }: { tasks: Task[]; showList: boolean; grouped: boolean; view: string }) {
  const ui = useUI()
  const key = view + ':__done'
  const isCollapsed = !!ui.collapsed[key]
  if (grouped) {
    // the completed / won't-do views group by completion day
    const byDay = new Map<string, Task[]>()
    for (const t of tasks) {
      const k = t.completedAt ? format(new Date(t.completedAt), 'yyyy-MM-dd') : '—'
      if (!byDay.has(k)) byDay.set(k, [])
      byDay.get(k)!.push(t)
    }
    return (
      <>
        {[...byDay].map(([day, ts]) => (
          <section className="group" key={day} data-group={'done:' + day} data-done data-exit={'done:' + day}>
            <div className="group-head static">
              <span>{day === format(new Date(), 'yyyy-MM-dd') ? '今天' : format(new Date(day), 'M月d日')}</span>
              <span className="group-count">{ts.length}</span>
            </div>
            <div className="group-inner">
              {ts.map((t) => (
                <TaskNode key={t.id} task={t} tree={NO_TREE} depth={0} showList={showList} />
              ))}
            </div>
          </section>
        ))}
      </>
    )
  }
  return (
    <section className="group group-done" data-group="__done" data-done data-exit="__done">
      <div className={'group-head' + (isCollapsed ? ' is-collapsed' : '')} onClick={() => toggleCollapsed(key)}>
        <Icon name="chevronDown" size={14} className="chev" />
        <span>已完成</span>
        <span className="group-count">{tasks.length}</span>
      </div>
      <div className={'group-body' + (isCollapsed ? ' collapsed' : '')} data-collapsed={isCollapsed || undefined}>
        <div className="group-inner" inert={isCollapsed || undefined}>
          {tasks.map((t) => (
            <TaskNode key={t.id} task={t} tree={NO_TREE} depth={0} showList={showList} />
          ))}
        </div>
      </div>
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

// ---------------- kanban ----------------
function Kanban({ list, data, sortBy, setCustomSort, boardRef }: { list: TaskList; data: AppData; sortBy: SortBy; setCustomSort: () => void; boardRef: Ref<HTMLDivElement> }) {
  const listId = list.id
  const tree = useMemo(() => buildTree(sortTasks(data.tasks.filter((t) => t.listId === listId && !t.deleted && t.status === 0), sortBy)), [data.tasks, listId, sortBy])
  const cols = [{ id: undefined as string | undefined, name: '未分组' }, ...list.sections]
  const sectionOf = (t: Task) => (t.sectionId && list.sections.some((s) => s.id === t.sectionId) ? t.sectionId : undefined)
  const env = useRef<KanbanEnv>({ listId, sortBy, setCustomSort, columns: new Map() })
  useLayoutEffect(() => {
    env.current = { listId, sortBy, setCustomSort, columns: new Map(cols.map((c) => [c.id ?? '', c.name])) }
  })
  const dnd = useMemo<TaskDragApi>(() => ({ start: (e, task, row) => startCardDrag(e, task, row, env), flipRows: false }), [])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  return (
    <div className="kanban" ref={boardRef} key={listId}>
      <TaskDragContext.Provider value={dnd}>
        {cols.map((c) => {
          const ts = tree.roots.filter((t) => sectionOf(t) === c.id)
          if (!c.id && ts.length === 0 && list.sections.length > 0) return null
          const k = c.id ?? ''
          return (
            <div key={k || 'none'} className="kanban-col" data-kanban-col={k} data-flip-col={k || 'none'}>
              <div
                className={'kanban-head' + (c.id ? ' movable' : '')}
                onPointerDown={c.id ? (e) => startColumnDrag(e, listId, c.id!) : undefined}
                onContextMenu={(e) => c.id && sectionMenu(e, listId, { patch: { sectionId: c.id } })}
              >
                <span>{c.name}</span>
                <span className="group-count">{countTree(ts, tree.children)}</span>
              </div>
              <div className="kanban-add">
                <QuickAdd defaults={{ listId, sectionId: c.id }} placeholder="+ 添加任务" compact />
              </div>
              <div className="kanban-cards">
                {ts.map((t) => (
                  <KanbanCard key={t.id} task={t} tree={tree} />
                ))}
              </div>
            </div>
          )
        })}
      </TaskDragContext.Provider>
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

function KanbanCard({ task, tree }: { task: Task; tree: TaskTree }) {
  const ui = useUI()
  const ref = useRef<HTMLDivElement>(null)
  const kids = tree.children.get(task.id)
  const key = 'task:' + task.id
  const folded = !!ui.collapsed[key]
  useLayoutEffect(() => maybeEnter(task.id, ref.current), [task.id])
  return (
    <div className="kanban-card" ref={ref} data-dnd-card={task.id} data-flip={task.id} data-exit={task.id} data-linger-node={task.id}>
      <TaskRow task={task} fold={kids?.length ? { folded, toggle: () => toggleCollapsed(key) } : undefined} />
      {kids && kids.length > 0 && (
        <TaskDragContext.Provider value={null}>
          <Children tasks={kids} tree={tree} depth={1} showList={false} folded={folded} />
        </TaskDragContext.Provider>
      )}
    </div>
  )
}
