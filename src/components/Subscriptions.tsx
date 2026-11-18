import { useState, type CSSProperties, type FormEvent } from 'react'
import { addSubscription, feedName, normalizeFeedUrl, refreshFeed, removeSubscription, updateSubscription, useFeedStates, type FeedError, type FeedState } from '../feeds'
import { useT, type MessageKey } from '../i18n'
import { fmtMonthDay, fmtTime } from '../i18n/format'
import { LIST_COLORS, useData } from '../store'
import type { CalendarSubscription } from '../types'
import { Icon } from './Icon'
import './subscriptions.css'

const ERRORS: Record<FeedError, MessageKey> = {
  unreachable: 'misc.feeds.error.unreachable',
  notCalendar: 'misc.feeds.error.notCalendar',
  tooLarge: 'misc.feeds.error.tooLarge',
  blocked: 'misc.feeds.error.blocked',
  timeout: 'misc.feeds.error.timeout',
}

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
function when(ms: number) {
  const d = new Date(ms)
  return d.toDateString() === new Date().toDateString() ? fmtTime(hm(d)) : `${fmtMonthDay(d)} ${fmtTime(hm(d))}`
}

/** Settings → Subscriptions: subscribe to calendars by their iCal address and manage them. */
export function SubscriptionsTab() {
  const t = useT()
  const list = useData().subscriptions ?? []
  const states = useFeedStates()
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const u = normalizeFeedUrl(url)
    if (!u) return setErr(t('misc.feeds.badUrl'))
    if (list.some((s) => s.url === u)) return setErr(t('misc.feeds.duplicate'))
    addSubscription(u)
    setUrl('')
    setErr('')
  }

  return (
    <>
      <div className="dlg-sub">{t('misc.feeds.addTitle')}</div>
      <form className="feed-add" onSubmit={submit} noValidate>
        <input
          className="input"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          placeholder={t('misc.feeds.urlPlaceholder')}
          aria-label={t('misc.feeds.urlLabel')}
          aria-invalid={!!err}
          onChange={(e) => {
            setUrl(e.target.value)
            if (err) setErr('')
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={!url.trim()}>
          {t('misc.feeds.subscribe')}
        </button>
      </form>
      {err && (
        <div className="dlg-hint" role="alert">
          {err}
        </div>
      )}
      <details className="feed-help">
        <summary>{t('misc.feeds.helpTitle')}</summary>
        <p>{t('misc.feeds.help')}</p>
        <p>{t('misc.feeds.privacy')}</p>
      </details>
      <div className="dlg-sub">{t('misc.feeds.yours')}</div>
      {list.length === 0 ? (
        <div className="feed-empty">{t('misc.feeds.empty')}</div>
      ) : (
        <ul className="feed-list">
          {list.map((s) => (
            // Re-mounts with the stored name when it changes elsewhere (undo, import)
            <FeedItem key={s.id + ':' + s.name} sub={s} state={states[s.id]} />
          ))}
        </ul>
      )}
    </>
  )
}

function FeedItem({ sub, state }: { sub: CalendarSubscription; state?: FeedState }) {
  const t = useT()
  const [colors, setColors] = useState(false)
  const [name, setName] = useState(sub.name)
  const shown = feedName(sub, state?.cal)
  const commit = () => {
    const v = name.trim()
    if (v !== sub.name) updateSubscription(sub.id, { name: v })
  }
  let status: string
  if (state?.loading) status = t('misc.feeds.loading')
  else if (state?.error) status = t(ERRORS[state.error])
  else if (state?.fetchedAt) status = t('misc.feeds.updatedAt', { time: when(state.fetchedAt) })
  else status = t('misc.feeds.never')

  return (
    <li className={'feed-item' + (sub.hidden ? ' hidden' : '')} data-feed-id={sub.id} style={{ '--c': sub.color } as CSSProperties}>
      <div className="feed-main">
        <button type="button" className="feed-swatch" title={t('misc.feeds.color')} aria-label={t('misc.feeds.color')} aria-expanded={colors} onClick={() => setColors(!colors)} />
        <div className="feed-text">
          <input
            className="feed-name"
            value={name}
            placeholder={shown}
            aria-label={t('misc.feeds.name')}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                commit()
                e.currentTarget.blur()
              }
            }}
          />
          <div className={'feed-status' + (state?.error && !state.loading ? ' error' : '')} title={sub.url}>
            {state?.loading && <span className="feed-spin" aria-hidden />}
            {status}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!sub.hidden}
          aria-label={t('misc.feeds.show')}
          title={t('misc.feeds.show')}
          className={'dlg-switch' + (sub.hidden ? '' : ' on')}
          onClick={() => updateSubscription(sub.id, { hidden: !sub.hidden })}
        />
        <button type="button" className="icon-btn feed-btn" title={t('misc.feeds.refresh')} aria-label={t('misc.feeds.refresh')} disabled={state?.loading} onClick={() => void refreshFeed(sub.id, true)}>
          <Icon name="refresh" size={16} />
        </button>
        <button type="button" className="icon-btn feed-btn feed-remove" title={t('misc.feeds.remove')} aria-label={t('misc.feeds.remove')} onClick={() => removeSubscription(sub.id)}>
          <Icon name="trash" size={16} />
        </button>
      </div>
      {colors && (
        <div className="dlg-colors feed-colors">
          {LIST_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={'dlg-color' + (sub.color === c ? ' on' : '')}
              style={{ background: c }}
              title={c}
              onClick={() => {
                updateSubscription(sub.id, { color: c })
                setColors(false)
              }}
            >
              {sub.color === c && <Icon name="check" size={12} stroke={2.5} />}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}
