// Reminders while the app runs: a timer for the next reminder, a sound and a system notification when one
// fires, and the reminder cards. There is no push server, so nothing fires while TickDone is closed; reminders
// that came due meanwhile show as cards the next time it opens.
import { useSyncExternalStore } from 'react'
import { dueLabel } from './dates'
import { t } from './i18n'
import { getRegistration } from './pwa'
import {
  dismiss,
  dueReminders,
  isMissed,
  emptyReminderState,
  markAnnounced,
  nextFireTime,
  pruneReminderState,
  snooze,
  snoozeUntil,
  unannounced,
  type DueReminder,
  type ReminderState,
  type SnoozeOption,
} from './remind'
import { getData, getUI, playDing, setData, setUI, subscribeData, toast, toggleTask } from './store'
import { viewOfTask } from './taskLink'

const KEY = 'tickdone:reminders:v1'
/** Re-check at least this often, so a computer waking from sleep catches up quickly. */
const MAX_WAIT = 30_000

function load(): ReminderState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...emptyReminderState(Date.now()), ...(JSON.parse(raw) as ReminderState) }
  } catch {
    /* ignore */
  }
  return emptyReminderState(Date.now())
}

let state: ReminderState = load()
/** A due reminder on a card; `missed` when it came due while the app was closed (not announced in this session). */
export type ReminderCard = DueReminder & { missed: boolean }
let cards: ReminderCard[] = []
/** Reminders announced while the app was open, as "task id:fire time". */
const live = new Set<string>()
const key = (r: DueReminder) => r.task.id + ':' + r.firedAt
let hint = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}

function save(s: ReminderState) {
  state = s
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

const getCards = () => cards
const getHint = () => hint
/** The reminders due now, for the cards. */
export const useReminderCards = () => useSyncExternalStore(subscribe, getCards, getCards)
/** Whether to offer notifications, the first time a reminder was set. */
export const useNotificationHint = () => useSyncExternalStore(subscribe, getHint, getHint)

// ---------------- notifications ----------------

export type Permission = NotificationPermission | 'unsupported'
export const notificationPermission = (): Permission => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

/** Asks the browser for permission; only call from a click or another user action. */
export async function requestNotifications(): Promise<Permission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/** Turns system notifications on (asking for permission) or off; returns whether they are on. */
export async function setNotifications(on: boolean): Promise<boolean> {
  hideHint()
  if (!on) {
    setData((d) => ({ ...d, settings: { ...d.settings, notifications: false } }))
    return false
  }
  const p = notificationPermission() === 'granted' ? 'granted' : await requestNotifications()
  const granted = p === 'granted'
  setData((d) => ({ ...d, settings: { ...d.settings, notifications: granted } }))
  if (!granted) toast(t(p === 'unsupported' ? 'pwa.notify.unsupported' : 'pwa.notify.blocked'))
  return granted
}

function notify(r: DueReminder) {
  const task = r.task
  const title = task.title || t('common.untitled')
  const body = task.dueDate ? dueLabel(task) : ''
  const options: NotificationOptions = { body, tag: `tickdone-${task.id}-${r.firedAt}`, icon: '/icon-192.png', badge: '/icon-192.png', data: { taskId: task.id } }
  const reg = getRegistration()
  if (reg?.active) {
    reg.showNotification(title, options).catch(() => {})
    return
  }
  try {
    const n = new Notification(title, options)
    n.onclick = () => {
      window.focus()
      openTask(task.id)
      n.close()
    }
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

// ---------------- scheduling ----------------

let timer: number | undefined

/** Shows reminders that are due, announces new ones and sets the timer for the next. */
function check() {
  const now = Date.now()
  const tasks = getData().tasks
  const due = dueReminders(tasks, state, now)
  const fresh = unannounced(due, state)
  if (fresh.length) {
    const settings = getData().settings
    // Reminders that came due while the app was closed only get a card; announce the ones that just fired.
    const announcing = fresh.filter((r) => !isMissed(r, now))
    announcing.forEach((r) => live.add(key(r)))
    if (announcing.length) {
      if (settings.reminderSound !== false) playDing(1046)
      if (settings.notifications && notificationPermission() === 'granted') announcing.forEach(notify)
    }
    save(markAnnounced(state, fresh))
  }
  if (due.length !== cards.length || due.some((r, i) => r.task !== cards[i].task || r.firedAt !== cards[i].firedAt)) {
    cards = due.map((r) => ({ ...r, missed: !live.has(key(r)) }))
    emit()
  }
  clearTimeout(timer)
  const next = nextFireTime(tasks, state, now)
  const wait = next == null ? MAX_WAIT : Math.min(MAX_WAIT, Math.max(0, next - now))
  timer = window.setTimeout(check, wait)
}

function change(s: ReminderState) {
  save(s)
  check()
}

/** Starts the reminder timer; returns a function that stops it. */
export function startReminders(): () => void {
  save(pruneReminderState(state, getData().tasks))
  let withReminder = countReminders()
  const unsub = subscribeData(() => {
    const n = countReminders()
    // The first reminder ever set: offer notifications once, from the hint's button (a user action)
    if (n > withReminder && !state.hinted && getData().settings.notifications == null && notificationPermission() === 'default') {
      save({ ...state, hinted: true })
      hint = true
      emit()
    }
    withReminder = n
    check()
  })
  const onStorage = (e: StorageEvent) => {
    // Another tab handled or snoozed a reminder
    if (e.key === KEY) {
      state = load()
      check()
    }
  }
  const onWake = () => {
    if (document.visibilityState === 'visible') check()
  }
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener('focus', onWake)
  check()
  return () => {
    unsub()
    clearTimeout(timer)
    window.removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', onWake)
    window.removeEventListener('focus', onWake)
  }
}

const countReminders = () => getData().tasks.filter((x) => x.reminder != null && x.status === 0 && !x.deleted).length

// ---------------- card actions ----------------

export function hideHint() {
  if (!hint) return
  hint = false
  emit()
}

function openTask(id: string) {
  const d = getData()
  const task = d.tasks.find((x) => x.id === id)
  if (!task) return
  setUI({ module: 'tasks', view: viewOfTask(task, d.lists.map((l) => l.id)), selectedTaskId: id, menu: undefined, dialog: undefined, drawerOpen: false })
}

export function completeReminder(r: DueReminder) {
  const before = state
  change(dismiss(state, r.task.id, r.at))
  toggleTask(r.task.id)
  // The completion toast's undo also brings the card back
  const tst = getUI().toast
  if (tst) setUI({ toast: { ...tst, undoFn: () => change(before) } })
}

export function snoozeReminder(r: DueReminder, option: SnoozeOption) {
  const before = state
  const until = snoozeUntil(option, Date.now())
  change(snooze(state, r.task.id, r.at, until))
  const label = option === 'tomorrow' ? t('pwa.reminder.snoozedTomorrow') : t('pwa.reminder.snoozedFor', { count: option })
  toast(label, undefined, () => change(before))
}

export function dismissReminder(r: DueReminder) {
  const before = state
  change(dismiss(state, r.task.id, r.at))
  toast(t('pwa.reminder.dismissed'), undefined, () => change(before))
}

export function openReminder(r: DueReminder) {
  change(dismiss(state, r.task.id, r.at))
  openTask(r.task.id)
}
