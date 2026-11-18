import { useSyncExternalStore } from 'react'

// Breakpoints (CSS uses the same values): phone ≤767px; tablet 768–1199px; desktop ≥1200px; large ≥1920px.
// Wide tablets (1024–1199px) already show the task detail as a column next to the list, like desktops.
export const PHONE = '(max-width: 767px)'
export const TABLET = '(min-width: 768px) and (max-width: 1199px)'
/** Tablets too narrow for a detail column (768–1023px): the detail slides over the list. */
export const NARROW_TABLET = '(min-width: 768px) and (max-width: 1023px)'
export const LARGE = '(min-width: 1920px)'

type Subscribe = (cb: () => void) => () => void
const subscribers = new Map<string, Subscribe>()
// One MediaQueryList per query: every task row asks, and creating one is not free.
const lists = new Map<string, MediaQueryList>()
function mql(query: string): MediaQueryList {
  let m = lists.get(query)
  if (!m) lists.set(query, (m = window.matchMedia(query)))
  return m
}

function subscriber(query: string): Subscribe {
  let s = subscribers.get(query)
  if (!s) {
    s = (cb) => {
      const m = mql(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    }
    subscribers.set(query, s)
  }
  return s
}

export function useMedia(query: string): boolean {
  return useSyncExternalStore(subscriber(query), () => mql(query).matches, () => false)
}

export const usePhone = () => useMedia(PHONE)
export const useTablet = () => useMedia(TABLET)
export const useNarrowTablet = () => useMedia(NARROW_TABLET)
export const isPhone = () => window.matchMedia(PHONE).matches
