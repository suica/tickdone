import { useMemo, useState, type ReactNode } from 'react'
import { setData, setUI, useData, useUI } from '../store'
import type { TaskList } from '../types'
import { isPhone } from '../viewport'
import { SMART, SMART_BOTTOM, tasksForView } from '../views'
import { pressToDrag } from './dnd'
import { Icon } from './Icon'
import { startFolderDrag, startListItemDrag } from './sideDnd'

/** Open a view; inside the phone drawer this also closes the drawer. */
function go(view: string) {
  setUI({ view, module: 'tasks', selectedTaskId: undefined, ...(isPhone() ? { drawerOpen: false } : {}) })
}

const menuAt = (kind: 'list' | 'tag', id: string, x: number, y: number) => setUI({ menu: { x, y, kind, id } })

interface ItemProps {
  view: string
  icon: ReactNode
  name: string
  count?: number
  color?: string
  indent?: boolean
  /** right click / long press menu */
  menu?: 'list' | 'tag'
  menuId?: string
  /** list rows can be dragged to reorder or move between folders */
  listId?: string
  folder?: string
}

/** One sidebar entry. Tasks can be dropped on it (data-dnd-view); see taskDnd.sideDrop. */
function Item({ view, icon, name, count, color, indent, menu, menuId, listId, folder }: ItemProps) {
  const ui = useUI()
  const onLongPress = (x: number, y: number) => menu && menuAt(menu, menuId!, x, y)
  return (
    <div
      className={'side-item' + (ui.view === view ? ' active' : '') + (indent ? ' indent' : '')}
      data-dnd-view={view}
      data-flip={listId ? 'list:' + listId : undefined}
      data-side-list={listId}
      data-folder={listId ? (folder ?? '') : undefined}
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

function SectionHead({ id, title, onAdd }: { id: string; title: string; onAdd?: (e: React.MouseEvent) => void }) {
  const ui = useUI()
  const collapsed = !!ui.collapsed['side:' + id]
  return (
    <div className={'side-section' + (collapsed ? ' is-collapsed' : '')} onClick={() => setUI((u) => ({ collapsed: { ...u.collapsed, ['side:' + id]: !collapsed } }))}>
      <Icon name="chevronDown" size={12} className="chev" />
      <span>{title}</span>
      <div style={{ flex: 1 }} />
      {onAdd && (
        <button
          className="side-add"
          title="添加"
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
  const data = useData()
  const ui = useUI()
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    const views = [...SMART.map((s) => s.id), ...data.lists.map((l) => 'list:' + l.id), ...data.tags.map((t) => 'tag:' + t.name)]
    for (const v of views) c[v] = tasksForView(v, data).open.length
    return c
  }, [data])
  const [addMenu, setAddMenu] = useState(false)

  const listsIn = (folderId?: string) => [...data.lists].filter((l) => (l.folderId ?? undefined) === folderId).sort((a, b) => a.order - b.order)
  const folders = [...data.folders].sort((a, b) => a.order - b.order)
  const dialog = (kind: 'list' | 'folder' | 'tag', id?: string) => setUI({ dialog: { kind, id }, ...(isPhone() ? { drawerOpen: false } : {}) })
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
          <Item key={s.id} view={s.id} icon={<Icon name={s.icon} size={18} />} name={s.name} count={counts[s.id]} />
        ))}

        <div className="side-divider" />
        <SectionHead id="lists" title="清单" onAdd={() => setAddMenu((v) => !v)} />
        {addMenu && (
          <div className="side-add-menu" onMouseLeave={() => setAddMenu(false)}>
            <button
              onClick={() => {
                setAddMenu(false)
                dialog('list')
              }}
            >
              <Icon name="list" size={15} /> 添加清单
            </button>
            <button
              onClick={() => {
                setAddMenu(false)
                dialog('folder')
              }}
            >
              <Icon name="folder" size={15} /> 添加文件夹
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
          {data.lists.length === 0 && <div className="side-hint">使用清单分类管理任务</div>}
        </Fold>

        <SectionHead id="tags" title="标签" onAdd={() => dialog('tag')} />
        <Fold open={!ui.collapsed['side:tags']}>
          {data.tags.map((t) => (
            <Item key={t.name} view={'tag:' + t.name} icon={<Icon name="tag" size={17} />} color={t.color} name={t.name} count={counts['tag:' + t.name]} menu="tag" menuId={t.name} />
          ))}
          {data.tags.length === 0 && <div className="side-hint">以标签的维度展示不同清单的任务</div>}
        </Fold>

        <div className="side-divider" />
        {SMART_BOTTOM.map((s) => (
          <Item key={s.id} view={s.id} icon={<Icon name={s.icon} size={18} />} name={s.name} />
        ))}
      </div>
    </aside>
  )
}
