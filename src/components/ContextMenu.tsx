import { addDays, addWeeks, startOfWeek } from 'date-fns'
import { fmt, todayStr } from '../dates'
import { startFocus } from '../pomo'
import { deleteList, deleteTag, deleteTask, duplicateTask, getData, setUI, toast, updateList, updateTask, useData, useUI, wontDo } from '../store'
import { PRIORITY } from '../views'
import { Flag, Icon } from './Icon'
import { MenuList, Popover, type MenuItem } from './Popover'
import './ctxmenu.css'

export function ContextMenu() {
  const ui = useUI()
  const data = useData()
  const m = ui.menu
  if (!m) return null
  const close = () => setUI({ menu: undefined })
  let items: MenuItem[] = []
  let header: React.ReactNode = null

  if (m.kind === 'task') {
    const t = data.tasks.find((x) => x.id === m.id)
    if (!t) return null
    const set = (p: Parameters<typeof updateTask>[1]) => updateTask(t.id, p)
    if (t.deleted) {
      items = [
        { label: '恢复', icon: <Icon name="restore" size={15} />, onClick: () => set({ deleted: false }) },
        { label: '永久删除', icon: <Icon name="trash" size={15} />, danger: true, onClick: () => deleteTask(t.id) },
      ]
    } else {
      const nextMon = fmt(addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1))
      header = (
        <div className="ctx-head">
          <div className="ctx-label">日期</div>
          <div className="ctx-row">
            {[
              { icon: 'sun', title: '今天', d: todayStr() },
              { icon: 'sunrise', title: '明天', d: fmt(addDays(new Date(), 1)) },
              { icon: 'nextWeek', title: '下周一', d: nextMon },
              { icon: 'close', title: '清除日期', d: undefined },
            ].map((x) => (
              <button
                key={x.title}
                className={'ctx-btn' + (x.d && t.dueDate === x.d ? ' on' : '')}
                title={x.title}
                onClick={() => {
                  set(x.d ? { dueDate: x.d } : { dueDate: undefined, dueTime: undefined, reminder: null, repeat: null })
                  close()
                }}
              >
                <Icon name={x.icon} size={17} />
              </button>
            ))}
          </div>
          <div className="ctx-label">优先级</div>
          <div className="ctx-row">
            {PRIORITY.map((p) => (
              <button
                key={p.v}
                className={'ctx-btn' + (t.priority === p.v ? ' on' : '')}
                title={p.name}
                onClick={() => {
                  set({ priority: p.v })
                  close()
                }}
              >
                <Flag color={p.color} size={17} />
              </button>
            ))}
          </div>
          <div className="menu-divider" />
        </div>
      )
      items = [
        { label: t.pinned ? '取消置顶' : '置顶', icon: <Icon name="pin" size={15} />, onClick: () => set({ pinned: !t.pinned }) },
        { label: t.status === -1 ? '取消放弃' : '放弃', icon: <Icon name="wontdo" size={15} />, onClick: () => (t.status === -1 ? set({ status: 0, completedAt: undefined }) : wontDo(t.id)) },
        {
          label: '标签',
          icon: <Icon name="tag" size={15} />,
          children: data.tags.length
            ? data.tags.map((tg) => ({
                label: tg.name,
                checked: t.tags.includes(tg.name),
                onClick: () => set({ tags: t.tags.includes(tg.name) ? t.tags.filter((x) => x !== tg.name) : [...t.tags, tg.name] }),
              }))
            : [{ label: '暂无标签', disabled: true }],
        },
        {
          label: '移动到',
          icon: <Icon name="move" size={15} />,
          children: [{ id: 'inbox', name: '收件箱' }, ...data.lists].map((l) => ({
            label: l.name,
            checked: t.listId === l.id,
            onClick: () => {
              const snap = getData()
              set({ listId: l.id, sectionId: undefined })
              toast(`已移动到「${l.name}」`, snap)
            },
          })),
        },
        { label: '开始专注', icon: <Icon name="pomo" size={15} />, onClick: () => { startFocus(t.id); setUI({ module: 'pomo' }) } },
        { label: '创建副本', icon: <Icon name="copy" size={15} />, onClick: () => duplicateTask(t.id) },
        { divider: true },
        { label: '删除', icon: <Icon name="trash" size={15} />, danger: true, onClick: () => deleteTask(t.id) },
      ]
    }
  } else if (m.kind === 'list') {
    const l = data.lists.find((x) => x.id === m.id)
    if (!l) return null
    items = [
      { label: '编辑', icon: <Icon name="edit" size={15} />, onClick: () => setUI({ dialog: { kind: 'list', id: l.id } }) },
      { label: l.view === 'kanban' ? '列表视图' : '看板视图', icon: <Icon name={l.view === 'kanban' ? 'list' : 'kanban'} size={15} />, onClick: () => updateList(l.id, { view: l.view === 'kanban' ? 'list' : 'kanban' }) },
      {
        label: '移动到文件夹',
        icon: <Icon name="folder" size={15} />,
        children: [
          { label: '无', checked: !l.folderId, onClick: () => updateList(l.id, { folderId: undefined }) },
          ...data.folders.map((f) => ({ label: f.name, checked: l.folderId === f.id, onClick: () => updateList(l.id, { folderId: f.id }) })),
        ],
      },
      { divider: true },
      {
        label: '删除',
        icon: <Icon name="trash" size={15} />,
        danger: true,
        onClick: () => {
          if (confirm(`删除清单「${l.name}」？清单中的任务会移到垃圾桶`)) deleteList(l.id)
        },
      },
    ]
  } else if (m.kind === 'tag') {
    items = [
      { label: '编辑', icon: <Icon name="edit" size={15} />, onClick: () => setUI({ dialog: { kind: 'tag', id: m.id } }) },
      { label: '删除', icon: <Icon name="trash" size={15} />, danger: true, onClick: () => deleteTag(m.id) },
    ]
  } else if (m.kind === 'section') {
    const [listId, secId] = m.id.split('/')
    const l = data.lists.find((x) => x.id === listId)
    const s = l?.sections.find((x) => x.id === secId)
    if (!l || !s) return null
    items = [
      {
        label: '重命名',
        icon: <Icon name="edit" size={15} />,
        onClick: () => {
          const name = prompt('分组名称', s.name)
          if (name) updateList(l.id, { sections: l.sections.map((x) => (x.id === s.id ? { ...x, name } : x)) })
        },
      },
      {
        label: '删除分组',
        icon: <Icon name="trash" size={15} />,
        danger: true,
        onClick: () => {
          const snap = getData()
          updateList(l.id, { sections: l.sections.filter((x) => x.id !== s.id) })
          toast('分组已删除，任务移到未分组', snap)
        },
      },
    ]
  }

  return (
    <Popover anchor={{ x: m.x, y: m.y }} onClose={close} key={m.x + ':' + m.y}>
      <div className="ctx">
        {header}
        <MenuList items={items} onClose={close} />
      </div>
    </Popover>
  )
}
