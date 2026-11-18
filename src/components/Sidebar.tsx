import { useMemo, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { setData, setUI, useData, useUI } from '../store'
import type { TaskList } from '../types'
import { isPhone } from '../viewport'
import { activeLists, openCounts, SMART, SMART_BOTTOM } from '../views'
import { pressToDrag } from './dnd'
import { Icon } from './Icon'
import { startFilterDrag, startFolderDrag, startListItemDrag } from './sideDnd'
import { FILTER_PREFIX, sortedFilters } from '../filters'
import { SMART_NAME } from './taskDnd'

/** Open a view; inside the phone drawer this also closes the drawer. */
function go(view: string) {
  setUI({ view, module: 'tasks', selectedTaskId: undefined, ...(isPhone() ? { drawerOpen: false } : {}) })
}

const menuAt = (kind: 'list' | 'tag' | 'filter', id: string, x: number, y: number) => setUI({ menu: { x, y, kind, id } })

interface ItemProps {
  view: string
  icon: ReactNode
  name: string
  count?: number
  color?: string
  indent?: boolean
  /** right click / long press menu */
  menu?: 'list' | 'tag' | 'filter'
  menuId?: string
  /** filter rows can be dragged to reorder the filters */
  filterId?: string
  /** list rows can be dragged to reorder or move between folders */
  listId?: string
  folder?: string
  /** tasks cannot be dropped on it (archived lists) */
  noDrop?: boolean
}

/** One sidebar entry. Tasks can be dropped on it (data-dnd-view); see taskDnd.sideDrop. */
function Item({ view, icon, name, count, color, indent, menu, menuId, listId, folder, filterId, noDrop }: ItemProps) {
  const ui = useUI()
  const onLongPress = (x: number, y: number) => menu && menuAt(menu, menuId!, x, y)
  return (
    <div
      className={'side-item' + (ui.view === view ? ' active' : '') + (indent ? ' indent' : '')}
      data-dnd-view={noDrop ? undefined : view}
      data-side-list={listId}
      data-folder={listId ? (folder ?? '') : undefined}
      data-side-filter={filterId}
      data-flip={listId ? 'list:' + listId : filterId ? 'filter:' + filterId : undefined}
      onClick={() => go(view)}
      onContextMenu={
        menu
          ? (e) => {
              e.preventDefault()
              menuAt(menu, menuId!, e.clientX, e.clientY)
            }
          : undefined
      }
      onPointerDown={
        listId
          ? (e) => startListItemDrag(e, listId, onLongPress)
          : filterId
            ? (e) => startFilterDrag(e, filterId, onLongPress)
            : menu
            ? (e) => {
                const el = e.currentTarget
                pressToDrag(e, () => ({ source: el, onMove: () => {}, onDrop: () => false, onLongPress }), { pressOnly: true })
              }
            : undefined
      }
    >
      <span className="side-icon" style={color ? { color } : undefined}>
        {icon}
      </span>
      <span className="side-name">{name}</span>
      {!!count && <span className="side-count">{count}</span>}
    </div>
  )
}

function SectionHead({ id, title, onAdd, addLabel, defaultCollapsed = false }: { id: string; title: string; onAdd?: (e: React.MouseEvent) => void; addLabel?: string; defaultCollapsed?: boolean }) {
  const t = useT()
  const ui = useUI()
  const collapsed = ui.collapsed['side:' + id] ?? defaultCollapsed
  return (
    <div className={'side-section' + (collapsed ? ' is-collapsed' : '')} onClick={() => setUI((u) => ({ collapsed: { ...u.collapsed, ['side:' + id]: !collapsed } }))}>
      <Icon name="chevronDown" size={12} className="chev" />
      <span>{title}</span>
      <div style={{ flex: 1 }} />
      {onAdd && (
        <button
          className="side-add"
          title={addLabel ?? t('common.add')}
          aria-label={addLabel ?? t('common.add')}
          onClick={(e) => {
            e.stopPropagation()
            onAdd(e)
          }}
        >
          <Icon name="plus" size={15} />
        </button>
      )}
    </div>
  )
}

/** Animated fold for sidebar sections and folders. */
function Fold({ open, children, ...rest }: { open: boolean; children: ReactNode } & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <div className={'side-fold' + (open ? '' : ' collapsed')} data-collapsed={!open || undefined} {...rest}>
      <div className="side-fold-inner" inert={!open || undefined}>
        {children}
      </div>
    </div>
  )
}

