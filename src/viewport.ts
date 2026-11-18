import { useSyncExternalStore } from 'react'

// 断点（CSS 里用同样的值）：手机 ≤767px；平板 768–1199px；桌面 ≥1200px；大屏 ≥1920px。
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
