import { useMemo, useRef, useState } from 'react'
import { dueLabel } from '../dates'
import { useT, type MessageKey } from '../i18n'
import { quickParse } from '../quickParse'
import { addTask, useData } from '../store'
import type { Priority, Task } from '../types'
import { PRIORITY } from '../views'
import { DatePicker, type DateValue } from './DatePicker'
import { Flag, Icon } from './Icon'
import { markEnter } from './taskMotion'
import { anchorOf, MenuList, Popover, type Anchor } from './Popover'

interface Props {
  defaults?: Partial<Task>
  placeholder?: string
  compact?: boolean
  autoFocus?: boolean
  onAdded?: (task: Task) => void
  onCancel?: () => void
  /** the phone bottom panel: tool buttons always shown, plus tags and a send button */
  sheet?: boolean
}

interface Suggest {
  kind: 'tag' | 'list' | 'priority'
  start: number
  query: string
}

/** Menu names of the priorities. */
const PRIORITY_NAME: Record<Priority, MessageKey> = {
  5: 'common.priorityGroup.high',
  3: 'common.priorityGroup.medium',
  1: 'common.priorityGroup.low',
  0: 'common.priorityGroup.none',
}
/** What a priority suggestion inserts after "!" (a word the quick-add parser understands). */
const PRIORITY_TOKEN: Record<Priority, MessageKey> = {
  5: 'tasks.quickAdd.token.high',
  3: 'tasks.quickAdd.token.medium',
  1: 'tasks.quickAdd.token.low',
  0: 'tasks.quickAdd.token.none',
}

