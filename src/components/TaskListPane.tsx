import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { flushSync } from 'react-dom'
import { format, parseISO } from 'date-fns'
import { t as tr, useT, type MessageKey } from '../i18n'
import { fmtMonthDay, fmtWeekday } from '../i18n/format'
import { archiveList, clearSelection, getData, getSelection, getUI, setData, setSelection, setUI, toast, uid, updateList, useData, useUI, useUISel } from '../store'
import { isBatch, prune, selectAll, stepSelect } from '../selection'
import type { AppData, GroupBy, Priority, SortBy, Task, TaskList, ViewPrefs } from '../types'
import { usePhone } from '../viewport'
import { defaultPrefs, groupTasks, sortTasks, tasksForView, viewDefaults, type Group } from '../views'
import { Icon } from './Icon'
import { FILTER_PREFIX, filterOf } from '../filters'
import { maybeEnter, useExitAnimations, useLinger, withLinger } from './taskMotion'
import { anchorOf, MenuList, Popover, type Anchor, type MenuItem } from './Popover'
import { QuickAdd } from './QuickAdd'
import { PhoneQuickAdd } from './QuickAddSheet'
import { SMART_NAME, startCardDrag, startColumnDrag, startListDrag, TaskDragContext, type KanbanEnv, type ListEnv, type TaskDragApi } from './taskDnd'
import { buildTree, countTree, type TaskTree } from './taskTree'
import { TaskRow } from './TaskRow'
import { Timeline } from './Timeline'
import './timeline.css'
import { BatchBar, BatchPops, type BatchPop } from './BatchPanel'
import { batchIds, completeSelected, deleteSelected, quickDate, rowEl, setListOrder, setPriority, startSelecting, visibleOrder } from './batchActions'
import { usePinnedRows, useListWindow } from './listWindow'
import './tasks.css'

const GROUP_NAMES: Record<GroupBy, MessageKey> = {
  date: 'tasks.groupBy.date',
  list: 'tasks.groupBy.list',
  priority: 'common.priority',
  tag: 'tasks.groupBy.tag',
  none: 'tasks.groupBy.none',
  section: 'tasks.groupBy.section',
}
const VIEW_NAMES: Record<TaskList['view'], MessageKey> = { list: 'tasks.menu.viewList', kanban: 'tasks.menu.viewKanban', timeline: 'tasks.menu.viewTimeline' }
const SORT_NAMES: Record<SortBy, MessageKey> = { date: 'tasks.sortBy.date', title: 'tasks.sortBy.title', priority: 'common.priority', custom: 'tasks.sortBy.custom' }

