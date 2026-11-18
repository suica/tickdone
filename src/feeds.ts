// Calendar subscriptions: the list lives in the app data; fetched feeds are cached in localStorage and
// refreshed on open and every few hours. Feeds are fetched through the same-origin /api/ics proxy
// (functions/api/ics.ts), or directly where the proxy does not exist (the dev server).
import { useMemo, useSyncExternalStore } from 'react'
import { expandEvents, parseICS, type IcsCalendar, type Occurrence } from './ics'
import { t } from './i18n'
import { getData, LIST_COLORS, setData, toast, uid, useData } from './store'
import type { CalendarSubscription } from './types'

export type FeedError = 'unreachable' | 'notCalendar' | 'tooLarge' | 'blocked' | 'timeout'

export interface FeedState {
  loading: boolean
  error?: FeedError
  /** When the feed was last read successfully. */
  fetchedAt?: number
  cal?: IcsCalendar
}

const CACHE_KEY = 'tickdone:feeds:v1'
/** Longest feed text kept for offline use, and the most all feeds may take together (characters). */
const MAX_CACHED = 1_500_000
const MAX_CACHE_TOTAL = 3_000_000
/** How often feeds are read again while the app is open. */
export const REFRESH_MS = 3 * 60 * 60 * 1000
/** A feed read this recently is not read again when the app opens. */
const FRESH_MS = 10 * 60 * 1000

// ---------------- addresses ----------------

/** A feed address as it is stored: webcal:// becomes https://; only http(s) URLs with a host. */
export function normalizeFeedUrl(raw: string): string | null {
  const s = raw.trim().replace(/^webcals?:\/\//i, 'https://')
  try {
    const u = new URL(s)
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname) return null
    return u.toString()
  } catch {
    return null
  }
}

/** The name shown for a subscription: its own, the feed's, or the host of its address. */
export function feedName(s: CalendarSubscription, cal?: IcsCalendar) {
  if (s.name) return s.name
  if (cal?.name) return cal.name
  try {
    return new URL(s.url).hostname
  } catch {
    return s.url
  }
}

// ---------------- state and cache ----------------

type Cache = Record<string, { fetchedAt: number; text: string }>

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Cache
  } catch {
    return {}
  }
}

function writeCache(id: string, entry: { fetchedAt: number; text: string } | null) {
  const c = readCache()
  if (entry && entry.text.length <= MAX_CACHED) c[id] = entry
  else delete c[id]
  // Keep the cache within its budget: drop the oldest feeds first.
  const ids = Object.keys(c).sort((a, b) => c[b].fetchedAt - c[a].fetchedAt)
  let total = 0
  for (const k of ids) {
    total += c[k].text.length
    if (total > MAX_CACHE_TOTAL) delete c[k]
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    // Storage full: give up caching this feed rather than the user's own data.
    try {
      delete c[id]
      localStorage.setItem(CACHE_KEY, JSON.stringify(c))
    } catch {
      /* ignore */
    }
  }
}

let states: Record<string, FeedState> = {}
const subs = new Set<() => void>()
function setState(id: string, p: Partial<FeedState>) {
  states = { ...states, [id]: { ...(states[id] ?? { loading: false }), ...p } }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}
const getStates = () => states
export const useFeedStates = () => useSyncExternalStore(subscribe, getStates)

/** Loads cached copies so the calendar shows them before (or without) the network. */
function loadCached() {
  const c = readCache()
  for (const s of getData().subscriptions ?? []) {
    const e = c[s.id]
    if (!e || states[s.id]?.cal) continue
    try {
      states = { ...states, [s.id]: { loading: false, fetchedAt: e.fetchedAt, cal: parseICS(e.text) } }
    } catch {
      /* a broken cache entry is ignored */
    }
  }
}

// ---------------- fetching ----------------

class FetchError extends Error {
  code: FeedError
  constructor(code: FeedError) {
    super(code)
    this.code = code
  }
}

const looksLikeCalendar = (text: string) => /^\s*BEGIN:VCALENDAR/i.test(text.replace(/^﻿/, ''))

/** Reads a feed: through the proxy when the site has it, otherwise straight from its server. */
export async function fetchFeedText(url: string, force = false): Promise<string> {
  let res: Response | undefined
  try {
    res = await fetch('/api/ics?url=' + encodeURIComponent(url), { cache: force ? 'no-cache' : 'default', signal: AbortSignal.timeout(20_000) })
  } catch {
    res = undefined
  }
  if (res?.headers.get('X-Ics-Proxy')) {
    if (res.ok) return await res.text()
    const code = (await res.text().catch(() => '')).trim()
    if (res.status === 403) throw new FetchError('blocked')
    if (res.status === 413) throw new FetchError('tooLarge')
    if (res.status === 415) throw new FetchError('notCalendar')
    if (res.status === 504 || code === 'timeout') throw new FetchError('timeout')
    throw new FetchError('unreachable')
  }
  // No proxy here (e.g. the dev server): only feeds that allow cross-origin reads work.
  try {
    res = await fetch(url, { cache: force ? 'no-cache' : 'default', signal: AbortSignal.timeout(20_000) })
  } catch (e) {
    throw new FetchError(e instanceof DOMException && e.name === 'TimeoutError' ? 'timeout' : 'unreachable')
  }
  if (!res.ok) throw new FetchError('unreachable')
  const text = await res.text()
  if (!looksLikeCalendar(text)) throw new FetchError('notCalendar')
  return text
}