export function Sidebar() {
  const t = useT()
  const data = useData()
  const ui = useUI()
  // counted in one pass, and only again when tasks, lists, tags or filters change
  const counts = useMemo(
    () =>
      openCounts(
        [
          ...SMART.map((s) => s.id),
          ...activeLists(data).map((l) => 'list:' + l.id),
          ...data.tags.map((tag) => 'tag:' + tag.name),
          ...(data.filters ?? []).map((f) => FILTER_PREFIX + f.id),
        ],
        data,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.tasks, data.lists, data.tags, data.filters, data.settings.weekStartsOn],
  )
  const [addMenu, setAddMenu] = useState(false)

  const lists = activeLists(data)
  const archived = data.lists.filter((l) => l.archived).sort((a, b) => a.order - b.order)
  const archivedOpen = !(ui.collapsed['side:archived'] ?? true)
  const listsIn = (folderId?: string) => lists.filter((l) => (l.folderId ?? undefined) === folderId).sort((a, b) => a.order - b.order)
  const folders = [...data.folders].sort((a, b) => a.order - b.order)
  const filters = sortedFilters(data)
  const dialog = (kind: 'list' | 'folder' | 'tag' | 'filter', id?: string) => setUI({ dialog: { kind, id }, ...(isPhone() ? { drawerOpen: false } : {}) })
  const listItem = (l: TaskList, indent?: boolean) => (
    <Item
      key={l.id}
      indent={indent}
      view={'list:' + l.id}
      icon={l.color ? <i className="dot" style={{ background: l.color }} /> : <Icon name="list" size={18} />}
      name={l.name}
      count={counts['list:' + l.id]}
      menu="list"
      menuId={l.id}
      listId={l.id}
      folder={l.folderId}
    />
  )

  return (
    <aside className="sidebar">
      <div className="side-scroll">
        {SMART.map((s) => (
          <Item key={s.id} view={s.id} icon={<Icon name={s.icon} size={18} />} name={t(SMART_NAME[s.id])} count={counts[s.id]} />
        ))}

        <div className="side-divider" />
        <SectionHead id="lists" title={t('tasks.sidebar.lists')} onAdd={() => setAddMenu((v) => !v)} />
        {addMenu && (
          <div className="side-add-menu" onMouseLeave={() => setAddMenu(false)}>
            <button
              onClick={() => {
                setAddMenu(false)
                dialog('list')
              }}
            >
              <Icon name="list" size={15} /> {t('tasks.sidebar.addList')}
            </button>
            <button
              onClick={() => {
                setAddMenu(false)
                dialog('folder')
              }}
            >
              <Icon name="folder" size={15} /> {t('tasks.sidebar.addFolder')}
            </button>
          </div>
        )}
        <Fold open={!ui.collapsed['side:lists']} data-side-lists>
          {folders.map((f) => (
            <div key={f.id} data-folder-block>
              <div
                className={'side-item folder' + (f.collapsed ? ' is-collapsed' : '')}
                data-side-folder={f.id}
                data-flip={'folder:' + f.id}
                onClick={() => setData((d) => ({ ...d, folders: d.folders.map((x) => (x.id === f.id ? { ...x, collapsed: !x.collapsed } : x)) }))}
                onContextMenu={(e) => {
                  e.preventDefault()
                  dialog('folder', f.id)
                }}
                onPointerDown={(e) => startFolderDrag(e, f.id)}
              >
                <span className="side-icon">
                  <Icon name="chevronDown" size={13} className="chev" />
                </span>
                <Icon name="folder" size={16} style={{ color: 'var(--text-3)', marginRight: 6 }} />
                <span className="side-name">{f.name}</span>
              </div>
              <Fold open={!f.collapsed}>{listsIn(f.id).map((l) => listItem(l, true))}</Fold>
            </div>
          ))}
          {listsIn(undefined).map((l) => listItem(l))}
          {lists.length === 0 && <div className="side-hint">{t('tasks.sidebar.listsHint')}</div>}
        </Fold>

        <SectionHead id="tags" title={t('tasks.sidebar.tags')} onAdd={() => dialog('tag')} />
        <Fold open={!ui.collapsed['side:tags']}>
          {data.tags.map((tag) => (
            <Item key={tag.name} view={'tag:' + tag.name} icon={<Icon name="tag" size={17} />} color={tag.color} name={tag.name} count={counts['tag:' + tag.name]} menu="tag" menuId={tag.name} />
          ))}
          {data.tags.length === 0 && <div className="side-hint">{t('tasks.sidebar.tagsHint')}</div>}
        </Fold>

        <SectionHead id="filters" title={t('tasks.sidebar.filters')} onAdd={() => dialog('filter')} addLabel={t('tasks.sidebar.addFilter')} />
        <Fold open={!ui.collapsed['side:filters']} data-side-filters>
          {filters.map((f) => (
            <Item
              key={f.id}
              view={FILTER_PREFIX + f.id}
              icon={<Icon name={f.icon || 'filter'} size={17} />}
              color={f.color}
              name={f.name}
              count={counts[FILTER_PREFIX + f.id]}
              menu="filter"
              menuId={f.id}
              filterId={f.id}
            />
          ))}
          {filters.length === 0 && <div className="side-hint">{t('tasks.sidebar.filtersHint')}</div>}
        </Fold>

        <div className="side-divider" />
        {SMART_BOTTOM.map((s) => (
          <Item key={s.id} view={s.id} icon={<Icon name={s.icon} size={18} />} name={t(SMART_NAME[s.id])} />
        ))}

        {archived.length > 0 && (
          <div className="side-archived" data-side-archived>
            <div className="side-divider" />
            <SectionHead id="archived" title={t('tasks.sidebar.archived')} defaultCollapsed />
            <Fold open={archivedOpen}>
              {archived.map((l) => (
                <Item
                  key={l.id}
                  view={'list:' + l.id}
                  icon={<Icon name="archive" size={17} />}
                  color={l.color}
                  name={l.name}
                  menu="list"
                  menuId={l.id}
                  noDrop
                />
              ))}
            </Fold>
          </div>
        )}
      </div>
    </aside>
  )
}
