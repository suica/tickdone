import { useEffect, useRef, type MouseEvent as RMouseEvent } from 'react'
import { usePan } from '../gestures'
import { useT } from '../i18n'
import { GITHUB_URL } from '../links'
import { setUI, useUI } from '../store'
import { Icon } from './Icon'
import { Sidebar } from './Sidebar'

/**
 * Phone sidebar: a left drawer holding <Sidebar/>, with search, settings and GitHub at the top.
 * Opens with setUI({ drawerOpen: true }) (menu button of the task list) or by swiping in from the
 * left screen edge; closes on the mask, Esc, or a swipe to the left. While closed it stays mounted
 * (for the slide) but is inert and aria-hidden.
 */
export function Drawer() {
  const ui = useUI()
  const t = useT()
  const open = ui.drawerOpen
  const layer = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const width = useRef(1)
  const close = () => setUI({ drawerOpen: false })

  useEffect(() => {
    if (!open) return
    panel.current?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setUI({ drawerOpen: false })
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])

  // Finger tracking: transitions off, panel at `x` (−width…0), mask opacity follows.
  const track = (x: number) => {
    const l = layer.current
    const p = panel.current
    if (!l || !p) return
    l.classList.add('dragging')
    p.style.transform = `translateX(${x}px)`
    l.style.setProperty('--drawer-p', String(Math.min(1, Math.max(0, 1 + x / width.current))))
  }
  // Release: transitions back on, CSS slides from where the finger left the panel to the target.
  const settle = (toOpen: boolean) => {
    const l = layer.current
    const p = panel.current
    if (l && p) {
      l.classList.remove('dragging')
      p.style.transform = ''
      l.style.removeProperty('--drawer-p')
      l.classList.toggle('open', toOpen)
    }
    setUI({ drawerOpen: toOpen })
  }
  const measure = () => (width.current = panel.current?.offsetWidth || 1)

  const swipeOpen = usePan({
    axis: 'x',
    dir: 1,
    pointers: ['touch', 'pen', 'mouse'],
    onStart: measure,
    onMove: (d) => track(Math.min(0, d - width.current)),
    onEnd: (d, v) => settle(d > width.current * 0.35 || v > 0.4),
  })
  const swipeClose = usePan({
    axis: 'x',
    dir: -1,
    maxDelay: 300,
    onStart: measure,
    onMove: (d) => track(Math.max(-width.current, d)),
    onEnd: (d, v) => settle(!(-d > width.current * 0.3 || v < -0.4)),
  })

  // The edge strip sits over the list; a plain tap on it goes to whatever is underneath.
  const passTap = (e: RMouseEvent<HTMLDivElement>) => {
    const strip = e.currentTarget
    strip.style.pointerEvents = 'none'
    const below = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    strip.style.pointerEvents = ''
    if (!below) return
    if (below.matches('input, textarea, [contenteditable="true"]')) below.focus()
    below.click()
  }
  const edge = !open && ui.module === 'tasks' && !ui.selectedTaskId && !ui.selectMode && !ui.dialog && !ui.menu

  return (
    <>
      {edge && <div className="drawer-edge" aria-hidden="true" onClick={passTap} {...swipeOpen} />}
      <div ref={layer} className={'drawer-layer' + (open ? ' open' : '')} inert={!open} aria-hidden={open ? undefined : true} {...swipeClose}>
        <div className="drawer-mask" onClick={close} />
        <div ref={panel} className="drawer" role="dialog" aria-modal="true" aria-label={t('shell.drawer.label')} tabIndex={-1}>
          <div className="drawer-head">
            <div className="drawer-brand">
              <span className="drawer-avatar">T</span>
              <span className="drawer-name">TickDone</span>
            </div>
            <button className="drawer-act" title={t('common.search')} aria-label={t('common.search')} onClick={() => setUI({ drawerOpen: false, module: 'search', selectedTaskId: undefined })}>
              <Icon name="search" size={21} />
            </button>
            <button className="drawer-act" title={t('common.settings')} aria-label={t('common.settings')} onClick={() => setUI({ drawerOpen: false, dialog: { kind: 'settings' } })}>
              <Icon name="settings" size={21} />
            </button>
            <a className="drawer-act" href={GITHUB_URL} target="_blank" rel="noopener" title="GitHub" aria-label="GitHub">
              <Icon name="github" size={20} />
            </a>
          </div>
          <Sidebar />
        </div>
      </div>
    </>
  )
}
