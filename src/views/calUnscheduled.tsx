import { useMemo, useState, type RefObject } from 'react'
import { useData } from '../store'
import { useT } from '../i18n'
import { activeLists } from '../views'
import { Icon } from '../components/Icon'
import { CalTask } from './calParts'
import { unscheduledTasks, type ListFilter } from './calPlan'
import { useColorOf } from './calUtil'
import type { GridApi } from './CalTimeGrid'

const LIST_KEY = 'tickdone:cal:unschedList'

function loadList(): ListFilter {
  try {
    return localStorage.getItem(LIST_KEY) || 'all'
  } catch {
    return 'all'
  }
}

interface Props {
  /** Starts a drag in the time grid next to the panel. */
  grid: RefObject<GridApi | null>
  /** The task being moved in the grid, and whether it is over this panel. */
  moving: { id: string; out: boolean } | null
  /** A bottom sheet (phones) instead of a side panel. */
  sheet: boolean
  onClose: () => void
}

/**
 * The open tasks that have no date yet, next to the week and day views (a bottom sheet on phones).
 * Drag one onto a day or a time to schedule it; drop a task from the calendar here to remove its date.
 */
export function UnscheduledPanel({ grid, moving, sheet, onClose }: Props) {
  const t = useT()
  const data = useData()
  const colorOf = useColorOf()
  const [list, setListState] = useState<ListFilter>(loadList)
  const lists = activeLists(data)
  // A list that was deleted or archived since falls back to all lists.
  const filter = list === 'all' || list === 'inbox' || lists.some((l) => l.id === list) ? list : 'all'
  const tasks = useMemo(() => unscheduledTasks(data, filter), [data, filter])
  const setList = (v: ListFilter) => {
    setListState(v)
    try {
      localStorage.setItem(LIST_KEY, v)
    } catch {
      /* storage unavailable */
    }
  }
  // A dated task from the calendar can be dropped here; a row of this panel can't.
  const movingDated = !!moving && !tasks.some((x) => x.id === moving.id)

  return (
    <aside
      className={'cal-unsched' + (sheet ? ' sheet' : '') + (moving && sheet && !moving.out ? ' peek' : '') + (movingDated ? ' droppable' : '') + (moving?.out && movingDated ? ' drop-over' : '')}
      aria-label={t('calendar.unsched.toggle')}
    >
      {sheet && <div className="cal-unsched-grip" aria-hidden="true" />}
      <div className="cal-unsched-head">
        <h3>{t('calendar.unsched.title')}</h3>
        <span className="cal-unsched-count">{tasks.length}</span>
        <button className="icon-btn cal-unsched-close" title={t('common.close')} aria-label={t('common.close')} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <select className="cal-unsched-filter" value={filter} aria-label={t('calendar.unsched.filter')} onChange={(e) => setList(e.target.value)}>
        <option value="all">{t('calendar.unsched.allLists')}</option>
        <option value="inbox">{t('common.list.inbox')}</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <div className="cal-unsched-body">
        {tasks.length === 0 ? (
          <div className="cal-unsched-empty">{t('calendar.unsched.empty')}</div>
        ) : (
          <>
            <p className="cal-unsched-hint">{t('calendar.unsched.hint')}</p>
            {tasks.map((task) => (
              <div key={task.id} className={'cal-unsched-item' + (moving?.id === task.id ? ' cal-src' : '')}>
                <CalTask task={task} color={colorOf(task)} onPointerDown={(e) => grid.current?.startMove(e, task, e.currentTarget)} />
              </div>
            ))}
          </>
        )}
      </div>
      {movingDated && <div className="cal-unsched-drop">{t('calendar.unsched.drop')}</div>}
    </aside>
  )
}
