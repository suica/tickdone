import { format } from 'date-fns'
import { dueLabel } from '../dates'
import { useT } from '../i18n'
import { fmtTime } from '../i18n/format'
import { applyUpdate, usePwa } from '../pwa'
import { SNOOZE_OPTIONS, type SnoozeOption } from '../remind'
import { completeReminder, dismissReminder, hideHint, openReminder, setNotifications, snoozeReminder, useNotificationHint, useReminderCards, type ReminderCard as Card } from '../reminders'
import { Icon } from './Icon'
import './reminders.css'

/** At most this many cards at once; the rest wait behind a count. */
const MAX_CARDS = 3

function snoozeLabel(t: ReturnType<typeof useT>, o: SnoozeOption) {
  if (o === 'tomorrow') return t('common.tomorrow')
  return o >= 60 ? t('pwa.reminder.hours', { count: o / 60 }) : t('pwa.reminder.minutes', { count: o })
}

function ReminderCard({ r }: { r: Card }) {
  const t = useT()
  const title = r.task.title || t('common.untitled')
  const when = fmtTime(format(new Date(r.firedAt), 'HH:mm'))
  return (
    <section className="rem-card" role="alertdialog" aria-label={t('pwa.reminder.label', { title })} data-task={r.task.id}>
      <div className="rem-head">
        <Icon name="bell" size={14} />
        <span>{r.missed ? t('pwa.reminder.missed', { time: when }) : t('pwa.reminder.title')}</span>
        <button className="icon-btn rem-close" title={t('pwa.reminder.dismiss')} aria-label={t('pwa.reminder.dismiss')} onClick={() => dismissReminder(r)}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="rem-task">{title}</div>
      {r.task.dueDate && <div className="rem-due">{dueLabel(r.task)}</div>}
      <div className="rem-actions">
        <button className="btn btn-primary" onClick={() => completeReminder(r)}>
          {t('pwa.reminder.complete')}
        </button>
        <button className="btn" onClick={() => openReminder(r)}>
          {t('pwa.reminder.open')}
        </button>
      </div>
      <div className="rem-snooze" role="group" aria-label={t('pwa.reminder.snooze')}>
        <span>{t('pwa.reminder.snooze')}</span>
        {SNOOZE_OPTIONS.map((o) => (
          <button key={o} className="rem-chip" onClick={() => snoozeReminder(r, o)}>
            {snoozeLabel(t, o)}
          </button>
        ))}
      </div>
    </section>
  )
}

function NotificationHint() {
  const t = useT()
  return (
    <section className="rem-card rem-hint" role="dialog" aria-label={t('pwa.hint.title')}>
      <div className="rem-head">
        <Icon name="bell" size={14} />
        <span>{t('pwa.hint.title')}</span>
      </div>
      <p className="rem-text">{t('pwa.hint.body')}</p>
      <div className="rem-actions">
        <button className="btn btn-primary" onClick={() => setNotifications(true)}>
          {t('pwa.hint.turnOn')}
        </button>
        <button className="btn" onClick={hideHint}>
          {t('pwa.hint.notNow')}
        </button>
      </div>
    </section>
  )
}

/** Reminder cards (and the one-time offer of notifications), in a stack at the top right; across the top on phones. */
export function ReminderCards() {
  const t = useT()
  const cards = useReminderCards()
  const hint = useNotificationHint()
  if (!cards.length && !hint) return null
  const more = cards.length - MAX_CARDS
  return (
    <div className="rem-stack">
      {hint && <NotificationHint />}
      {cards.slice(0, MAX_CARDS).map((r) => (
        <ReminderCard key={r.task.id + ':' + r.firedAt} r={r} />
      ))}
      {more > 0 && <div className="rem-more">{t('pwa.reminder.more', { count: more })}</div>}
    </div>
  )
}

/** "A new version is available" with a Reload button, until it is clicked. */
export function UpdateToast() {
  const t = useT()
  const { updateReady } = usePwa()
  if (!updateReady) return null
  return (
    <div className="toast update-toast" role="status">
      <span>{t('pwa.update.ready')}</span>
      <button onClick={applyUpdate}>{t('pwa.update.reload')}</button>
    </div>
  )
}
