import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { blockTouchScrollWhileDragging, pressToDrag } from '../dnd'
import { useT } from '../i18n'
import { cancelAnimations, dur, ease, play } from '../motion'
import { getData, toast } from '../store'
import type { Subtask, Task } from '../types'
import { Icon } from './Icon'

interface Props {
  task: Task
  ro: boolean
  set: (p: Partial<Task>) => void
  focusSub: string | null
  setFocusSub: (id: string | null) => void
  addSubAfter: (idx: number) => void
}

const lift = () => getComputedStyle(document.documentElement).getPropertyValue('--shadow').trim() || 'none'

/**
 * The detail panel's subtask checklist. Rows reorder by dragging (grip, checkbox or row padding:
 * mouse after 4px, touch after a 350ms long press) or with Alt+Up/Down while editing a row.
 */
export function Subtasks({ task, ro, set, focusSub, setFocusSub, addSubAfter }: Props) {
  const t = useT()
  const listRef = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  /** y of the insertion line inside the list while dragging */
  const [line, setLine] = useState<number | null>(null)
  /** after a drop: where the dropped row was released, to glide it into its new slot */
  const settle = useRef<{ id: string; top: number } | null>(null)
  /** after a keyboard move: keep editing the moved row */
  const refocus = useRef<string | null>(null)

  useEffect(() => blockTouchScrollWhileDragging(listRef.current), [])

  useLayoutEffect(() => {
    const list = listRef.current
    const r = refocus.current
    if (list && r) {
      refocus.current = null
      list.querySelector<HTMLInputElement>(`[data-sub-id="${CSS.escape(r)}"] input`)?.focus()
    }
    const s = settle.current
    if (!list || !s) return
    settle.current = null
    const row = list.querySelector<HTMLElement>(`[data-sub-id="${CSS.escape(s.id)}"]`)
    if (!row) return
    const dy = s.top - row.getBoundingClientRect().top
    play(row, [{ transform: `translateY(${dy}px) scale(1.02)`, boxShadow: lift() }, { transform: 'none', boxShadow: 'none' }], dur('--dur'), ease('--ease-out')).then(() => cancelAnimations(row))
  })

  const subs = task.subtasks
  const setSub = (id: string, p: Partial<Subtask>) => set({ subtasks: subs.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const moveBy = (i: number, delta: number) => {
    const j = i + delta
    if (j < 0 || j >= subs.length) return
    const next = [...subs]
    const [s] = next.splice(i, 1)
    next.splice(j, 0, s)
    refocus.current = s.id
    set({ subtasks: next })
  }

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>, s: Subtask) => {
    const list = listRef.current
    if (ro || !list || subs.length < 2) return
    if ((e.target as Element).closest('input, textarea, button')) return
    const row = e.currentTarget
    const scroller = list.closest<HTMLElement>('.detail-scroll')
    const y0 = e.clientY
    let rows: { id: string; top: number; h: number }[] = []
    let scroll0 = 0
    let index = -1

    const update = (y: number) => {
      const ty = y - y0 + (scroller ? scroller.scrollTop - scroll0 : 0)
      row.style.transform = `translateY(${ty}px) scale(1.02)`
      const py = y - list.getBoundingClientRect().top
      const others = rows.filter((r) => r.id !== s.id)
      let i = others.findIndex((r) => py < r.top + r.h / 2)
      if (i < 0) i = others.length
      if (i === index) return
      index = i
      const last = others[others.length - 1]
      setLine(i < others.length ? others[i].top : last.top + last.h)
    }
    const glideBack = () => {
      const from = row.style.transform
      row.style.transform = ''
      if (from) play(row, [{ transform: from }, { transform: 'none' }], dur('--dur'), ease('--ease-out')).then(() => cancelAnimations(row))
    }

    pressToDrag(
      e.nativeEvent,
      {
        onStart(p) {
          const lr = list.getBoundingClientRect()
          rows = [...list.querySelectorAll<HTMLElement>('[data-sub-id]')].map((el) => {
            const r = el.getBoundingClientRect()
            return { id: el.dataset.subId!, top: r.top - lr.top, h: r.height }
          })
          scroll0 = scroller?.scrollTop ?? 0
          ;(document.activeElement as HTMLElement | null)?.blur?.()
          setDragId(s.id)
          update(p.y)
        },
        onMove: (p) => update(p.y),
        onDrop() {
          setDragId(null)
          setLine(null)
          const cur = getData().tasks.find((t) => t.id === task.id)?.subtasks ?? subs
          const from = cur.findIndex((x) => x.id === s.id)
          if (from < 0 || index < 0 || index === from) return glideBack()
          const next = cur.filter((x) => x.id !== s.id)
          next.splice(index, 0, cur[from])
          settle.current = { id: s.id, top: row.getBoundingClientRect().top }
          row.style.transform = ''
          const snap = getData()
          set({ subtasks: next })
          toast(t('shell.subtasks.reordered'), snap)
        },
        onCancel() {
          setDragId(null)
          setLine(null)
          glideBack()
        },
      },
      scroller,
    )
  }

  return (
    <div className={'subtasks' + (dragId ? ' sorting' : '')} ref={listRef}>
      {subs.map((s, i) => (
        <div className={'subtask' + (s.done ? ' done' : '') + (dragId === s.id ? ' dragging' : '')} key={s.id} data-sub-id={s.id} onPointerDown={(e) => onPointerDown(e, s)}>
          {!ro && subs.length > 1 && (
            <span className="subtask-grip" aria-hidden="true">
              <Icon name="drag" size={14} stroke={2.6} />
            </span>
          )}
          <span className={'checkbox sm' + (s.done ? ' checked' : '')} onClick={() => !ro && setSub(s.id, { done: !s.done })}>
            {s.done && <Icon name="check" size={10} stroke={3} />}
          </span>
          <input
            value={s.title}
            autoFocus={focusSub === s.id}
            placeholder={t('shell.subtasks.placeholder')}
            readOnly={ro}
            onChange={(e) => setSub(s.id, { title: e.target.value })}
            onKeyDown={(e) => {
              if (ro) return
              if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault()
                moveBy(i, e.key === 'ArrowUp' ? -1 : 1)
              } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                addSubAfter(i)
              } else if (e.key === 'Backspace' && !s.title) {
                e.preventDefault()
                set({ subtasks: subs.filter((x) => x.id !== s.id) })
                const prev = subs[i - 1]
                if (prev) setFocusSub(prev.id)
              }
            }}
          />
          {!ro && (
            <button className="subtask-del" title={t('common.delete')} onClick={() => set({ subtasks: subs.filter((x) => x.id !== s.id) })}>
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
      ))}
      {line != null && <div className="subtask-line" style={{ top: line }} />}
    </div>
  )
}
