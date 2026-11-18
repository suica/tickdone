import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { addDays } from 'date-fns'
import { fmt, todayStr } from '../dates'
import { getData, setData, setUI, toast, updateTask, useData, useUI } from '../store'
import type { Task } from '../types'
import { SMART, SMART_BOTTOM, tasksForView } from '../views'
import { Icon } from './Icon'

/** 拖任务到侧栏项上时要改的属性 */
function dropPatch(view: string, t: Task): Partial<Task> | null {
  if (view === 'today') return { dueDate: todayStr() }
  if (view === 'tomorrow') return { dueDate: fmt(addDays(new Date(), 1)) }
  if (view === 'week') return t.dueDate ? null : { dueDate: todayStr() }
  if (view === 'inbox') return { listId: 'inbox', sectionId: undefined }
  if (view.startsWith('list:')) return { listId: view.slice(5), sectionId: undefined }
  if (view.startsWith('tag:')) return t.tags.includes(view.slice(4)) ? null : { tags: [...t.tags, view.slice(4)] }
  if (view === 'completed') return { status: 2, completedAt: Date.now() }
  if (view === 'wontdo') return { status: -1, completedAt: Date.now() }
  if (view === 'trash') return { deleted: true }
  return null
}

function Item({ view, icon, name, count, color, indent, onMenu }: { view: string; icon: ReactNode; name: string; count?: number; color?: string; indent?: boolean; onMenu?: (e: React.MouseEvent) => void }) {
  const ui = useUI()
  const [over, setOver] = useState(false)
  const onDrop = (e: DragEvent) => {
    setOver(false)
    const id = e.dataTransfer.getData('text/task-id')
    const t = getData().tasks.find((x) => x.id === id)
    if (!t) return
    e.preventDefault()
    const p = dropPatch(view, t)
    if (p) {
      const snap = getData()
      updateTask(id, p)
      toast(`已移动到「${name}」`, snap)
    }
  }
  return (
    <div
      className={'side-item' + (ui.view === view ? ' active' : '') + (over ? ' drop' : '') + (indent ? ' indent' : '')}
      onClick={() => setUI({ view, module: 'tasks', selectedTaskId: undefined })}
      onContextMenu={onMenu}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/task-id')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
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
    <div className="side-section" onClick={() => setUI((u) => ({ collapsed: { ...u.collapsed, ['side:' + id]: !collapsed } }))}>
      <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={12} />
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
  const openMenu = (kind: 'list' | 'tag', id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    setUI({ menu: { x: e.clientX, y: e.clientY, kind, id } })
  }

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
                setUI({ dialog: { kind: 'list' } })
              }}
            >
              <Icon name="list" size={15} /> 添加清单
            </button>
            <button
              onClick={() => {
                setAddMenu(false)
                setUI({ dialog: { kind: 'folder' } })
              }}
            >
              <Icon name="folder" size={15} /> 添加文件夹
            </button>
          </div>
        )}
        {!ui.collapsed['side:lists'] && (
          <>
            {folders.map((f) => (
              <div key={f.id}>
                <div
                  className="side-item folder"
                  onClick={() => setData((d) => ({ ...d, folders: d.folders.map((x) => (x.id === f.id ? { ...x, collapsed: !x.collapsed } : x)) }))}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setUI({ dialog: { kind: 'folder', id: f.id } })
                  }}
                >
                  <span className="side-icon">
                    <Icon name={f.collapsed ? 'chevronRight' : 'chevronDown'} size={13} />
                  </span>
                  <Icon name="folder" size={16} style={{ color: 'var(--text-3)', marginRight: 6 }} />
                  <span className="side-name">{f.name}</span>
                </div>
                {!f.collapsed &&
                  listsIn(f.id).map((l) => (
                    <Item key={l.id} indent view={'list:' + l.id} icon={l.color ? <i className="dot" style={{ background: l.color }} /> : <Icon name="list" size={18} />} name={l.name} count={counts['list:' + l.id]} onMenu={openMenu('list', l.id)} />
                  ))}
              </div>
            ))}
            {listsIn(undefined).map((l) => (
              <Item key={l.id} view={'list:' + l.id} icon={l.color ? <i className="dot" style={{ background: l.color }} /> : <Icon name="list" size={18} />} name={l.name} count={counts['list:' + l.id]} onMenu={openMenu('list', l.id)} />
            ))}
            {data.lists.length === 0 && <div className="side-hint">使用清单分类管理任务</div>}
          </>
        )}

        <SectionHead id="tags" title="标签" onAdd={() => setUI({ dialog: { kind: 'tag' } })} />
        {!ui.collapsed['side:tags'] && (
          <>
            {data.tags.map((t) => (
              <Item key={t.name} view={'tag:' + t.name} icon={<Icon name="tag" size={17} />} color={t.color} name={t.name} count={counts['tag:' + t.name]} onMenu={openMenu('tag', t.name)} />
            ))}
            {data.tags.length === 0 && <div className="side-hint">以标签的维度展示不同清单的任务</div>}
          </>
        )}

        <div className="side-divider" />
        {SMART_BOTTOM.map((s) => (
          <Item key={s.id} view={s.id} icon={<Icon name={s.icon} size={18} />} name={s.name} />
        ))}
      </div>
    </aside>
  )
}
