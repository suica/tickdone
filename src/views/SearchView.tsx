import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { setUI, useData, useUI } from '../store'
import type { Task } from '../types'
import { Icon } from '../components/Icon'
import { TaskRow } from '../components/TaskRow'
import { TaskDetail } from '../components/TaskDetail'
import { useLocale, useT } from '../i18n'
import './search.css'

const HIST_KEY = 'tickdone:search-history'
const HL_NAME = 'tickdone-search'

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HIST_KEY)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5) : []
  } catch {
    return []
  }
}
function saveHistory(h: string[]) {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(h))
  } catch {
    /* ignore */
  }
}

/** Wraps the parts of the text that match the keyword in <mark> */
function highlight(text: string, q: string): ReactNode {
  if (!q) return text
  const lower = text.toLowerCase()
  const out: ReactNode[] = []
  let i = 0
  let k = 0
  for (;;) {
    const j = lower.indexOf(q, i)
    if (j < 0) break
    if (j > i) out.push(text.slice(i, j))
    out.push(<mark key={k++}>{text.slice(j, j + q.length)}</mark>)
    i = j + q.length
  }
  out.push(text.slice(i))
  return out
}

/** A snippet around the match */
function snippet(text: string, q: string) {
  const one = text.replace(/\s+/g, ' ')
  const j = one.toLowerCase().indexOf(q)
  if (j < 0) return one.slice(0, 60)
  const start = Math.max(0, j - 20)
  return (start > 0 ? '…' : '') + one.slice(start, j + q.length + 40) + (j + q.length + 40 < one.length ? '…' : '')
}

interface Hit {
  task: Task
  /** Where it matched other than the title (description / subtasks / tags) */
  extra?: { label: string; text: string }
}