const inflight = new Map<string, Promise<void>>()

/** Reads one subscription again. Errors keep the last good copy. */
export function refreshFeed(id: string, force = false): Promise<void> {
  const running = inflight.get(id)
  if (running) return running
  const sub = (getData().subscriptions ?? []).find((s) => s.id === id)
  if (!sub) return Promise.resolve()
  setState(id, { loading: true })
  const p = (async () => {
    try {
      const text = await fetchFeedText(sub.url, force)
      if (!looksLikeCalendar(text)) throw new FetchError('notCalendar')
      const cal = parseICS(text)
      const fetchedAt = Date.now()
      // Removed while loading: keep nothing
      if (!(getData().subscriptions ?? []).some((s) => s.id === id)) return
      writeCache(id, { fetchedAt, text })
      setState(id, { loading: false, error: undefined, fetchedAt, cal })
    } catch (e) {
      setState(id, { loading: false, error: e instanceof FetchError ? e.code : 'unreachable' })
    } finally {
      inflight.delete(id)
    }
  })()
  inflight.set(id, p)
  return p
}

/** Reads every visible subscription that is older than `maxAge`. */
export function refreshAll(maxAge = 0) {
  const now = Date.now()
  for (const s of getData().subscriptions ?? []) {
    if (s.hidden) continue
    const st = states[s.id]
    if (maxAge && st?.fetchedAt && now - st.fetchedAt < maxAge && !st.error) continue
    void refreshFeed(s.id)
  }
}

let started = false
/** Shows cached feeds, reads stale ones now, and again every few hours and when the app comes back. */
export function startFeedSync() {
  if (started) return
  started = true
  loadCached()
  subs.forEach((f) => f())
  refreshAll(FRESH_MS)
  setInterval(() => refreshAll(REFRESH_MS - 60_000), REFRESH_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAll(REFRESH_MS)
  })
}

// ---------------- editing ----------------

export function addSubscription(url: string): CalendarSubscription {
  const list = getData().subscriptions ?? []
  const used = new Set(list.map((s) => s.color))
  const color = LIST_COLORS.find((c) => !used.has(c)) ?? LIST_COLORS[list.length % LIST_COLORS.length]
  const sub: CalendarSubscription = { id: uid(), name: '', url, color }
  setData((d) => ({ ...d, subscriptions: [...(d.subscriptions ?? []), sub] }))
  void refreshFeed(sub.id, true)
  return sub
}

export function updateSubscription(id: string, p: Partial<CalendarSubscription>) {
  setData((d) => ({ ...d, subscriptions: (d.subscriptions ?? []).map((s) => (s.id === id ? { ...s, ...p } : s)) }))
  if (p.hidden === false && !states[id]?.cal) void refreshFeed(id)
}

export function removeSubscription(id: string) {
  const snap = getData()
  setData((d) => ({ ...d, subscriptions: (d.subscriptions ?? []).filter((s) => s.id !== id) }))
  // The cached copy stays in memory so that undo brings the events back at once; the stored one goes.
  writeCache(id, null)
  toast(t('misc.feeds.removed'), snap)
}

// ---------------- events in a range ----------------

/** An occurrence of a subscribed calendar's event, with the calendar it comes from. */
export interface FeedEvent extends Occurrence {
  /** Unique across feeds. */
  id: string
  feedId: string
  feedName: string
  color: string
}

const expandCache = new WeakMap<IcsCalendar, Map<string, Occurrence[]>>()
function occurrencesOf(cal: IcsCalendar, from: number, to: number) {
  let m = expandCache.get(cal)
  if (!m) expandCache.set(cal, (m = new Map()))
  const k = from + ':' + to
  let occ = m.get(k)
  if (!occ) {
    if (m.size > 12) m.clear()
    m.set(k, (occ = expandEvents(cal.events, from, to)))
  }
  return occ
}

/** The events of every visible subscription that overlap [from, to) (ms). */
export function useFeedEvents(from: number, to: number): FeedEvent[] {
  const data = useData()
  const st = useFeedStates()
  const list = data.subscriptions
  return useMemo(() => {
    const out: FeedEvent[] = []
    for (const s of list ?? []) {
      const cal = st[s.id]?.cal
      if (s.hidden || !cal) continue
      const name = feedName(s, cal)
      for (const o of occurrencesOf(cal, from, to)) out.push({ ...o, id: s.id + '|' + o.key, feedId: s.id, feedName: name, color: s.color })
    }
    return out.sort((a, b) => a.start - b.start)
  }, [list, st, from, to])
}
