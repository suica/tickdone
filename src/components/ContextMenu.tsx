import { useLayoutEffect, useRef } from 'react'
import { addDays, addWeeks, startOfWeek } from 'date-fns'
import { fmt, todayStr } from '../dates'
import { useT } from '../i18n'
import { startFocus } from '../pomo'
import { archiveList, canSkip, deleteFilter, deleteList, deleteTag, deleteTask, skipOccurrence, duplicateTask, getData, setUI, toast, uid, updateList, updateTask, useData, useUI, wontDo } from '../store'
import { copyText, taskLink } from '../taskLink'
import { useNarrowTablet, usePhone, useTablet } from '../viewport'
import { activeLists, inArchivedList, PRIORITY } from '../views'
import { Flag, Icon } from './Icon'
import { MenuList, Popover, type MenuItem } from './Popover'
import { editSubtaskSoon, PRIORITY_NAME } from './TaskDetail'
import './ctxmenu.css'

export function ContextMenu() {
  const ui = useUI()
  const data = useData()
  const phone = usePhone()
  const tablet = useTablet()
  const narrow = useNarrowTablet()
  const tr = useT()
  const m = ui.menu
  // On phones and tablets a selected task opens as a full-screen page / overlay (in the task module,
  // only on tablets narrower than 1024px). Opening a task's menu (long press, right click) selects
  // the task, so put the previous selection back.
  const overlay = phone || (tablet && (narrow || ui.module !== 'tasks'))
  const selBefore = useRef(ui.selectedTaskId)
  useLayoutEffect(() => {
    if (!m) selBefore.current = ui.selectedTaskId
    else if (overlay && m.kind === 'task' && ui.selectedTaskId === m.id && selBefore.current !== m.id) setUI({ selectedTaskId: selBefore.current })
  })
  if (!m) return null
  const close = () => setUI({ menu: undefined })
  let items: MenuItem[] = []
  let header: React.ReactNode = null

  if (m.kind === 'task') {
    const t = data.tasks.find((x) => x.id === m.id)
    if (!t) return null
    const set = (p: Parameters<typeof updateTask>[1]) => updateTask(t.id, p)
    if (!t.deleted && inArchivedList(t, data)) {
      // a task in an archived list is read-only: it can only be linked to
      items = [
        {
          label: tr('shell.task.copyLink'),
          icon: <Icon name="link" size={15} />,
          onClick: () => void copyText(taskLink(t.id)).then((ok) => ok && toast(tr('shell.toast.linkCopied'))),
        },
        { label: tr('shell.menu.unarchive'), icon: <Icon name="archive" size={15} />, onClick: () => archiveList(t.listId, false) },
      ]
    } else if (t.deleted) {
      items = [
        { label: tr('shell.task.restore'), icon: <Icon name="restore" size={15} />, onClick: () => set({ deleted: false }) },
        { label: tr('shell.task.deleteForever'), icon: <Icon name="trash" size={15} />, danger: true, onClick: () => deleteTask(t.id) },
      ]
    } else {
      const nextMon = fmt(addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1))
      header = (
        <div className="ctx-head">
          {/* on phones the menu is a bottom sheet away from the row, so name the task */}
          {phone && <div className="ctx-title">{t.title || tr('common.untitled')}</div>}
          <div className="ctx-label">{tr('shell.menu.date')}</div>
          <div className="ctx-row">
            {[
              { icon: 'sun', title: tr('common.today'), d: todayStr() },
              { icon: 'sunrise', title: tr('common.tomorrow'), d: fmt(addDays(new Date(), 1)) },
              { icon: 'nextWeek', title: tr('shell.menu.nextMonday'), d: nextMon },
              { icon: 'close', title: tr('shell.menu.clearDate'), d: undefined },
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
          <div className="ctx-label">{tr('common.priority')}</div>
          <div className="ctx-row">
            {PRIORITY.map((p) => (
              <button
                key={p.v}
                className={'ctx-btn' + (t.priority === p.v ? ' on' : '')}
                title={tr(PRIORITY_NAME[p.v])}
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
        {
          label: tr('shell.detail.addSubtask'),
          icon: <Icon name="subtask" size={15} />,
          onClick: () => {
            // a new empty checklist row, edited in the task's detail
            const sub = { id: uid(), title: '', done: false }
            editSubtaskSoon(sub.id)
            set({ subtasks: [...t.subtasks, sub] })
            setUI({ menu: undefined, selectedTaskId: t.id })
          },
        },
        { label: tr(t.pinned ? 'shell.task.unpin' : 'shell.task.pin'), icon: <Icon name="pin" size={15} />, onClick: () => set({ pinned: !t.pinned }) },
        { label: tr(t.status === -1 ? 'shell.task.reopen' : 'shell.task.wontDo'), icon: <Icon name="wontdo" size={15} />, onClick: () => (t.status === -1 ? set({ status: 0, completedAt: undefined }) : wontDo(t.id)) },
        ...(canSkip(t) ? [{ label: tr('shell.task.skip'), icon: <Icon name="repeat" size={15} />, onClick: () => skipOccurrence(t.id) }] : []),
        {
          label: tr('shell.task.tags'),
          icon: <Icon name="tag" size={15} />,
          children: data.tags.length
            ? data.tags.map((tg) => ({
                label: tg.name,
                checked: t.tags.includes(tg.name),
                onClick: () => set({ tags: t.tags.includes(tg.name) ? t.tags.filter((x) => x !== tg.name) : [...t.tags, tg.name] }),
              }))
            : [{ label: tr('shell.menu.noTags'), disabled: true }],
        },
        {
          label: tr('shell.menu.moveTo'),
          icon: <Icon name="move" size={15} />,
          children: [{ id: 'inbox', name: tr('common.list.inbox') }, ...activeLists(data)].map((l) => ({
            label: l.name,
            checked: t.listId === l.id,
            onClick: () => {
              const snap = getData()
              set({ listId: l.id, sectionId: undefined })
              toast(tr('shell.toast.movedTo', { name: l.name }), snap)
            },
          })),
        },
        { label: tr('shell.task.startFocus'), icon: <Icon name="pomo" size={15} />, onClick: () => { startFocus(t.id); setUI({ module: 'pomo' }) } },
        { label: tr('shell.task.duplicate'), icon: <Icon name="copy" size={15} />, onClick: () => duplicateTask(t.id) },
        {
          label: tr('shell.task.copyLink'),
          icon: <Icon name="link" size={15} />,
          onClick: () => void copyText(taskLink(t.id)).then((ok) => ok && toast(tr('shell.toast.linkCopied'))),
        },
        { divider: true },
        { label: tr('common.delete'), icon: <Icon name="trash" size={15} />, danger: true, onClick: () => deleteTask(t.id) },
      ]
    }
  } else if (m.kind === 'list') {
    const l = data.lists.find((x) => x.id === m.id)
    if (!l) return null
    const del = {
      label: tr('common.delete'),
      icon: <Icon name="trash" size={15} />,
      danger: true,
      onClick: () => {
        if (confirm(tr('shell.confirm.deleteList', { name: l.name }))) deleteList(l.id)
      },
    }
    items = l.archived
      ? [{ label: tr('shell.menu.unarchive'), icon: <Icon name="archive" size={15} />, onClick: () => archiveList(l.id, false) }, { divider: true }, del]
      : [
      { label: tr('common.edit'), icon: <Icon name="edit" size={15} />, onClick: () => setUI({ dialog: { kind: 'list', id: l.id } }) },
      { label: tr(l.view === 'kanban' ? 'shell.menu.listView' : 'shell.menu.kanbanView'), icon: <Icon name={l.view === 'kanban' ? 'list' : 'kanban'} size={15} />, onClick: () => updateList(l.id, { view: l.view === 'kanban' ? 'list' : 'kanban' }) },
      {
        label: tr('shell.menu.moveToFolder'),
        icon: <Icon name="folder" size={15} />,
        children: [
          { label: tr('shell.menu.noFolder'), checked: !l.folderId, onClick: () => updateList(l.id, { folderId: undefined }) },
          ...data.folders.map((f) => ({ label: f.name, checked: l.folderId === f.id, onClick: () => updateList(l.id, { folderId: f.id }) })),
        ],
      },
      { label: tr('shell.menu.archive'), icon: <Icon name="archive" size={15} />, onClick: () => archiveList(l.id) },
      { divider: true },
      del,
    ]
  } else if (m.kind === 'tag') {
    items = [
      { label: tr('common.edit'), icon: <Icon name="edit" size={15} />, onClick: () => setUI({ dialog: { kind: 'tag', id: m.id } }) },
      { label: tr('common.delete'), icon: <Icon name="trash" size={15} />, danger: true, onClick: () => deleteTag(m.id) },
    ]
  } else if (m.kind === 'filter') {
    const f = data.filters?.find((x) => x.id === m.id)
    if (!f) return null
    items = [
      { label: tr('common.edit'), icon: <Icon name="edit" size={15} />, onClick: () => setUI({ dialog: { kind: 'filter', id: f.id } }) },
      { divider: true },
      { label: tr('common.delete'), icon: <Icon name="trash" size={15} />, danger: true, onClick: () => deleteFilter(f.id) },
    ]
  } else if (m.kind === 'section') {
    const [listId, secId] = m.id.split('/')
    const l = data.lists.find((x) => x.id === listId)
    const s = l?.sections.find((x) => x.id === secId)
    if (!l || !s) return null
    items = [
      {
        label: tr('common.rename'),
        icon: <Icon name="edit" size={15} />,
        onClick: () => {
          const name = prompt(tr('shell.prompt.sectionName'), s.name)
          if (name) updateList(l.id, { sections: l.sections.map((x) => (x.id === s.id ? { ...x, name } : x)) })
        },
      },
      {
        label: tr('shell.menu.deleteSection'),
        icon: <Icon name="trash" size={15} />,
        danger: true,
        onClick: () => {
          const snap = getData()
          updateList(l.id, { sections: l.sections.filter((x) => x.id !== s.id) })
          toast(tr('shell.toast.sectionDeleted'), snap)
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
