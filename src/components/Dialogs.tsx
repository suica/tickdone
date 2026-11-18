import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { LIST_COLORS, addList, deleteList, deleteTag, renameTag, setData, setUI, toast, uid, updateList, useData, useUI, getData } from '../store'
import type { AppData, Settings } from '../types'
import { isPhone, usePhone } from '../viewport'
import { Icon } from './Icon'
import { usePresence } from './motion'
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

// ---------------- 通用外壳 ----------------
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
  useEffect(() => {
    // 自动聚焦第一个输入框
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input[type=text], input:not([type])')
    el?.focus()
    if (el instanceof HTMLInputElement) el.select()
  }, [])
  useEffect(() => {
    if (closing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 先于全局快捷键处理，避免同时关闭任务详情
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
            <button className="icon-btn" onClick={close} title="关闭">
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
  return (
    <div className="dlg-colors">
      <button type="button" className={'dlg-color none' + (!value ? ' on' : '')} title="无" onClick={() => onChange(undefined)}>
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

// ---------------- 清单 ----------------
function ListDialog({ id }: { id?: string }) {
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
      title={list ? '编辑清单' : '添加清单'}
      onSubmit={submit}
      foot={
        <>
          {list && (
            <button
              className="btn dlg-danger-link"
              onClick={() => {
                if (confirm(`删除清单「${list.name}」？清单中的任务将移至垃圾桶。`)) {
                  close()
                  deleteList(list.id)
                }
              }}
            >
              删除清单
            </button>
          )}
          <span className="dlg-spacer" />
          <button className="btn" onClick={close}>
            取消
          </button>
          <button className="btn btn-primary" disabled={!trimmed} onClick={submit}>
            {list ? '保存' : '添加'}
          </button>
        </>
      }
    >
      <div className="modal-body">
        <div className="dlg-name-row">
          <span className="dlg-name-icon" style={{ color: color ?? 'var(--text-3)' }}>
            <Icon name="list" size={18} />
          </span>
          <input className="input" type="text" placeholder="名称" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {dup && <div className="dlg-hint">已存在同名清单</div>}
        <Field label="清单颜色">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="视图类型">
          <div className="dlg-seg">
            <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
              <Icon name="list" size={15} /> 列表
            </button>
            <button type="button" className={view === 'kanban' ? 'on' : ''} onClick={() => setView('kanban')}>
              <Icon name="kanban" size={15} /> 看板
            </button>
          </div>
        </Field>
        <Field label="文件夹">
          <select className="input dlg-select" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">无</option>
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

// ---------------- 文件夹 ----------------
function FolderDialog({ id }: { id?: string }) {
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
    toast('文件夹已解散', snap)
  }

  return (
    <Modal
      title={folder ? '重命名文件夹' : '新建文件夹'}
      onSubmit={submit}
      foot={
        <>
          {folder && (
            <button className="btn dlg-danger-link" onClick={ungroup}>
              解散文件夹
            </button>
          )}
          <span className="dlg-spacer" />
          <button className="btn" onClick={close}>
            取消
          </button>
          <button className="btn btn-primary" disabled={!trimmed} onClick={submit}>
            {folder ? '保存' : '添加'}
          </button>
        </>
      }
    >
      <div className="modal-body">
        <div className="dlg-name-row">
          <span className="dlg-name-icon">
            <Icon name="folder" size={18} />
          </span>
          <input className="input" type="text" placeholder="文件夹名称" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {folder && <div className="dlg-hint muted">解散后，文件夹内的清单会保留并移出文件夹。</div>}
      </div>
    </Modal>
  )
}

// ---------------- 标签 ----------------
function TagDialog({ id }: { id?: string }) {
  const data = useData()
  const tag = id ? data.tags.find((t) => t.name === id) : undefined
  const [name, setName] = useState(tag?.name ?? '')
  const [color, setColor] = useState<string | undefined>(tag?.color)
  const trimmed = name.trim().replace(/^#/, '').replace(/\s+/g, '')
  const dup = data.tags.some((t) => t.name === trimmed && t.name !== tag?.name)
  const ok = !!trimmed && !dup

  const submit = () => {
    if (!ok) return
    if (tag) {
      renameTag(tag.name, trimmed, color)
      // renameTag 在 color 为 undefined 时保留旧色，这里显式清除
      if (!color && tag.color) setData((d) => ({ ...d, tags: d.tags.map((t) => (t.name === trimmed ? { name: t.name } : t)) }))
    } else {
      setData((d) => ({ ...d, tags: [...d.tags, { name: trimmed, color }] }))
    }
    close()
  }

  return (
    <Modal
      title={tag ? '编辑标签' : '添加标签'}
      onSubmit={submit}
      foot={
        <>
          {tag && (
            <button
              className="btn dlg-danger-link"
              onClick={() => {
                if (confirm(`删除标签「${tag.name}」？该标签将从所有任务中移除。`)) {
                  close()
                  deleteTag(tag.name)
                }
              }}
            >
              删除标签
            </button>
          )}
          <span className="dlg-spacer" />
          <button className="btn" onClick={close}>
            取消
          </button>
          <button className="btn btn-primary" disabled={!ok} onClick={submit}>
            {tag ? '保存' : '添加'}
          </button>
        </>
      }
    >
      <div className="modal-body">
        <div className="dlg-name-row">
          <span className="dlg-name-icon" style={{ color: color ?? 'var(--text-3)' }}>
            <Icon name="tag" size={18} />
          </span>
          <input className="input" type="text" placeholder="标签名称" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {dup && <div className="dlg-hint">已存在同名标签</div>}
        <Field label="标签颜色">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------- 快捷键 ----------------
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'

const SHORTCUTS: { group: string; items: [string, string[]][] }[] = [
  {
    group: '通用',
    items: [
      ['新建任务', ['N']],
      ['搜索', [MOD, 'F']],
      ['撤销', [MOD, 'Z']],
      ['打开快捷键面板', ['?']],
      ['关闭弹窗 / 任务详情', ['Esc']],
    ],
  },
  {
    group: '切换模块',
    items: [
      ['任务', ['Alt', '1']],
      ['日历', ['Alt', '2']],
      ['四象限', ['Alt', '3']],
      ['番茄专注', ['Alt', '4']],
      ['习惯打卡', ['Alt', '5']],
      ['搜索', ['Alt', '6']],
    ],
  },
  {
    group: '任务',
    items: [
      ['删除选中任务', ['Delete']],
      ['完成 / 取消完成', [MOD, 'Enter']],
      ['快速添加：日期', ['明天 / 下周一 / 3点']],
      ['快速添加：优先级', ['!高 / !中 / !低']],
      ['快速添加：标签', ['#标签']],
    ],
  },
]

function ShortcutList() {
  return (
    <div className="dlg-keys">
      {SHORTCUTS.map((g) => (
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
  return (
    <Modal title="快捷键" width={480}>
      <div className="modal-body dlg-scroll">
        <ShortcutList />
      </div>
    </Modal>
  )
}

// ---------------- 设置 ----------------
type Tab = 'general' | 'pomo' | 'data' | 'keys' | 'about'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: '通用', icon: 'settings' },
  { id: 'pomo', label: '番茄专注', icon: 'pomo' },
  { id: 'data', label: '数据', icon: 'inbox' },
  { id: 'keys', label: '快捷键', icon: 'keyboard' },
  { id: 'about', label: '关于', icon: 'eye' },
]

function setSettings(p: Partial<Settings>) {
  setData((d) => ({ ...d, settings: { ...d.settings, ...p } }))
}

function SettingsDialog() {
  const phone = usePhone()
  // On phones settings open on a list of sections; picking one slides its page in (with a back button)
  const [picked, setPicked] = useState<Tab | null>(() => (isPhone() ? null : 'general'))
  const [cameBack, setCameBack] = useState(false)
  const tab = picked ?? (phone ? null : 'general')
  const closeBtn = (
    <button className="icon-btn" onClick={close} title="关闭">
      <Icon name="close" size={16} />
    </button>
  )
  return (
    <Modal className="dlg-settings" width={720}>
      <div className="dlg-set-wrap">
        {!phone && (
          <aside className="dlg-set-nav">
            <div className="dlg-set-title">设置</div>
            {TABS.map((t) => (
              <button key={t.id} className={'dlg-set-tab' + (tab === t.id ? ' on' : '')} onClick={() => setPicked(t.id)}>
                <Icon name={t.icon} size={16} />
                {t.label}
              </button>
            ))}
          </aside>
        )}
        {tab === null ? (
          <section className={'dlg-set-main dlg-set-home' + (cameBack ? ' from-page' : '')}>
            <div className="dlg-set-head">
              <span>设置</span>
              {closeBtn}
            </div>
            <div className="dlg-set-body">
              {TABS.map((t) => (
                <button key={t.id} className="dlg-set-item" onClick={() => setPicked(t.id)}>
                  <Icon name={t.icon} size={18} />
                  <span>{t.label}</span>
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
                  title="返回"
                >
                  <Icon name="chevronLeft" size={20} />
                </button>
              )}
              <span>{TABS.find((t) => t.id === tab)!.label}</span>
              {closeBtn}
            </div>
            <div className="dlg-set-body">
              {tab === 'general' && <GeneralTab />}
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
  const s = useData().settings
  return (
    <>
      <div className="dlg-sub">外观</div>
      <div className="dlg-themes">
        {(
          [
            ['light', '浅色'],
            ['dark', '深色'],
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
      <div className="dlg-sub">日期与时间</div>
      <Row label="每周开始于">
        <Seg<0 | 1>
          value={s.weekStartsOn}
          options={[
            [1, '周一'],
            [0, '周日'],
          ]}
          onChange={(v) => setSettings({ weekStartsOn: v })}
        />
      </Row>
      <div className="dlg-sub">任务</div>
      <Row label="显示已完成任务" desc="在清单中显示已完成的任务">
        <Switch checked={s.showCompleted} onChange={(v) => setSettings({ showCompleted: v })} />
      </Row>
    </>
  )
}

function NumInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
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
      <span>分钟</span>
    </span>
  )
}

function PomoTab() {
  const s = useData().settings
  return (
    <>
      <div className="dlg-sub">番茄计时</div>
      <Row label="番茄时长">
        <NumInput value={s.pomoMinutes} min={5} max={180} onChange={(v) => setSettings({ pomoMinutes: v })} />
      </Row>
      <Row label="短休息时长">
        <NumInput value={s.shortBreak} min={1} max={60} onChange={(v) => setSettings({ shortBreak: v })} />
      </Row>
      <Row label="长休息时长" desc="每完成 4 个番茄后进入长休息">
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
    toast('已导出备份')
  }

  const importJSON = async (f: File) => {
    setErr('')
    try {
      const obj = JSON.parse(await f.text())
      if (!isAppData(obj)) {
        setErr('文件格式不正确：缺少 version 字段或版本不受支持')
        return
      }
      const n = obj.tasks.filter((t) => !t.deleted).length
      if (!confirm(`将用备份覆盖当前所有数据（备份中有 ${obj.lists.length} 个清单、${n} 个任务），确定继续？`)) return
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
      toast('已导入备份', snap)
    } catch {
      setErr('无法解析文件，请选择有效的 JSON 备份')
    }
  }

  const clearAll = () => {
    if (!confirm('确定清空所有数据？清单、任务、标签、习惯和专注记录都将被删除。')) return
    if (!confirm('此操作无法恢复（除非你已导出备份）。再次确认清空？')) return
    const snap = getData()
    setData((d) => ({ ...d, tasks: [], lists: [], folders: [], tags: [], habits: [], focus: [] }))
    setUI({ selectedTaskId: undefined, view: 'inbox' })
    toast('已清空所有数据', snap)
  }

  return (
    <>
      <div className="dlg-sub">备份与恢复</div>
      <Row label="导出备份" desc="将所有数据导出为 JSON 文件">
        <button className="btn" onClick={exportJSON}>
          导出
        </button>
      </Row>
      <Row label="导入备份" desc="从 JSON 备份恢复，会覆盖当前数据">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          导入
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
      <div className="dlg-sub">危险操作</div>
      <Row label="清空所有数据" desc="删除本地保存的全部内容">
        <button className="btn dlg-danger" onClick={clearAll}>
          清空
        </button>
      </Row>
      <div className="dlg-stats">
        当前共 {data.lists.length} 个清单 · {data.tasks.filter((t) => !t.deleted).length} 个任务 · {data.tags.length} 个标签 · {data.habits.length} 个习惯
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
  return (
    <div className="dlg-about">
      <div className="dlg-logo">T</div>
      <div className="dlg-about-name">TickDone</div>
      {APP_VERSION && <div className="dlg-about-ver">版本 {APP_VERSION}</div>}
      <p>一个轻量的待办与时间管理工具：任务清单、日历、四象限、番茄专注与习惯打卡。</p>
      <div className="dlg-links">
        <a className="dlg-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <GithubMark />
          <span className="dlg-link-label">GitHub</span>
          <span className="dlg-link-url">github.com/suica/tickdone</span>
          <ExternalGlyph />
        </a>
        <a className="dlg-link" href={SITE_URL} target="_blank" rel="noopener noreferrer">
          <GlobeGlyph />
          <span className="dlg-link-label">在线地址</span>
          <span className="dlg-link-url">tickdone.pages.dev</span>
          <ExternalGlyph />
        </a>
      </div>
      <p className="muted">所有数据仅保存在本机浏览器（localStorage），建议定期在「数据」中导出备份。</p>
    </div>
  )
}
