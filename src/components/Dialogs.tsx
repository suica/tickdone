import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { LIST_COLORS, addList, deleteList, deleteTag, renameTag, setData, setUI, toast, uid, updateList, useData, useUI, getData } from '../store'
import type { AppData, Settings } from '../types'
import { isPhone, usePhone } from '../viewport'
import { LOCALES, setLocale, t, useLocale, useT, type Locale, type MessageKey } from '../i18n'
import { dayName } from './dateLabels'
import { Icon } from './Icon'
import { usePresence } from './motion'
import { SubscriptionsTab } from './Subscriptions'
import './dialogs.css'

const close = () => setUI({ dialog: undefined })

/** True while the dialog plays its leave animation (it stays mounted for --dur after closing). */
const ClosingContext = createContext(false)

export function Dialogs() {
  const ui = useUI()
  const [d, closing] = usePresence(ui.dialog)
  if (!d) return null
  const key = d.kind + ':' + (d.id ?? '')
  let el: ReactNode = null
  switch (d.kind) {
    case 'list':
      el = <ListDialog key={key} id={d.id} />
      break
    case 'folder':
      el = <FolderDialog key={key} id={d.id} />
      break
    case 'tag':
      el = <TagDialog key={key} id={d.id} />
      break
    case 'settings':
      el = <SettingsDialog key={key} />
      break
    case 'shortcuts':
      el = <ShortcutsDialog key={key} />
      break
  }
  return <ClosingContext.Provider value={closing}>{el}</ClosingContext.Provider>
}

