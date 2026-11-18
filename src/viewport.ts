import { useSyncExternalStore } from 'react'

// Breakpoints (CSS uses the same values): phone ≤767px; tablet 768–1199px; desktop ≥1200px; large ≥1920px.
export const PHONE = '(max-width: 767px)'
export const TABLET = '(min-width: 768px) and (max-width: 1199px)'
export const LARGE = '(min-width: 1920px)'

type Subscribe = (cb: () => void) => () => void
const subscribers = new Map<string, Subscribe>()

function subscriber(query: string): Subscribe {
  let s = subscribers.get(query)
  if (!s) {
    s = (cb) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    }
    subscribers.set(query, s)
  }
  return s
}

export function useMedia(query: string): boolean {
  return useSyncExternalStore(subscriber(query), () => window.matchMedia(query).matches, () => false)
}

export const usePhone = () => useMedia(PHONE)
export const useTablet = () => useMedia(TABLET)
export const isPhone = () => window.matchMedia(PHONE).matches