export function QuickAdd({ defaults = {}, placeholder, compact, autoFocus, onAdded, onCancel, sheet }: Props) {
  const t = useT()
  const data = useData()
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [manual, setManual] = useState<DateValue | null>(null)
  const [prio, setPrio] = useState<Priority | null>(null)
  const [pop, setPop] = useState<{ kind: 'date' | 'prio' | 'list' | 'tag'; anchor: Anchor } | null>(null)
  const [suggest, setSuggest] = useState<Suggest | null>(null)
  const [sIdx, setSIdx] = useState(0)
  const [listOverride, setListOverride] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)

  const listNames = useMemo(() => data.lists.map((l) => l.name), [data.lists])
  const parsed = useMemo(() => quickParse(text, listNames), [text, listNames])

  const listId = listOverride ?? (parsed.listName ? data.lists.find((l) => l.name === parsed.listName)?.id : undefined) ?? defaults.listId ?? 'inbox'
  const listName = (listId !== 'inbox' && data.lists.find((l) => l.id === listId)?.name) || t('common.list.inbox')
  const date: DateValue = manual ?? {
    dueDate: parsed.dueDate ?? defaults.dueDate,
    dueTime: parsed.dueTime ?? defaults.dueTime,
  }
  const priority: Priority = prio ?? parsed.priority ?? defaults.priority ?? 0

  // tag suggestions insert the tag, list suggestions pick the list (value = list id), priority ones insert a token
  const suggestions = useMemo((): { label: string; value: string; p?: Priority }[] => {
    if (!suggest) return []
    const q = suggest.query.toLowerCase()
    if (suggest.kind === 'tag') {
      const all = data.tags.map((tag) => tag.name).filter((n) => n.toLowerCase().includes(q))
      if (q && !all.some((n) => n.toLowerCase() === q)) all.push(suggest.query)
      return all.map((n) => ({ label: '#' + n, value: n }))
    }
    if (suggest.kind === 'list')
      return [{ id: 'inbox', name: t('common.list.inbox') }, ...data.lists]
        .filter((l) => l.name.toLowerCase().includes(q))
        .map((l) => ({ label: l.name, value: l.id }))
    return ([5, 3, 1, 0] as Priority[])
      .map((p) => ({ label: t(PRIORITY_NAME[p]), value: t(PRIORITY_TOKEN[p]), p }))
      .filter((x) => !q || x.value.includes(q) || x.label.toLowerCase().includes(q))
  }, [suggest, data.tags, data.lists, t])

  const detectSuggest = (value: string, caret: number) => {
    const before = value.slice(0, caret)
    const m = /(?:^|\s)([#^~!])([^\s#^~!]*)$/.exec(before)
    if (!m) return setSuggest(null)
    const kind = m[1] === '#' ? 'tag' : m[1] === '!' ? 'priority' : 'list'
    setSuggest({ kind, start: caret - m[2].length - 1, query: m[2] })
    setSIdx(0)
  }

  const applySuggest = (value: string) => {
    if (!suggest) return
    const caret = inputRef.current?.selectionStart ?? text.length
    const sym = text[suggest.start]
    if (suggest.kind === 'list') {
      setListOverride(value)
      const next = text.slice(0, suggest.start) + text.slice(caret)
      setText(next)
    } else {
      const ins = sym + value + ' '
      setText(text.slice(0, suggest.start) + ins + text.slice(caret))
    }
    setSuggest(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const submit = () => {
    if (!parsed.title.trim()) return
    const added = addTask({
      ...defaults,
      title: parsed.title,
      listId,
      priority,
      dueDate: date.dueDate,
      dueTime: date.dueTime,
      reminder: date.reminder ?? (date.dueTime ? 0 : defaults.reminder),
      repeat: date.repeat ?? defaults.repeat,
      tags: [...new Set([...(defaults.tags ?? []), ...parsed.tags])],
    })
    markEnter(added.id)
    setText('')
    setManual(null)
    setPrio(null)
    setListOverride(null)
    onAdded?.(added)
  }

  // highlight layer: recognised dates, priorities and tags get a background
  const segments = useMemo(() => {
    const out: { s: string; k?: string }[] = []
    let pos = 0
    for (const sp of parsed.spans) {
      if (sp.start > pos) out.push({ s: text.slice(pos, sp.start) })
      out.push({ s: text.slice(sp.start, sp.end), k: sp.kind })
      pos = sp.end
    }
    out.push({ s: text.slice(pos) })
    return out
  }, [parsed, text])

  const active = sheet || focused || !!text || !!pop
  const hasDate = !!date.dueDate
  const ph = placeholder ?? t(sheet ? 'tasks.quickAdd.placeholderShort' : 'tasks.quickAdd.placeholder', { list: listName })

  const addTag = (name: string) => {
    if (!parsed.tags.includes(name)) setText((v) => (v && !v.endsWith(' ') ? v + ' ' : v) + '#' + name + ' ')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className={'quick-add' + (active ? ' active' : '') + (compact ? ' compact' : '') + (sheet ? ' sheet' : '')}>
      <div className="qa-field">
        <div className="qa-mirror" ref={mirrorRef} aria-hidden>
          {segments.map((x, i) => (
            <span key={i} className={x.k ? 'qa-hl qa-hl-' + x.k : undefined}>
              {x.s}
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          className="quick-add-input"
          value={text}
          autoFocus={autoFocus}
          placeholder={ph}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            setTimeout(() => setSuggest(null), 150)
          }}
          onScroll={(e) => {
            if (mirrorRef.current) mirrorRef.current.scrollLeft = e.currentTarget.scrollLeft
          }}
          onChange={(e) => {
            setText(e.target.value)
            detectSuggest(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }}
          onKeyDown={(e) => {
            if (suggest && suggestions.length) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSIdx((i) => (i + 1) % suggestions.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSIdx((i) => (i - 1 + suggestions.length) % suggestions.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                applySuggest(suggestions[sIdx].value)
                return
              }
            }
            if (e.key === 'Escape') {
              if (suggest) return setSuggest(null)
              setText('')
              ;(e.target as HTMLInputElement).blur()
              onCancel?.()
            }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {suggest && suggestions.length > 0 && focused && (
          <div className="qa-suggest menu">
            {suggestions.map((s, i) => (
              <div
                key={s.label}
                className={'menu-item' + (i === sIdx ? ' hover' : '')}
                onMouseDown={(e) => {
                  e.preventDefault()
                  applySuggest(s.value)
                }}
              >
                {s.p !== undefined && <Flag color={PRIORITY.find((p) => p.v === s.p)!.color} size={14} />}
                {suggest.kind === 'list' && <Icon name="list" size={14} />}
                <span className="menu-label">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {active && (
        <div className="qa-tools" onMouseDown={(e) => e.preventDefault()}>
          <button
            className={'qa-tool' + (hasDate ? ' on' : '')}
            title={t('tasks.quickAdd.date')}
            onClick={(e) => setPop({ kind: 'date', anchor: anchorOf(e.currentTarget) })}
          >
            <Icon name="calendar" size={16} />
            {hasDate && <span>{dueLabel(date)}</span>}
          </button>
          <button className="qa-tool" title={t('common.priority')} onClick={(e) => setPop({ kind: 'prio', anchor: anchorOf(e.currentTarget) })}>
            <Flag color={PRIORITY.find((p) => p.v === priority)!.color} size={15} />
          </button>
          {sheet && (
            <button className="qa-tool" title={t('tasks.quickAdd.tags')} onClick={(e) => setPop({ kind: 'tag', anchor: anchorOf(e.currentTarget) })}>
              <Icon name="tag" size={16} />
            </button>
          )}
          {!compact && (
            <button className="qa-tool" title={t('tasks.quickAdd.list')} onClick={(e) => setPop({ kind: 'list', anchor: anchorOf(e.currentTarget) })}>
              <Icon name="move" size={16} />
              {sheet && <span>{listName}</span>}
            </button>
          )}
          {sheet && (
            <button className="qa-send" title={t('common.add')} aria-label={t('common.add')} disabled={!parsed.title.trim()} onClick={submit}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
              </svg>
            </button>
          )}
        </div>
      )}
      {pop?.kind === 'date' && (
        <DatePicker
          anchor={pop.anchor}
          value={date}
          onChange={(v) => {
            setManual(v)
            inputRef.current?.focus()
          }}
          onClose={() => setPop(null)}
        />
      )}
      {pop?.kind === 'prio' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)}>
          <MenuList
            onClose={() => setPop(null)}
            items={PRIORITY.map((p) => ({
              label: t(PRIORITY_NAME[p.v]),
              icon: <Flag color={p.color} size={14} />,
              checked: p.v === priority,
              onClick: () => {
                setPrio(p.v)
                inputRef.current?.focus()
              },
            }))}
          />
        </Popover>
      )}
      {pop?.kind === 'tag' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)}>
          <MenuList
            onClose={() => setPop(null)}
            items={
              data.tags.length
                ? data.tags.map((tag) => ({
                    label: tag.name,
                    icon: <Icon name="tag" size={14} style={tag.color ? { color: tag.color } : undefined} />,
                    checked: parsed.tags.includes(tag.name),
                    onClick: () => addTag(tag.name),
                  }))
                : [{ label: t('tasks.quickAdd.noTags'), disabled: true }]
            }
          />
        </Popover>
      )}
      {pop?.kind === 'list' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)}>
          <MenuList
            onClose={() => setPop(null)}
            items={[{ id: 'inbox', name: t('common.list.inbox'), color: undefined as string | undefined }, ...data.lists].map((l) => ({
              label: l.name,
              icon: l.color ? <i className="dot" style={{ background: l.color }} /> : <Icon name={l.id === 'inbox' ? 'inbox' : 'list'} size={14} />,
              checked: l.id === listId,
              onClick: () => {
                setListOverride(l.id)
                inputRef.current?.focus()
              },
            }))}
          />
        </Popover>
      )}
    </div>
  )
}