// ---------------- shared shell ----------------
function Modal({
  title,
  children,
  foot,
  onSubmit,
  className = '',
  width,
}: {
  title?: ReactNode
  children: ReactNode
  foot?: ReactNode
  onSubmit?: () => void
  className?: string
  width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const submitRef = useRef(onSubmit)
  submitRef.current = onSubmit
  const closing = useContext(ClosingContext)
  const t = useT()
  useEffect(() => {
    // Focus the first input
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input[type=text], input:not([type])')
    el?.focus()
    if (el instanceof HTMLInputElement) el.select()
  }, [])
  useEffect(() => {
    if (closing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Runs before the global shortcuts so the task details don't close as well
        e.stopPropagation()
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [closing])
  return (
    <div className={'modal-mask dlg-mask' + (closing ? ' closing' : '')} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={ref}
        className={'modal dlg ' + className}
        style={width ? ({ '--dlg-w': width + 'px' } as CSSProperties) : undefined}
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && submitRef.current) {
            const t = e.target as HTMLElement
            if (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'SELECT') return
            e.preventDefault()
            submitRef.current()
          }
        }}
      >
        {title !== undefined && (
          <div className="modal-head">
            <span>{title}</span>
            <button className="icon-btn" onClick={close} title={t('common.close')}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {children}
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  )
}

function ColorPicker({ value, onChange }: { value?: string; onChange: (c?: string) => void }) {
  const t = useT()
  return (
    <div className="dlg-colors">
      <button type="button" className={'dlg-color none' + (!value ? ' on' : '')} title={t('misc.dialog.noColor')} onClick={() => onChange(undefined)}>
        <span />
      </button>
      {LIST_COLORS.map((c) => (
        <button
          type="button"
          key={c}
          className={'dlg-color' + (value === c ? ' on' : '')}
          style={{ background: c }}
          title={c}
          onClick={() => onChange(c)}
        >
          {value === c && <Icon name="check" size={12} stroke={2.5} />}
        </button>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dlg-field">
      <div className="dlg-label">{label}</div>
      {children}
    </div>
  )
}

// ---------------- list ----------------
function ListDialog({ id }: { id?: string }) {
  const t = useT()
  const data = useData()
  const list = id ? data.lists.find((l) => l.id === id) : undefined
  const [name, setName] = useState(list?.name ?? '')
  const [color, setColor] = useState<string | undefined>(list?.color)
  const [folderId, setFolderId] = useState<string>(list?.folderId ?? '')
  const [view, setView] = useState<'list' | 'kanban'>(list?.view ?? 'list')
  const trimmed = name.trim()
  const dup = data.lists.some((l) => l.name === trimmed && l.id !== id)

  const submit = () => {
    if (!trimmed) return
    const p = { name: trimmed, color, folderId: folderId || undefined, view }
    if (list) {
      updateList(list.id, p)
    } else {
      const l = addList(p)
      setUI({ view: 'list:' + l.id, module: 'tasks' })
    }
    close()
  }

  return (
    <Modal
      title={list ? t('tasks.menu.editList') : t('tasks.sidebar.addList')}
      onSubmit={submit}
      foot={
        <>
          {list && (
            <button
              className="btn dlg-danger-link"
              onClick={() => {
                if (confirm(t('shell.confirm.deleteList', { name: list.name }))) {
                  close()
                  deleteList(list.id)
                }
              }}
            >
              {t('misc.list.delete')}
            </button>
          )}
          <span className="dlg-spacer" />
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!trimmed} onClick={submit}>
            {list ? t('common.save') : t('common.add')}
          </button>
        </>
      }
    >
      <div className="modal-body">
        <div className="dlg-name-row">
          <span className="dlg-name-icon" style={{ color: color ?? 'var(--text-3)' }}>
            <Icon name="list" size={18} />
          </span>
          <input className="input" type="text" placeholder={t('misc.list.name')} maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {dup && <div className="dlg-hint">{t('misc.list.duplicate')}</div>}
        <Field label={t('misc.list.color')}>
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label={t('misc.list.view')}>
          <div className="dlg-seg">
            <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
              <Icon name="list" size={15} /> {t('misc.list.viewList')}
            </button>
            <button type="button" className={view === 'kanban' ? 'on' : ''} onClick={() => setView('kanban')}>
              <Icon name="kanban" size={15} /> {t('misc.list.viewKanban')}
            </button>
          </div>
        </Field>
        <Field label={t('misc.list.folder')}>
          <select className="input dlg-select" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">{t('shell.menu.noFolder')}</option>
            {[...data.folders]
              .sort((a, b) => a.order - b.order)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

// ---------------- folder ----------------
function FolderDialog({ id }: { id?: string }) {
  const t = useT()
  const data = useData()
  const folder = id ? data.folders.find((f) => f.id === id) : undefined
  const [name, setName] = useState(folder?.name ?? '')
  const trimmed = name.trim()

  const submit = () => {
    if (!trimmed) return
    if (folder) {
      setData((d) => ({ ...d, folders: d.folders.map((f) => (f.id === folder.id ? { ...f, name: trimmed } : f)) }))
    } else {
      setData((d) => ({ ...d, folders: [...d.folders, { id: uid(), name: trimmed, order: Math.max(0, ...d.folders.map((f) => f.order)) + 1 }] }))
    }
    close()
  }

  const ungroup = () => {
    if (!folder) return
    const snap = getData()
    setData((d) => ({
      ...d,
      folders: d.folders.filter((f) => f.id !== folder.id),
      lists: d.lists.map((l) => (l.folderId === folder.id ? { ...l, folderId: undefined } : l)),
    }))
    close()
    toast(t('misc.folder.ungrouped'), snap)
  }

  return (
    <Modal
      title={folder ? t('misc.folder.rename') : t('misc.folder.new')}
      onSubmit={submit}
      foot={
        <>
          {folder && (
            <button className="btn dlg-danger-link" onClick={ungroup}>
              {t('misc.folder.ungroup')}
            </button>
          )}
          <span className="dlg-spacer" />
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!trimmed} onClick={submit}>
            {folder ? t('common.save') : t('common.add')}
          </button>
        </>
      }
    >
      <div className="modal-body">
        <div className="dlg-name-row">
          <span className="dlg-name-icon">
            <Icon name="folder" size={18} />
          </span>
          <input className="input" type="text" placeholder={t('misc.folder.name')} maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {folder && <div className="dlg-hint muted">{t('misc.folder.ungroupHint')}</div>}
      </div>
    </Modal>
  )
}

// ---------------- tag ----------------
function TagDialog({ id }: { id?: string }) {
  const t = useT()
  const data = useData()
  const tag = id ? data.tags.find((x) => x.name === id) : undefined
  const [name, setName] = useState(tag?.name ?? '')
  const [color, setColor] = useState<string | undefined>(tag?.color)
  const trimmed = name.trim().replace(/^#/, '').replace(/\s+/g, '')
  const dup = data.tags.some((x) => x.name === trimmed && x.name !== tag?.name)
  const ok = !!trimmed && !dup

  const submit = () => {
    if (!ok) return
    if (tag) {
      renameTag(tag.name, trimmed, color)
      // renameTag keeps the old color when color is undefined, so clear it explicitly
      if (!color && tag.color) setData((d) => ({ ...d, tags: d.tags.map((x) => (x.name === trimmed ? { name: x.name } : x)) }))
    } else {
      setData((d) => ({ ...d, tags: [...d.tags, { name: trimmed, color }] }))
    }
    close()
  }

  return (
    <Modal
      title={tag ? t('misc.tag.edit') : t('misc.tag.add')}
      onSubmit={submit}
      foot={
        <>
          {tag && (
            <button
              className="btn dlg-danger-link"
              onClick={() => {
                if (confirm(t('misc.tag.confirmDelete', { name: tag.name }))) {
                  close()
                  deleteTag(tag.name)
                }
              }}
            >
              {t('misc.tag.delete')}
            </button>
          )}
          <span className="dlg-spacer" />
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!ok} onClick={submit}>
            {tag ? t('common.save') : t('common.add')}
          </button>
        </>
      }
    >
      <div className="modal-body">
        <div className="dlg-name-row">
          <span className="dlg-name-icon" style={{ color: color ?? 'var(--text-3)' }}>
            <Icon name="tag" size={18} />
          </span>
          <input className="input" type="text" placeholder={t('misc.tag.name')} maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {dup && <div className="dlg-hint">{t('misc.tag.duplicate')}</div>}
        <Field label={t('misc.tag.color')}>
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------- keyboard shortcuts ----------------
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'

function shortcuts(): { group: string; items: [string, string[]][] }[] {
  const priorities = (['high', 'medium', 'low'] as const).map((p) => '!' + t(`tasks.quickAdd.token.${p}`)).join(' / ')
  return [
    {
      group: t('misc.settings.general'),
      items: [
        [t('misc.keys.newTask'), ['N']],
        [t('common.search'), [MOD, 'F']],
        [t('common.undo'), [MOD, 'Z']],
        [t('misc.keys.showShortcuts'), ['?']],
        [t('misc.keys.close'), ['Esc']],
      ],
    },
    {
      group: t('misc.keys.modules'),
      items: [
        [t('common.module.tasks'), ['Alt', '1']],
        [t('common.module.calendar'), ['Alt', '2']],
        [t('common.module.matrix'), ['Alt', '3']],
        [t('common.module.focus'), ['Alt', '4']],
        [t('common.module.habits'), ['Alt', '5']],
        [t('common.search'), ['Alt', '6']],
      ],
    },
    {
      group: t('common.module.tasks'),
      items: [
        [t('misc.keys.deleteTask'), ['Delete']],
        [t('misc.keys.toggleDone'), [MOD, 'Enter']],
        [t('misc.keys.quickDate'), [t('misc.keys.dateExample')]],
        [t('misc.keys.quickPriority'), [priorities]],
        [t('misc.keys.quickTag'), [t('misc.keys.tagExample')]],
      ],
    },
  ]
}

function ShortcutList() {
  useLocale()
  return (
    <div className="dlg-keys">
      {shortcuts().map((g) => (
        <div key={g.group} className="dlg-keys-group">
          <div className="dlg-keys-title">{g.group}</div>
          {g.items.map(([label, keys]) => (
            <div key={label} className="dlg-keys-row">
              <span>{label}</span>
              <span className="dlg-kbds">
                {keys.map((k, i) => (
                  <kbd key={i}>{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function ShortcutsDialog() {
  const t = useT()
  return (
    <Modal title={t('misc.keys.title')} width={480}>
      <div className="modal-body dlg-scroll">
        <ShortcutList />
      </div>
    </Modal>
  )
}

// ---------------- settings ----------------
type Tab = 'general' | 'feeds' | 'pomo' | 'data' | 'keys' | 'about'
const TABS: { id: Tab; label: MessageKey; icon: string }[] = [
  { id: 'general', label: 'misc.settings.general', icon: 'settings' },
  { id: 'feeds', label: 'misc.feeds.tab', icon: 'feed' },
  { id: 'pomo', label: 'common.module.focus', icon: 'pomo' },
  { id: 'data', label: 'misc.settings.data', icon: 'inbox' },
  { id: 'keys', label: 'misc.settings.shortcuts', icon: 'keyboard' },
  { id: 'about', label: 'misc.settings.about', icon: 'eye' },
]

function setSettings(p: Partial<Settings>) {
  setData((d) => ({ ...d, settings: { ...d.settings, ...p } }))
}

function SettingsDialog() {
  const t = useT()
  const phone = usePhone()
  // On phones settings open on a list of sections; picking one slides its page in (with a back button)
  const [picked, setPicked] = useState<Tab | null>(() => (isPhone() ? null : 'general'))
  const [cameBack, setCameBack] = useState(false)
  const tab = picked ?? (phone ? null : 'general')
  const closeBtn = (
    <button className="icon-btn" onClick={close} title={t('common.close')}>
      <Icon name="close" size={16} />
    </button>
  )
  return (
    <Modal className="dlg-settings" width={720}>
      <div className="dlg-set-wrap">
        {!phone && (
          <aside className="dlg-set-nav">
            <div className="dlg-set-title">{t('common.settings')}</div>
            {TABS.map((x) => (
              <button key={x.id} className={'dlg-set-tab' + (tab === x.id ? ' on' : '')} onClick={() => setPicked(x.id)}>
                <Icon name={x.icon} size={16} />
                {t(x.label)}
              </button>
            ))}
          </aside>
        )}
        {tab === null ? (
          <section className={'dlg-set-main dlg-set-home' + (cameBack ? ' from-page' : '')}>
            <div className="dlg-set-head">
              <span>{t('common.settings')}</span>
              {closeBtn}
            </div>
            <div className="dlg-set-body">
              {TABS.map((x) => (
                <button key={x.id} className="dlg-set-item" onClick={() => setPicked(x.id)}>
                  <Icon name={x.icon} size={18} />
                  <span>{t(x.label)}</span>
                  <Icon name="chevronRight" size={16} className="dlg-set-item-arrow" />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section key={tab} className={'dlg-set-main' + (phone ? ' dlg-set-page' : '')}>
            <div className="dlg-set-head">
              {phone && (
                <button
                  className="icon-btn dlg-set-back"
                  onClick={() => {
                    setCameBack(true)
                    setPicked(null)
                  }}
                  title={t('common.back')}
                >
                  <Icon name="chevronLeft" size={20} />
                </button>
              )}
              <span>{t(TABS.find((x) => x.id === tab)!.label)}</span>
              {closeBtn}
            </div>
            <div className="dlg-set-body">
              {tab === 'general' && <GeneralTab />}
              {tab === 'feeds' && <SubscriptionsTab />}
              {tab === 'pomo' && <PomoTab />}
              {tab === 'data' && <DataTab />}
              {tab === 'keys' && <ShortcutList />}
              {tab === 'about' && <AboutTab />}
            </div>
          </section>
        )}
      </div>
    </Modal>
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="dlg-row">
      <div>
        <div className="dlg-row-label">{label}</div>
        {desc && <div className="dlg-row-desc">{desc}</div>}
      </div>
      <div className="dlg-row-ctl">{children}</div>
    </div>
  )
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="dlg-seg small">
      {options.map(([v, l]) => (
        <button type="button" key={String(v)} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} className={'dlg-switch' + (checked ? ' on' : '')} onClick={() => onChange(!checked)} />
}

function GeneralTab() {
  const t = useT()
  const locale = useLocale()
  const s = useData().settings
  return (
    <>
      <div className="dlg-sub">{t('misc.settings.appearance')}</div>
      <div className="dlg-themes">
        {(
          [
            ['light', t('misc.settings.light')],
            ['dark', t('misc.settings.dark')],
          ] as const
        ).map(([v, l]) => (
          <button key={v} className={'dlg-theme ' + v + (s.theme === v ? ' on' : '')} onClick={() => setSettings({ theme: v })}>
            <span className="dlg-theme-preview">
              <i />
              <b />
            </span>
            {l}
          </button>
        ))}
      </div>
      <Row label={t('misc.settings.language')}>
        <select className="input dlg-select dlg-lang" value={locale} aria-label={t('misc.settings.language')} onChange={(e) => setLocale(e.target.value as Locale)}>
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code} lang={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </Row>
      <div className="dlg-sub">{t('misc.settings.dateTime')}</div>
      <Row label={t('misc.settings.weekStart')}>
        <Seg<0 | 1>
          value={s.weekStartsOn}
          options={[
            [1, dayName(1, 'long')],
            [0, dayName(0, 'long')],
          ]}
          onChange={(v) => setSettings({ weekStartsOn: v })}
        />
      </Row>
      <div className="dlg-sub">{t('misc.settings.calendar')}</div>
      <Row label={t('misc.settings.showLunar')} desc={t('misc.settings.showLunarDesc')}>
        <Switch checked={s.showLunar ?? (locale === 'zh-CN' || locale === 'zh-TW')} onChange={(v) => setSettings({ showLunar: v })} />
      </Row>
      <Row label={t('misc.settings.showWeekNumbers')} desc={t('misc.settings.showWeekNumbersDesc')}>
        <Switch checked={!!s.showWeekNumbers} onChange={(v) => setSettings({ showWeekNumbers: v })} />
      </Row>
      <div className="dlg-sub">{t('common.module.tasks')}</div>
      <Row label={t('misc.settings.showCompleted')} desc={t('misc.settings.showCompletedDesc')}>
        <Switch checked={s.showCompleted} onChange={(v) => setSettings({ showCompleted: v })} />
      </Row>
    </>
  )
}

function NumInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const t = useT()
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = Math.round(Number(text))
    if (!Number.isFinite(n) || text.trim() === '') return setText(String(value))
    const v = Math.min(max, Math.max(min, n))
    setText(String(v))
    if (v !== value) onChange(v)
  }
  return (
    <span className="dlg-num">
      <input className="input" type="number" min={min} max={max} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      <span>{t('misc.settings.minutes')}</span>
    </span>
  )
}

function PomoTab() {
  const t = useT()
  const s = useData().settings
  return (
    <>
      <div className="dlg-sub">{t('misc.settings.pomoTimer')}</div>
      <Row label={t('misc.settings.pomoLength')}>
        <NumInput value={s.pomoMinutes} min={5} max={180} onChange={(v) => setSettings({ pomoMinutes: v })} />
      </Row>
      <Row label={t('misc.settings.shortBreak')}>
        <NumInput value={s.shortBreak} min={1} max={60} onChange={(v) => setSettings({ shortBreak: v })} />
      </Row>
      <Row label={t('misc.settings.longBreak')} desc={t('misc.settings.longBreakDesc')}>
        <NumInput value={s.longBreak} min={1} max={90} onChange={(v) => setSettings({ longBreak: v })} />
      </Row>
    </>
  )
}

function isAppData(x: unknown): x is AppData {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return o.version === 1 && Array.isArray(o.tasks) && Array.isArray(o.lists)
}

function DataTab() {
  const t = useT()
  const data = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const dt = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    a.href = url
    a.download = `tickdone-backup-${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}-${p(dt.getHours())}${p(dt.getMinutes())}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast(t('misc.data.exported'))
  }

  const importJSON = async (f: File) => {
    setErr('')
    try {
      const obj = JSON.parse(await f.text())
      if (!isAppData(obj)) {
        setErr(t('misc.data.badFormat'))
        return
      }
      const n = obj.tasks.filter((x) => !x.deleted).length
      const summary = [t('misc.count.lists', { count: obj.lists.length }), t('misc.count.tasks', { count: n })].join(t('misc.listSeparator'))
      if (!confirm(t('misc.data.confirmImport', { summary }))) return
      const snap = getData()
      const cur = getData()
      const merged: AppData = {
        ...cur,
        ...obj,
        folders: obj.folders ?? [],
        tags: obj.tags ?? [],
        habits: obj.habits ?? [],
        focus: obj.focus ?? [],
        settings: { ...cur.settings, ...(obj.settings ?? {}) },
      }
      setData(() => merged)
      setUI({ selectedTaskId: undefined, view: 'today' })
      toast(t('misc.data.imported'), snap)
    } catch {
      setErr(t('misc.data.unreadable'))
    }
  }

  const clearAll = () => {
    if (!confirm(t('misc.data.confirmClear'))) return
    if (!confirm(t('misc.data.confirmClear2'))) return
    const snap = getData()
    setData((d) => ({ ...d, tasks: [], lists: [], folders: [], tags: [], habits: [], focus: [] }))
    setUI({ selectedTaskId: undefined, view: 'inbox' })
    toast(t('misc.data.cleared'), snap)
  }

  return (
    <>
      <div className="dlg-sub">{t('misc.data.backup')}</div>
      <Row label={t('misc.data.exportTitle')} desc={t('misc.data.exportDesc')}>
        <button className="btn" onClick={exportJSON}>
          {t('misc.data.export')}
        </button>
      </Row>
      <Row label={t('misc.data.importTitle')} desc={t('misc.data.importDesc')}>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          {t('misc.data.import')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void importJSON(f)
          }}
        />
      </Row>
      {err && <div className="dlg-hint">{err}</div>}
      <div className="dlg-sub">{t('misc.data.danger')}</div>
      <Row label={t('misc.data.clearTitle')} desc={t('misc.data.clearDesc')}>
        <button className="btn dlg-danger" onClick={clearAll}>
          {t('misc.clear')}
        </button>
      </Row>
      <div className="dlg-stats">
        {[
          t('misc.count.lists', { count: data.lists.length }),
          t('misc.count.tasks', { count: data.tasks.filter((x) => !x.deleted).length }),
          t('misc.count.tags', { count: data.tags.length }),
          t('misc.count.habits', { count: data.habits.length }),
        ].join(' · ')}
      </div>
    </>
  )
}

// Replaced at build time with the version in package.json (see vite.config.ts)
declare const __APP_VERSION__: string
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
const REPO_URL = 'https://github.com/suica/tickdone'
const SITE_URL = 'https://tickdone.pages.dev'

function GithubMark() {
  return (
    <svg className="dlg-link-icon" width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function GlobeGlyph() {
  return (
    <svg className="dlg-link-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  )
}

function ExternalGlyph() {
  return (
    <svg className="dlg-link-ext" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  )
}

function AboutTab() {
  const t = useT()
  return (
    <div className="dlg-about">
      <div className="dlg-logo">T</div>
      <div className="dlg-about-name">TickDone</div>
      {APP_VERSION && <div className="dlg-about-ver">{t('misc.about.version', { version: APP_VERSION })}</div>}
      <p>{t('misc.about.tagline')}</p>
      <div className="dlg-links">
        <a className="dlg-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <GithubMark />
          <span className="dlg-link-label">GitHub</span>
          <span className="dlg-link-url">github.com/suica/tickdone</span>
          <ExternalGlyph />
        </a>
        <a className="dlg-link" href={SITE_URL} target="_blank" rel="noopener noreferrer">
          <GlobeGlyph />
          <span className="dlg-link-label">{t('misc.about.website')}</span>
          <span className="dlg-link-url">tickdone.pages.dev</span>
          <ExternalGlyph />
        </a>
      </div>
      <p className="muted">{t('misc.about.storage', { data: t('misc.settings.data') })}</p>
    </div>
  )
}
