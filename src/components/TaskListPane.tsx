import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { format, parseISO } from 'date-fns'
import { t as tr, useT, type MessageKey } from '../i18n'
import { fmtMonthDay, fmtWeekday } from '../i18n/format'
import { deleteTask, getData, setData, setUI, toast, uid, updateList, useData, useUI } from '../store'
import type { AppData, GroupBy, SortBy, Task, TaskList, ViewPrefs } from '../types'
import { usePhone } from '../viewport'
import { defaultPrefs, groupTasks, sortTasks, tasksForView, viewDefaults, type Group } from '../views'
import { Icon } from './Icon'
import { maybeEnter, useExitAnimations, useLinger, withLinger } from './taskMotion'
import { anchorOf, MenuList, Popover, type Anchor, type MenuItem } from './Popover'
import { QuickAdd } from './QuickAdd'
import { PhoneQuickAdd } from './QuickAddSheet'
import { SMART_NAME, startCardDrag, startColumnDrag, startListDrag, TaskDragContext, type KanbanEnv, type ListEnv, type TaskDragApi } from './taskDnd'
import { buildTree, countTree, type TaskTree } from './taskTree'
import { TaskRow } from './TaskRow'
import './tasks.css'

const GROUP_NAMES: Record<GroupBy, MessageKey> = {
  date: 'tasks.groupBy.date',
  list: 'tasks.groupBy.list',
  priority: 'common.priority',
  tag: 'tasks.groupBy.tag',
  none: 'tasks.groupBy.none',
  section: 'tasks.groupBy.section',
}
const SORT_NAMES: Record<SortBy, MessageKey> = { date: 'tasks.sortBy.date', title: 'tasks.sortBy.title', priority: 'common.priority', custom: 'tasks.sortBy.custom' }

/** The heading of a view: smart list name, list name or #tag. */
function viewName(view: string, d: AppData): string {
  if (SMART_NAME[view]) return tr(SMART_NAME[view])
  if (view.startsWith('list:')) return d.lists.find((l) => 'list:' + l.id === view)?.name ?? ''
  if (view.startsWith('tag:')) return '#' + view.slice(4)
  return ''
}

