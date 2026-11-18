import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { useUI } from '../store'
import type { Task } from '../types'
import { dur, easing } from './taskMotion'
import { QuickAdd } from './QuickAdd'

/**
 * Phone quick add: a round "+" button above the bottom tab bar opens a bottom panel with the quick-add field
 * (date, priority, tag and list buttons). The panel slides up, follows the on-screen keyboard and can be
 * dragged down or tapped outside to close.
 */
export function PhoneQuickAdd({ defaults }: { defaults: Partial<Task> }) {
  const t = useT()
  const ui = useUI()
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed')
  const [kb, setKb] = useState(0)
  const sheet = useRef<HTMLDivElement>(null)

  const close = () => {
    if (state !== 'open') return
    setState('closing')
    const el = sheet.current
    const ms = dur('--dur')
    if (!el || !ms) return setState('closed')
    el.animate([{ transform: getComputedStyle(el).transform === 'none' ? 'translateY(0)' : getComputedStyle(el).transform }, { transform: 'translateY(100%)' }], {
      duration: ms,
      easing: easing('--ease-in-out'),
      fill: 'forwards',
    }).finished.then(
      () => setState('closed'),
      () => setState('closed'),
    )
  }

  // keep the panel above the on-screen keyboard
  useEffect(() => {
    const vv = window.visualViewport
    if (state === 'closed' || !vv) return
    const on = () => setKb(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    on()
    vv.addEventListener('resize', on)
    vv.addEventListener('scroll', on)
    return () => {
      vv.removeEventListener('resize', on)
      vv.removeEventListener('scroll', on)
    }
  }, [state])

  // drag the grip down to close
  const grip = (e: React.PointerEvent) => {
    const el = sheet.current
    if (!el) return
    const y0 = e.clientY
    let dy = 0
    const move = (ev: PointerEvent) => {
      dy = Math.max(0, ev.clientY - y0)
      el.style.transform = `translateY(${dy}px)`
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (dy > 72) return close()
      el.style.transform = ''
      if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: dur('--dur'), easing: easing('--ease-out') })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const hidden = !!ui.selectedTaskId || ui.selectMode || ui.drawerOpen || state !== 'closed'
  return (
    <>
      {!hidden && (
        <button className="qa-fab" aria-label={t('tasks.quickAdd.addTask')} title={t('tasks.quickAdd.addTask')} onClick={() => setState('open')}>
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
      {state !== 'closed' &&
        createPortal(
          <div
            className={'qa-sheet-mask' + (state === 'closing' ? ' closing' : '')}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) close()
            }}
          >
            <div className="qa-sheet" ref={sheet} style={{ bottom: kb }} role="dialog" aria-label={t('tasks.quickAdd.addTask')}>
              <div className="qa-sheet-grip" onPointerDown={grip}>
                <span />
              </div>
              <QuickAdd defaults={defaults} sheet autoFocus onCancel={close} />
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
