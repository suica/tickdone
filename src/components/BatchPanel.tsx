import { useMemo, useState } from 'react'
import { tagState } from '../batch'
import { useT } from '../i18n'
import { clearSelection, getSelection, setSelection, useData, useUI } from '../store'
import { inOrder, selectAll, selectedIds } from '../selection'
import type { AppData } from '../types'
import { activeLists, PRIORITY } from '../views'
import { completeSelected, deleteSelected, moveToList, setDate, setPriority, toggleTag, visibleOrder, wontDoSelected } from './batchActions'
import { DatePicker } from './DatePicker'
import { Flag, Icon } from './Icon'
import { anchorOf, MenuList, Popover, type Anchor } from './Popover'
import { PRIORITY_NAME } from './TaskDetail'
import './batch.css'

// The batch panel (in the detail column while several tasks are selected) and the phone action bar
// (selection mode). Both act on the selected tasks; every action is one undo step.

type PopKind = 'date' | 'prio' | 'list' | 'tag'
export type BatchPop = { kind: PopKind; anchor: Anchor } | null

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** The selected tasks that still exist, in list order. */
function useSelected(): { ids: string[]; data: AppData } {
  const ui = useUI()
  const data = useData()
  const ids = useMemo(() => {
    const known = new Set(data.tasks.map((x) => x.id))
    return inOrder(visibleOrder(), selectedIds(getSelection(ui)).filter((id) => known.has(id)))
    // visibleOrder reads the rows drawn for this data
  }, [ui, data])
  return { ids, data }
}

/** The shared date / priority / list / tag pickers of the panel and the bar. */
export function BatchPops({ pop, ids, data, onClose }: { pop: BatchPop; ids: string[]; data: AppData; onClose: () => void }) {
  const t = useT()
  const [tagInput, setTagInput] = useState('')
  if (!pop) return null
  const tasks = data.tasks.filter((x) => ids.includes(x.id))
  const first = tasks[0]
  const shared = first && tasks.every((x) => x.dueDate === first.dueDate && x.dueTime === first.dueTime)
  if (pop.kind === 'date')
    return (
      <DatePicker
        anchor={pop.anchor}
        value={shared ? { dueDate: first.dueDate, dueTime: first.dueTime, reminder: first.reminder, repeat: first.repeat } : {}}
        onChange={(v) => setDate(ids, v)}
        onClose={onClose}
      />
    )
  if (pop.kind === 'prio') {
    const same = first && tasks.every((x) => x.priority === first.priority) ? first.priority : undefined
    return (
      <Popover anchor={pop.anchor} onClose={onClose}>
        <div className="prio-row">
          {PRIORITY.map((p) => (
            <button
              key={p.v}
              title={t(PRIORITY_NAME[p.v])}
              aria-label={t(PRIORITY_NAME[p.v])}
              className={'prio-btn' + (p.v === same ? ' on' : '')}
              onClick={() => {
                setPriority(ids, p.v)
                onClose()
              }}
            >
              <Flag color={p.color} size={18} />
            </button>
          ))}
        </div>
      </Popover>
    )
  }
  if (pop.kind === 'list')
    return (
      <Popover anchor={pop.anchor} onClose={onClose}>
        <MenuList
          onClose={onClose}
          items={[{ id: 'inbox', name: t('common.list.inbox'), color: undefined as string | undefined }, ...activeLists(data)].map((l) => ({
            label: l.name,
            icon: l.color ? <i className="dot" style={{ background: l.color }} /> : <Icon name={l.id === 'inbox' ? 'inbox' : 'list'} size={14} />,
            checked: tasks.length > 0 && tasks.every((x) => x.listId === l.id),
            onClick: () => moveToList(ids, l.id),
          }))}
        />
      </Popover>
    )
  return (
    <Popover anchor={pop.anchor} onClose={onClose} width={220}>
      <div className="tag-picker">
        <input
          className="input"
          autoFocus
          placeholder={t('shell.tagPicker.placeholder')}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value.replace(/[#\s]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && tagInput && !e.nativeEvent.isComposing) {
              toggleTag(ids, tagInput)
              setTagInput('')
            }
          }}
        />
        <div className="tag-picker-list">
          {data.tags
            .filter((x) => x.name.includes(tagInput))
            .map((x) => {
              const state = tagState(data, ids, x.name)
              return (
                <div key={x.name} className="menu-item" data-tag-state={state} onClick={() => toggleTag(ids, x.name)}>
                  <span className="menu-icon" style={{ color: x.color }}>
                    <Icon name="tag" size={14} />
                  </span>
                  <span className="menu-label">{x.name}</span>
                  {state !== 'none' && <span className="menu-check">{state === 'all' ? '✓' : '–'}</span>}
                </div>
              )
            })}
          {tagInput && !data.tags.some((x) => x.name === tagInput) && (
            <div
              className="menu-item"
              onClick={() => {
                toggleTag(ids, tagInput)
                setTagInput('')
              }}
            >
              <span className="menu-icon">
                <Icon name="plus" size={14} />
              </span>
              <span className="menu-label">{t('shell.tagPicker.create', { name: tagInput })}</span>
            </div>
          )}
        </div>
      </div>
    </Popover>
  )
}