/** The heading of a group, from its key (see views.groupTasks); names that come from user data stay as they are. */
function groupName(g: Group, groupBy: GroupBy, d: AppData): string {
  if (g.nameKey) return tr(g.nameKey)
  if (groupBy === 'date') {
    if (g.key === '0-overdue') return tr('common.overdue')
    if (g.key === '1-today') return tr('common.today')
    if (g.key === '2-tomorrow') return tr('common.tomorrow')
    if (g.key === '3-week') return tr('common.list.next7Days')
    if (g.key === '4-later') return tr('common.later')
    if (g.key === '9-none') return tr('common.noDate')
    if (g.key.startsWith('3-') && g.patch?.dueDate) {
      const day = parseISO(g.patch.dueDate)
      return fmtMonthDay(day) + ' ' + fmtWeekday(day)
    }
  }
  if (groupBy === 'priority' && g.patch?.priority !== undefined) return tr(PRIORITY_NAME[g.patch.priority])
  if (groupBy === 'list') return g.patch?.listId === 'inbox' || !g.patch?.listId ? tr('common.list.inbox') : (d.lists.find((l) => l.id === g.patch!.listId)?.name ?? g.name)
  if (groupBy === 'tag') return g.key === '9' ? tr('tasks.group.noTag') : '#' + g.key.slice(1)
  return g.name
}
const PRIORITY_NAME: Record<number, MessageKey> = { 5: 'common.priorityGroup.high', 3: 'common.priorityGroup.medium', 1: 'common.priorityGroup.low', 0: 'common.priorityGroup.none' }
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
  const t = useT()
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
  const title = viewName(view, data)
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
      groups: new Map(groups.map((g) => [g.key, { name: groupName(g, groupBy, data), patch: g.patch }])),
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
    const name = prompt(t('tasks.section.name'), t('tasks.section.new'))
    if (!name) return
    updateList(list.id, { sections: [...list.sections, { id: uid(), name }] })
    if (prefs.groupBy !== 'section') setPrefs({ groupBy: 'section' })
  }

  const setSettings = (p: Partial<AppData['settings']>) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } }))
  // View (lists only) / grouping and sorting / what each row shows / list actions
  const menuItems: MenuItem[] = [
    ...(list
      ? [
          {
            render: (
              <div className="menu-btn-row list-view-row">
                <span className="menu-row-label">{t('tasks.menu.view')}</span>
                {(['list', 'kanban'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-view={v}
                    title={t(v === 'list' ? 'tasks.menu.viewList' : 'tasks.menu.viewKanban')}
                    aria-label={t(v === 'list' ? 'tasks.menu.viewList' : 'tasks.menu.viewKanban')}
                    aria-pressed={(list.view ?? 'list') === v}
                    onClick={() => updateList(list.id, { view: v })}
                  >
                    <Icon name={v} size={17} />
                  </button>
                ))}
              </div>
            ),
          },
          { divider: true },
        ]
      : []),
    {
      label: t('tasks.menu.groupBy'),
      icon: <Icon name="matrix" size={15} />,
      hint: t(GROUP_NAMES[groupBy]),
      children: (list ? (['section', 'date', 'priority', 'tag', 'none'] as GroupBy[]) : (['date', 'list', 'priority', 'tag', 'none'] as GroupBy[])).map((g) => ({
        label: t(GROUP_NAMES[g]),
        checked: g === groupBy,
        onClick: () => setPrefs({ groupBy: g }),
      })),
    },
    {
      label: t('tasks.menu.sortBy'),
      icon: <Icon name="sort" size={15} />,
      hint: t(SORT_NAMES[prefs.sortBy]),
      children: (['date', 'title', 'priority', 'custom'] as SortBy[]).map((s) => ({ label: t(SORT_NAMES[s]), checked: s === prefs.sortBy, onClick: () => setPrefs({ sortBy: s }) })),
    },
    { divider: true },
    { label: t('tasks.menu.showCompleted'), icon: <Icon name="check" size={15} />, checked: data.settings.showCompleted, onClick: () => setSettings({ showCompleted: !data.settings.showCompleted }) },
    { label: t('tasks.menu.showDetails'), icon: <Icon name="list" size={15} />, checked: !!data.settings.showDetails, onClick: () => setSettings({ showDetails: !data.settings.showDetails }) },
    ...(list
      ? [
          { divider: true },
          { label: t('tasks.menu.addSection'), icon: <Icon name="plus" size={15} />, onClick: addSection },
          { label: t('tasks.menu.editList'), icon: <Icon name="edit" size={15} />, onClick: () => setUI({ dialog: { kind: 'list', id: list.id } }) },
        ]
      : []),
  ]

  return (
    <main className="list-pane">
      <header className="list-head">
        {phone ? (
          <button className="icon-btn list-head-btn" title={t('tasks.header.openSidebar')} aria-label={t('tasks.header.openSidebar')} onClick={() => setUI({ drawerOpen: true })}>
            <MenuIcon />
          </button>
        ) : (
          <button className="icon-btn list-head-btn" title={t(ui.sidebarHidden ? 'tasks.header.showSidebar' : 'tasks.header.hideSidebar')} onClick={() => setUI({ sidebarHidden: !ui.sidebarHidden })}>
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
              if (!confirm(t('tasks.trash.confirmEmpty'))) return
              const snap = getData()
              setData((d) => ({ ...d, tasks: d.tasks.filter((x) => !x.deleted) }))
              toast(t('tasks.trash.emptied'), snap)
            }}
          >
            {t('tasks.trash.empty')}
          </button>
        )}
        {!isTrash && !isDoneView && (
          <button className="icon-btn list-head-btn" title={t('common.more')} onClick={(e) => setMenu(anchorOf(e.currentTarget))}>
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
                  <GroupSection key={g.key} g={g} name={groupName(g, groupBy, data)} tree={tree} listId={list?.id} showList={showList} collapsed={collapsed(g.key)} onToggle={() => toggleCollapsed(view + ':' + g.key)} keep={groupBy === 'section' && !!g.patch?.sectionId} />
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

function GroupSection({ g, name, tree, listId, showList, collapsed, onToggle, keep }: { g: Group; name: string; tree: TaskTree; listId?: string; showList: boolean; collapsed: boolean; onToggle: () => void; keep: boolean }) {
  const t = useT()
  return (
    <section className="group" data-group={g.key} data-exit={'group:' + g.key} data-keep={keep || undefined}>
      {name && (
        <div className={'group-head' + (collapsed ? ' is-collapsed' : '')} data-group-head={g.key} onClick={onToggle} onContextMenu={(e) => sectionMenu(e, listId, g)}>
          <Icon name="chevronDown" size={14} className="chev" />
          {g.pinned && <Icon name="pin" size={14} className="group-pin" />}
          <span className={g.overdue ? 'overdue' : ''}>{name}</span>
          <span className="group-count">{countTree(g.tasks, tree.children)}</span>
          {g.overdue && (
            <button
              className="group-action"
              onClick={(e) => {
                e.stopPropagation()
                const snap = getData()
                const today = format(new Date(), 'yyyy-MM-dd')
                setData((d) => ({ ...d, tasks: d.tasks.map((x) => (g.tasks.some((y) => y.id === x.id) ? { ...x, dueDate: today } : x)) }))
                toast(t('tasks.overdue.postponed'), snap)
              }}
            >
              {t('tasks.overdue.postpone')}
            </button>
          )}
        </div>
      )}
      <div className={'group-body' + (collapsed ? ' collapsed' : '')} data-collapsed={collapsed || undefined}>
        <div className="group-inner" inert={collapsed || undefined}>
          {g.tasks.map((x) => (
            <TaskNode key={x.id} task={x} tree={tree} depth={0} showList={showList} />
          ))}
        </div>
      </div>
    </section>
  )
}

function DoneSection({ tasks, showList, grouped, view }: { tasks: Task[]; showList: boolean; grouped: boolean; view: string }) {
  const t = useT()
  const ui = useUI()
  const key = view + ':__done'
  const isCollapsed = !!ui.collapsed[key]
  if (grouped) {
    // the completed / won't-do views group by completion day
    const byDay = new Map<string, Task[]>()
    for (const x of tasks) {
      const k = x.completedAt ? format(new Date(x.completedAt), 'yyyy-MM-dd') : '—'
      if (!byDay.has(k)) byDay.set(k, [])
      byDay.get(k)!.push(x)
    }
    return (
      <>
        {[...byDay].map(([day, ts]) => (
          <section className="group" key={day} data-group={'done:' + day} data-done data-exit={'done:' + day}>
            <div className="group-head static">
              <span>{day === format(new Date(), 'yyyy-MM-dd') ? t('common.today') : day === '—' ? t('common.noDate') : fmtMonthDay(parseISO(day))}</span>
              <span className="group-count">{ts.length}</span>
            </div>
            <div className="group-inner">
              {ts.map((x) => (
                <TaskNode key={x.id} task={x} tree={NO_TREE} depth={0} showList={showList} />
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
        <span>{t('common.list.completed')}</span>
        <span className="group-count">{tasks.length}</span>
      </div>
      <div className={'group-body' + (isCollapsed ? ' collapsed' : '')} data-collapsed={isCollapsed || undefined}>
        <div className="group-inner" inert={isCollapsed || undefined}>
          {tasks.map((x) => (
            <TaskNode key={x.id} task={x} tree={NO_TREE} depth={0} showList={showList} />
          ))}
        </div>
      </div>
    </section>
  )
}

function TrashHint() {
  const t = useT()
  return <div className="trash-hint">{t('tasks.trash.hint')}</div>
}

const EMPTY: Record<string, [MessageKey, MessageKey?]> = {
  today: ['tasks.empty.today', 'tasks.empty.todayHint'],
  tomorrow: ['tasks.empty.tomorrow', 'tasks.empty.tomorrowHint'],
  week: ['tasks.empty.week', 'tasks.empty.weekHint'],
  completed: ['tasks.empty.completed'],
  wontdo: ['tasks.empty.wontDo'],
  trash: ['tasks.empty.trash'],
}

function EmptyState({ view }: { view: string }) {
  const t = useT()
  const [ka, kb] = EMPTY[view] ?? ['tasks.empty.default', 'tasks.empty.defaultHint']
  const a = t(ka)
  const b = kb ? t(kb) : ''
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
  const t = useT()
  const listId = list.id
  const tree = useMemo(() => buildTree(sortTasks(data.tasks.filter((x) => x.listId === listId && !x.deleted && x.status === 0), sortBy)), [data.tasks, listId, sortBy])
  const cols = [{ id: undefined as string | undefined, name: t('tasks.section.none') }, ...list.sections]
  const sectionOf = (x: Task) => (x.sectionId && list.sections.some((s) => s.id === x.sectionId) ? x.sectionId : undefined)
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
          const ts = tree.roots.filter((x) => sectionOf(x) === c.id)
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
                <QuickAdd defaults={{ listId, sectionId: c.id }} placeholder={t('tasks.quickAdd.kanbanPlaceholder')} compact />
              </div>
              <div className="kanban-cards">
                {ts.map((x) => (
                  <KanbanCard key={x.id} task={x} tree={tree} />
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
            placeholder={t('tasks.section.name')}
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
            <Icon name="plus" size={16} /> {t('tasks.menu.addSection')}
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