/** The heading of a view: smart list name, list name or #tag. */
function viewName(view: string, d: AppData): string {
  if (SMART_NAME[view]) return tr(SMART_NAME[view])
  if (view.startsWith('list:')) return d.lists.find((l) => 'list:' + l.id === view)?.name ?? ''
  if (view.startsWith('tag:')) return '#' + view.slice(4)
  if (view.startsWith(FILTER_PREFIX)) return filterOf(view, d)?.name ?? ''
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
  // an archived list opens read-only, as a plain list, with a banner to bring it back
  const archived = !!list?.archived
  const canAdd = !isTrash && !isDoneView && !archived
  const showList = !view.startsWith('list:') && view !== 'inbox'
  const kanban = list?.view === 'kanban' && !archived
  // The timeline needs room for its columns and edge handles; phones show the list with a note instead.
  const timelineList = list?.view === 'timeline' && !archived
  const timeline = timelineList && !phone
  const batch = isBatch(getSelection(ui))

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

  // The rows in display order, from the data (rows outside the window are not in the document): the keyboard,
  // Shift ranges, Select all and drags of a selection work from it.
  const doneShown = (data.settings.showCompleted || isDoneView) && done.length > 0 && (isDoneView || !ui.collapsed[view + ':__done'])
  const order = useMemo(() => {
    const out: string[] = []
    const walk = (x: Task) => {
      out.push(x.id)
      if (!ui.collapsed['task:' + x.id]) tree.children.get(x.id)?.forEach(walk)
    }
    for (const g of groups) if (g.tasks.length && !ui.collapsed[view + ':' + g.key]) g.tasks.forEach(walk)
    if (doneShown) for (const x of done) out.push(x.id)
    return [...new Set(out)]
  }, [groups, tree, done, doneShown, ui.collapsed, view])
  useLayoutEffect(() => {
    // the board and the timeline lay rows out their own way: their order is read from the document
    if (kanban || timeline) return
    setListOrder(() => order)
    return () => setListOrder(null)
  }, [order, kanban, timeline])

  // Rows that stay rendered outside the window: the cursor's and the dragged ones (by their top-level row).
  const dragged = usePinnedRows()
  const cursorId = ui.selectedTaskId
  const pins = useMemo(() => {
    const parent = new Map<string, string>()
    tree.children.forEach((kids, id) => kids.forEach((k) => parent.set(k.id, id)))
    const out = new Set<string>()
    for (const id of [cursorId, ...dragged]) {
      let x = id
      while (x && parent.has(x)) x = parent.get(x)
      if (x) out.add(x)
    }
    return out
  }, [tree, cursorId, dragged])

  // The keyboard in the list (see listKeys below); `d` opens the date picker on the selected rows.
  const [datePop, setDatePop] = useState<{ pop: BatchPop; ids: string[] } | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // the focus ring follows the keyboard, not the mouse
      if (NAV_KEYS.has(e.key)) document.querySelector('.list-pane')?.setAttribute('data-input', 'keys')
      listKeys(e, (ids, anchor) => setDatePop({ pop: { kind: 'date', anchor }, ids }))
    }
    const onPointer = () => document.querySelector('.list-pane')?.setAttribute('data-input', 'pointer')
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [])

  // Roving tabindex: Tab reaches the list once, on the cursor row (or the first row); arrows move inside it.
  // Rows that left the view drop out of the selection.
  useEffect(() => {
    const order = visibleOrder()
    const sel = getSelection()
    const next = prune(order, sel)
    if (next !== sel) setSelection(next)
    const rows = [...document.querySelectorAll<HTMLElement>('.list-pane .task-row[data-task-id]')]
    const cur = rows.find((r) => r.dataset.taskId === sel.cursor && order.includes(sel.cursor!)) ?? rows.find((r) => r.dataset.taskId === order[0])
    for (const r of rows) r.tabIndex = r === cur ? 0 : -1
  })

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
                {(['list', 'kanban', 'timeline'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-view={v}
                    title={t(VIEW_NAMES[v])}
                    aria-label={t(VIEW_NAMES[v])}
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
    { divider: true },
    { label: t('tasks.menu.select'), icon: <Icon name="check" size={15} />, checked: ui.selectMode, onClick: () => (ui.selectMode ? clearSelection(false) : startSelecting()) },
    ...(view.startsWith(FILTER_PREFIX) && filterOf(view, data)
      ? [
          { divider: true },
          { label: t('tasks.menu.editFilter'), icon: <Icon name="edit" size={15} />, onClick: () => setUI({ dialog: { kind: 'filter', id: view.slice(FILTER_PREFIX.length) } }) },
        ]
      : []),
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
        {!isTrash && !isDoneView && !archived && (
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

      {timeline && list ? (
        <Timeline list={list} data={data} />
      ) : kanban && list ? (
        <Kanban list={list} data={data} sortBy={prefs.sortBy} setCustomSort={() => setPrefs({ sortBy: 'custom' })} boardRef={exitRef} />
      ) : (
        <div
          className="list-body"
          data-scroller
          ref={exitRef}
          onClick={(e) => {
            const el = e.target as HTMLElement
            if (el === e.currentTarget || el.classList.contains('list-content')) {
              if (ui.selectMode) return
              setSelection({ ids: [], cursor: undefined, anchor: undefined, mode: false })
            }
          }}
        >
          <div className="list-content" key={view} data-motion-host>
            {archived && list && (
              <div className="archived-banner" role="status">
                <Icon name="archive" size={18} className="archived-banner-ic" />
                <span className="archived-banner-text">{t('tasks.archived.banner')}</span>
                <button className="btn btn-primary archived-banner-btn" onClick={() => archiveList(list.id, false)}>
                  {t('shell.menu.unarchive')}
                </button>
              </div>
            )}
            {timelineList && phone && (
              <div className="tl-phone-note" role="note">
                <Icon name="timeline" size={18} />
                <span>{t('tasks.timeline.phoneNote')}</span>
              </div>
            )}
            {canAdd && !phone && (
              <div className="list-add">
                <QuickAdd defaults={viewDefaults(view, data)} key={view} />
              </div>
            )}
            <TaskDragContext.Provider value={dnd}>
              <PinContext.Provider value={pins}>
              {groups.map((g) =>
                g.tasks.length === 0 && groupBy !== 'section' ? null : (
                  <GroupSection key={g.key} g={g} name={groupName(g, groupBy, data)} tree={tree} listId={list?.id} showList={showList} collapsed={collapsed(g.key)} onToggle={() => toggleCollapsed(view + ':' + g.key)} keep={groupBy === 'section' && !!g.patch?.sectionId} />
                ),
              )}
              </PinContext.Provider>
            </TaskDragContext.Provider>
            {isTrash && open.length > 0 && <TrashHint />}
            <PinContext.Provider value={pins}>
              {(data.settings.showCompleted || isDoneView) && done.length > 0 && <DoneSection tasks={done} showList={showList || isDoneView} grouped={isDoneView} view={view} />}
            </PinContext.Provider>
            {open.length === 0 && (done.length === 0 || (!data.settings.showCompleted && !isDoneView)) && <EmptyState view={view} />}
          </div>
        </div>
      )}
      {phone && canAdd && !batch && <PhoneQuickAdd defaults={(kanban || timelineList) && list ? { listId: list.id } : viewDefaults(view, data)} />}
      {phone && batch && <BatchBar />}
      {datePop && <BatchPops pop={datePop.pop} ids={datePop.ids} data={raw} onClose={() => setDatePop(null)} />}
    </main>
  )
}

const NAV_KEYS = new Set(['Tab', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'j', 'k', 'J', 'K'])
const PRIORITY_KEYS: Record<string, Priority> = { '1': 5, '2': 3, '3': 1, '4': 0 }

/**
 * Keys in the task list. They only act when the keyboard is in the list (on a row, or on nothing), never
 * while typing in a field or while a dialog, menu or picker is open.
 */
function listKeys(e: KeyboardEvent, openDate: (ids: string[], anchor: Anchor) => void) {
  const u = getUI()
  if (u.module !== 'tasks' || u.dialog || u.menu || e.defaultPrevented || e.isComposing) return
  if (document.querySelector('.popover, .sheet-layer, .modal-mask, .dlg-mask, .detail-sheet-layer, .qa-sheet')) return
  const el = e.target as HTMLElement
  if (el.closest('input, textarea, select, button, a, [contenteditable="true"]')) return
  if (el !== document.body && !el.closest('.list-pane')) return
  const mod = e.metaKey || e.ctrlKey
  const key = e.key
  const order = visibleOrder()
  const move = (next: ReturnType<typeof stepSelect>) => {
    e.preventDefault()
    setSelection(next)
    if (next.cursor) focusRow(next.cursor)
  }

  const lower = key.toLowerCase()
  if (!mod && !e.altKey && (key === 'ArrowDown' || key === 'ArrowUp' || lower === 'j' || lower === 'k')) {
    const down = key === 'ArrowDown' || lower === 'j'
    return move(stepSelect(order, getSelection(), down ? 1 : -1, e.shiftKey))
  }
  if (!mod && !e.altKey && (key === 'Home' || key === 'End')) return move(stepSelect(order, getSelection(), key === 'Home' ? -order.length : order.length, e.shiftKey))
  if (mod && !e.altKey && lower === 'a') {
    if (!order.length) return
    return move(selectAll(order, getSelection()))
  }

  // an archived list is read-only: only moving around works there
  if (u.view.startsWith('list:') && getData().lists.some((l) => l.archived && 'list:' + l.id === u.view)) return

  const ids = batchIds()
  if (!ids.length) return
  const cursor = getUI().selectedTaskId
  if ((key === 'Enter' && mod) || (key === ' ' && !mod && !e.altKey)) {
    e.preventDefault()
    return completeSelected(ids)
  }
  if (key === 'Enter' && !e.altKey && !e.shiftKey) {
    // edit the title of the task under the cursor
    if (!cursor) return
    const input = rowEl(cursor)?.querySelector<HTMLInputElement>('input.task-title')
    e.preventDefault()
    if (input && !input.readOnly) {
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    } else document.querySelector<HTMLTextAreaElement>('.detail-title')?.focus()
    return
  }
  if ((key === 'Delete' || key === 'Backspace') && !e.altKey) {
    e.preventDefault()
    deleteSelected(ids)
    const next = getUI().selectedTaskId
    if (next) requestAnimationFrame(() => focusRow(next))
    return
  }
  if (e.altKey) return
  const prio = PRIORITY_KEYS[key] ?? (mod ? PRIORITY_KEYS[e.code?.replace('Digit', '') ?? ''] : undefined)
  if (prio !== undefined && !e.shiftKey) {
    e.preventDefault()
    return setPriority(ids, prio)
  }
  if (mod) return
  const k = lower
  if (k === 'd' && e.shiftKey) {
    e.preventDefault()
    return quickDate(ids, 'clear')
  }
  if (e.shiftKey) return
  if (k === 't' || k === 'm' || k === 'w') {
    e.preventDefault()
    return quickDate(ids, k === 't' ? 'today' : k === 'm' ? 'tomorrow' : 'nextWeek')
  }
  if (k === 'd') {
    e.preventDefault()
    const row = (cursor && ids.includes(cursor) ? rowEl(cursor) : null) ?? rowEl(ids[0])
    openDate(ids, row ? anchorOf(row.querySelector('.task-main') ?? row) : { x: innerWidth / 2, y: innerHeight / 3 })
  }
}

/** Puts the keyboard focus (and its ring) on a row and scrolls it into view. */
function focusRow(id: string) {
  // the cursor's row is always rendered, but the change that moved the cursor may not be in the document yet
  if (!rowEl(id)) flushSync(() => {})
  const row = rowEl(id)
  if (!row) return
  row.tabIndex = 0
  row.focus({ preventScroll: true })
  row.scrollIntoView({ block: 'nearest' })
}

function sectionMenu(e: React.MouseEvent, listId: string | undefined, g: Pick<Group, 'patch'>) {
  if (!listId || !g.patch?.sectionId) return
  e.preventDefault()
  setUI({ menu: { x: e.clientX, y: e.clientY, kind: 'section', id: listId + '/' + g.patch.sectionId } })
}

/** Top-level rows kept rendered outside the list window (see listWindow). */
const PinContext = createContext<ReadonlySet<string>>(new Set())

/** The rows of a group (or of the completed tasks), windowed when there are many. */
function NodeRows({ tasks, tree, showList, collapsed }: { tasks: Task[]; tree: TaskTree; showList: boolean; collapsed?: boolean }) {
  const pins = useContext(PinContext)
  const keys = useMemo(() => tasks.map((x) => x.id), [tasks])
  const keep = useMemo(() => (pins.size ? keys.flatMap((k, i) => (pins.has(k) ? [i] : [])) : []), [keys, pins])
  const { ref: boxRef, parts } = useListWindow(keys, keep)
  return (
    <div className="group-inner" ref={boxRef as Ref<HTMLDivElement>} inert={collapsed || undefined}>
      {parts.flatMap((p) =>
        p.kind === 'gap'
          ? [<div key={'gap:' + p.from} className="list-gap" style={{ height: p.height }} aria-hidden />]
          : tasks.slice(p.from, p.to).map((x) => <TaskNode key={x.id} task={x} tree={tree} depth={0} showList={showList} />),
      )}
    </div>
  )
}

/** A task with its subtasks (indented below it, foldable). New tasks grow in from the top. */
const TaskNode = memo(function TaskNode({ task, tree, depth, showList }: { task: Task; tree: TaskTree; depth: number; showList: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const kids = tree.children.get(task.id)
  const key = 'task:' + task.id
  const folded = useUISel((u) => !!u.collapsed[key])
  const hasKids = !!kids?.length
  const fold = useMemo(() => (hasKids ? { folded, toggle: () => toggleCollapsed(key) } : undefined), [hasKids, folded, key])
  useLayoutEffect(() => maybeEnter(task.id, ref.current), [task.id])
  return (
    <div className="task-node" ref={ref} data-exit={task.id} data-motion={'t:' + task.id} data-vkey={depth === 0 ? task.id : undefined}>
      <TaskRow task={task} showList={showList} depth={depth} fold={fold} />
      {kids && kids.length > 0 && <Children tasks={kids} tree={tree} depth={depth + 1} showList={showList} folded={folded} />}
    </div>
  )
})

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
    <section className="group" data-group={g.key} data-exit={'group:' + g.key} data-motion={'g:' + g.key} data-keep={keep || undefined}>
      {name && (
        <div className={'group-head' + (collapsed ? ' is-collapsed' : '')} data-group-head={g.key} data-motion={'h:' + g.key} onClick={onToggle} onContextMenu={(e) => sectionMenu(e, listId, g)}>
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
        <NodeRows tasks={g.tasks} tree={tree} showList={showList} collapsed={collapsed} />
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
          <section className="group" key={day} data-group={'done:' + day} data-done data-exit={'done:' + day} data-motion={'g:done:' + day}>
            <div className="group-head static" data-motion={'h:done:' + day}>
              <span>{day === format(new Date(), 'yyyy-MM-dd') ? t('common.today') : day === '—' ? t('common.noDate') : fmtMonthDay(parseISO(day))}</span>
              <span className="group-count">{ts.length}</span>
            </div>
            <NodeRows tasks={ts} tree={NO_TREE} showList={showList} />
          </section>
        ))}
      </>
    )
  }
  return (
    <section className="group group-done" data-group="__done" data-done data-exit="__done" data-motion="g:__done">
      <div className={'group-head' + (isCollapsed ? ' is-collapsed' : '')} data-motion="h:__done" onClick={() => toggleCollapsed(key)}>
        <Icon name="chevronDown" size={14} className="chev" />
        <span>{t('common.list.completed')}</span>
        <span className="group-count">{tasks.length}</span>
      </div>
      <div className={'group-body' + (isCollapsed ? ' collapsed' : '')} data-collapsed={isCollapsed || undefined}>
        <NodeRows tasks={tasks} tree={NO_TREE} showList={showList} collapsed={isCollapsed} />
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
  const [ka, kb] = EMPTY[view] ?? (view.startsWith(FILTER_PREFIX) ? ['tasks.empty.filter', 'tasks.empty.filterHint'] : ['tasks.empty.default', 'tasks.empty.defaultHint'])
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
              <div className="kanban-cards" data-motion-host>
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
    <div className="kanban-card" ref={ref} data-dnd-card={task.id} data-flip={task.id} data-exit={task.id} data-motion={'t:' + task.id}>
      <TaskRow task={task} fold={kids?.length ? { folded, toggle: () => toggleCollapsed(key) } : undefined} />
      {kids && kids.length > 0 && (
        <TaskDragContext.Provider value={null}>
          <Children tasks={kids} tree={tree} depth={1} showList={false} folded={folded} />
        </TaskDragContext.Provider>
      )}
    </div>
  )
}