/** Desktop and tablet: the detail column while several tasks are selected. */
export function BatchPanel() {
  const t = useT()
  const ui = useUI()
  const { ids, data } = useSelected()
  const [pop, setPop] = useState<BatchPop>(null)
  const tasks = ids.map((id) => data.tasks.find((x) => x.id === id)!).filter(Boolean)
  const none = ids.length === 0
  const allDone = tasks.length > 0 && tasks.every((x) => x.status !== 0)
  const open = (kind: PopKind) => (e: React.MouseEvent<HTMLElement>) => setPop({ kind, anchor: anchorOf(e.currentTarget) })
  const shown = tasks.slice(0, 3)
  const mod = isMac ? '⌘' : 'Ctrl'
  return (
    <div className="batch" data-batch role="region" aria-label={t('tasks.batch.selected', { count: ids.length })}>
      <div className="batch-stack" aria-hidden>
        {shown.length === 0 && <div className="batch-card empty" />}
        {shown.map((x, i) => (
          <div key={x.id} className="batch-card" style={{ '--i': i } as React.CSSProperties}>
            <span className={'batch-card-cb' + (x.status !== 0 ? ' done' : '')} />
            <span className="batch-card-title">{x.title || t('common.untitled')}</span>
          </div>
        ))}
      </div>
      <div className="batch-count" aria-live="polite">
        {t('tasks.batch.selected', { count: ids.length })}
      </div>
      {tasks.length > shown.length && <div className="batch-more">{t('tasks.batch.andMore', { count: tasks.length - shown.length })}</div>}

      <div className="batch-actions">
        <button className="batch-act" data-act="date" disabled={none} onClick={open('date')}>
          <Icon name="calendar" size={17} />
          <span>{t('tasks.batch.setDate')}</span>
        </button>
        <div className="batch-act batch-prio" data-act="priority">
          <Icon name="flag" size={17} />
          <span>{t('common.priority')}</span>
          <div className="batch-prio-btns">
            {PRIORITY.map((p) => (
              <button key={p.v} disabled={none} title={t(PRIORITY_NAME[p.v])} aria-label={t(PRIORITY_NAME[p.v])} data-priority={p.v} className={'prio-btn' + (tasks.length && tasks.every((x) => x.priority === p.v) ? ' on' : '')} onClick={() => setPriority(ids, p.v)}>
                <Flag color={p.color} size={16} />
              </button>
            ))}
          </div>
        </div>
        <button className="batch-act" data-act="list" disabled={none} onClick={open('list')}>
          <Icon name="move" size={17} />
          <span>{t('tasks.batch.moveTo')}</span>
        </button>
        <button className="batch-act" data-act="tags" disabled={none} onClick={open('tag')}>
          <Icon name="tag" size={17} />
          <span>{t('shell.task.tags')}</span>
        </button>
        <div className="batch-sep" />
        <button className="batch-act" data-act="complete" disabled={none} onClick={() => completeSelected(ids)}>
          <Icon name="check" size={17} />
          <span>{t(allDone ? 'shell.task.markNotDone' : 'tasks.batch.complete')}</span>
        </button>
        <button className="batch-act" data-act="wontdo" disabled={none || allDone} onClick={() => wontDoSelected(ids)}>
          <Icon name="wontdo" size={17} />
          <span>{t('shell.task.wontDo')}</span>
        </button>
        <button className="batch-act danger" data-act="delete" disabled={none} onClick={() => deleteSelected(ids)}>
          <Icon name="trash" size={17} />
          <span>{t('common.delete')}</span>
        </button>
      </div>

      <div className="batch-foot">
        <button className="btn" data-act="clear" onClick={() => clearSelection(!ui.selectMode)}>
          {t(ui.selectMode ? 'tasks.batch.done' : 'tasks.batch.clear')}
        </button>
        <div className="batch-hint">{t('tasks.batch.hint', { mod })}</div>
      </div>
      <BatchPops pop={pop} ids={ids} data={data} onClose={() => setPop(null)} />
    </div>
  )
}