export default function SearchView() {
  const t = useT()
  const locale = useLocale()
  const data = useData()
  const ui = useUI()
  const input = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)
  const [history, setHistory] = useState<string[]>(loadHistory)
  const query = ui.search
  const q = query.trim().toLowerCase()

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const remember = (s: string) => {
    const v = s.trim()
    if (!v) return
    const next = [v, ...history.filter((x) => x !== v)].slice(0, 5)
    setHistory(next)
    saveHistory(next)
  }
  const clearHistory = () => {
    setHistory([])
    saveHistory([])
  }

  const listName = (id: string) => (id === 'inbox' ? t('common.list.inbox') : (data.lists.find((l) => l.id === id)?.name ?? t('common.list.inbox')))

  const { groups, done, lists, tags, total } = useMemo(() => {
    const empty = { groups: [] as { id: string; name: string; color?: string; hits: Hit[] }[], done: [] as Hit[], lists: [] as typeof data.lists, tags: [] as typeof data.tags, total: 0 }
    if (!q) return empty
    const has = (s?: string) => !!s && s.toLowerCase().includes(q)
    const hits: Hit[] = []
    for (const task of data.tasks) {
      if (task.deleted) continue
      let extra: Hit['extra']
      let ok = has(task.title)
      if (has(task.content)) {
        ok = true
        if (!has(task.title)) extra = { label: t('misc.search.inDescription'), text: snippet(task.content, q) }
      }
      const st = task.subtasks.find((s) => has(s.title))
      if (st) {
        ok = true
        if (!extra && !has(task.title)) extra = { label: t('misc.search.inSubtask'), text: st.title }
      }
      const tg = task.tags.find((x) => has(x))
      if (tg) {
        ok = true
        if (!extra && !has(task.title)) extra = { label: t('misc.search.inTag'), text: '#' + tg }
      }
      if (ok) hits.push({ task, extra })
    }
    const order = new Map<string, number>([['inbox', -1], ...data.lists.map((l, i) => [l.id, l.order ?? i] as [string, number])])
    const open = hits.filter((h) => h.task.status === 0).sort((a, b) => a.task.order - b.task.order)
    const map = new Map<string, Hit[]>()
    for (const h of open) {
      const id = order.has(h.task.listId) ? h.task.listId : 'inbox'
      if (!map.has(id)) map.set(id, [])
      map.get(id)!.push(h)
    }
    const groups = [...map.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
      .map(([id, hs]) => ({ id, name: listName(id), color: data.lists.find((l) => l.id === id)?.color, hits: hs }))
    const done = hits.filter((h) => h.task.status !== 0).sort((a, b) => (b.task.completedAt ?? 0) - (a.task.completedAt ?? 0))
    return {
      groups,
      done,
      lists: data.lists.filter((l) => has(l.name)),
      tags: data.tags.filter((x) => has(x.name)),
      total: hits.length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, data.tasks, data.lists, data.tags, locale])

  // Highlights the title text inside TaskRow (whose rendering we don't control) with the CSS Custom Highlight API
  useEffect(() => {
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const HL = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
    if (!reg || !HL) return
    reg.delete(HL_NAME)
    const root = results.current
    if (!q || !root) return
    const ranges: Range[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement
      if (!p || p.closest('mark, .search-group-head, .search-snippet')) continue
      const s = (n.nodeValue ?? '').toLowerCase()
      let i = s.indexOf(q)
      while (i >= 0) {
        const r = new Range()
        r.setStart(n, i)
        r.setEnd(n, i + q.length)
        ranges.push(r)
        i = s.indexOf(q, i + q.length)
      }
    }
    if (ranges.length) reg.set(HL_NAME, new HL(...ranges))
    return () => {
      reg.delete(HL_NAME)
    }
  })

  const setQuery = (s: string) => setUI({ search: s })

  const renderHit = (h: Hit) => (
    <div key={h.task.id} className="search-hit">
      <TaskRow task={h.task} showList />
      {h.extra && (
        <div className="search-snippet">
          <span className="search-snippet-label">{h.extra.label}</span>
          {highlight(h.extra.text, q)}
        </div>
      )}
    </div>
  )

  return (
    <div className="module search-module">
      <div className="search-main">
        <div className="search-bar">
          <Icon name="search" size={18} className="search-bar-icon" />
          <input
            ref={input}
            className="search-input"
            placeholder={t('misc.search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') remember(query)
              else if (e.key === 'Escape' && query) {
                e.stopPropagation()
                setQuery('')
              }
            }}
            onBlur={() => total > 0 && remember(query)}
          />
          {query && (
            <button className="icon-btn search-clear" title={t('misc.clear')} onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(''); input.current?.focus() }}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        <div className="search-results" ref={results}>
          {!q ? (
            history.length > 0 ? (
              <div className="search-history">
                <div className="search-history-head">
                  <span>{t('misc.search.history')}</span>
                  <button className="search-link" onClick={clearHistory}>{t('misc.clear')}</button>
                </div>
                {history.map((h) => (
                  <div key={h} className="search-history-item" onClick={() => { setQuery(h); remember(h); input.current?.focus() }}>
                    <Icon name="clock" size={15} />
                    <span>{h}</span>
                    <button
                      className="icon-btn search-history-del"
                      title={t('common.delete')}
                      onClick={(e) => {
                        e.stopPropagation()
                        const next = history.filter((x) => x !== h)
                        setHistory(next)
                        saveHistory(next)
                      }}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                <Icon name="search" size={48} stroke={1.2} />
                <div>{t('misc.search.hint')}</div>
              </div>
            )
          ) : total === 0 && lists.length === 0 && tags.length === 0 ? (
            <div className="empty">
              <Icon name="search" size={48} stroke={1.2} />
              <div>{t('misc.search.noResults')}</div>
              <div className="search-empty-sub">{t('misc.search.tryAnother')}</div>
            </div>
          ) : (
            <>
              {(lists.length > 0 || tags.length > 0) && (
                <div className="search-chips">
                  {lists.map((l) => (
                    <button key={l.id} className="search-chip" onClick={() => { remember(query); setUI({ module: 'tasks', view: 'list:' + l.id }) }}>
                      <Icon name="list" size={14} style={{ color: l.color }} />
                      {highlight(l.name, q)}
                    </button>
                  ))}
                  {tags.map((tg) => (
                    <button key={tg.name} className="search-chip" onClick={() => { remember(query); setUI({ module: 'tasks', view: 'tag:' + tg.name }) }}>
                      <Icon name="tag" size={14} style={{ color: tg.color }} />
                      {highlight(tg.name, q)}
                    </button>
                  ))}
                </div>
              )}
              {total > 0 && <div className="search-total">{t('misc.count.tasks', { count: total })}</div>}
              {groups.map((g) => (
                <div key={g.id} className="search-group">
                  <div className="search-group-head">
                    <Icon name={g.id === 'inbox' ? 'inbox' : 'list'} size={14} style={{ color: g.color }} />
                    <span>{g.name}</span>
                    <span className="search-group-count">{g.hits.length}</span>
                  </div>
                  {g.hits.map(renderHit)}
                </div>
              ))}
              {done.length > 0 && (
                <div className="search-group search-group-done">
                  <div className="search-group-head">
                    <Icon name="done" size={14} />
                    <span>{t('common.list.completed')}</span>
                    <span className="search-group-count">{done.length}</span>
                  </div>
                  {done.map(renderHit)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {ui.selectedTaskId && <TaskDetail floating />}
    </div>
  )
}