/** Phones: the bottom action bar of selection mode. */
export function BatchBar() {
  const t = useT()
  const { ids, data } = useSelected()
  const [pop, setPop] = useState<BatchPop>(null)
  const none = ids.length === 0
  const tasks = data.tasks.filter((x) => ids.includes(x.id))
  const allDone = tasks.length > 0 && tasks.every((x) => x.status !== 0)
  const order = visibleOrder()
  const everything = order.length > 0 && order.every((id) => ids.includes(id))
  const open = (kind: PopKind) => (e: React.MouseEvent<HTMLElement>) => setPop({ kind, anchor: anchorOf(e.currentTarget) })
  const acts: { id: string; icon: string; label: string; run: (e: React.MouseEvent<HTMLElement>) => void; danger?: boolean; off?: boolean }[] = [
    { id: 'date', icon: 'calendar', label: t('tasks.swipe.date'), run: open('date') },
    { id: 'priority', icon: 'flag', label: t('common.priority'), run: open('prio') },
    { id: 'list', icon: 'move', label: t('tasks.swipe.move'), run: open('list') },
    { id: 'tags', icon: 'tag', label: t('shell.task.tags'), run: open('tag') },
    { id: 'complete', icon: 'check', label: t(allDone ? 'shell.task.reopen' : 'tasks.batch.complete'), run: () => completeSelected(ids) },
    { id: 'wontdo', icon: 'wontdo', label: t('shell.task.wontDo'), run: () => wontDoSelected(ids), off: allDone },
    { id: 'delete', icon: 'trash', label: t('common.delete'), run: () => deleteSelected(ids), danger: true },
  ]
  return (
    <div className="batch-bar" role="toolbar" aria-label={t('tasks.batch.selected', { count: ids.length })}>
      <div className="batch-bar-head">
        <button className="batch-bar-text" data-act="clear" onClick={() => clearSelection(false)}>
          {t('tasks.batch.done')}
        </button>
        <span className="batch-bar-count" aria-live="polite">
          {t('tasks.batch.selected', { count: ids.length })}
        </span>
        <button
          className="batch-bar-text"
          data-act="all"
          onClick={() => setSelection(everything ? { ...getSelection(), ids: [] } : selectAll(visibleOrder(), getSelection()))}
        >
          {t(everything ? 'tasks.batch.selectNone' : 'tasks.batch.selectAll')}
        </button>
      </div>
      <div className="batch-bar-acts">
        {acts.map((a) => (
          <button key={a.id} className={'batch-bar-btn' + (a.danger ? ' danger' : '')} data-act={a.id} disabled={none || a.off} aria-label={a.label} onClick={a.run}>
            <Icon name={a.icon} size={21} />
            <span>{a.label}</span>
          </button>
        ))}
      </div>
      <BatchPops pop={pop} ids={ids} data={data} onClose={() => setPop(null)} />
    </div>
  )
}
