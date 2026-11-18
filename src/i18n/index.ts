import { useSyncExternalStore } from 'react'
import { catalogs, type MessageKey } from './catalogs'
import { LOCALE_CODES, matchLocale, type Locale } from './locales'
import type { Plural } from './types'

export { LOCALES, matchLocale, type Locale } from './locales'
export type { MessageKey } from './catalogs'

const STORAGE_KEY = 'tickdone-locale'

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (saved && LOCALE_CODES.includes(saved)) return saved
  } catch {
    /* storage unavailable */
  }
  if (typeof navigator !== 'undefined') return matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
  return 'en'
}

let current: Locale = detect()
const subscribers = new Set<() => void>()

if (typeof document !== 'undefined') document.documentElement.lang = current

export const getLocale = (): Locale => current

/** Switches the UI language, saves the choice and re-renders everything that reads it. */
export function setLocale(locale: Locale) {
  if (locale === current) return
  current = locale
  pluralRules = undefined
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* storage unavailable */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = locale
  subscribers.forEach((f) => f())
}

export function subscribeLocale(f: () => void) {
  subscribers.add(f)
  return () => subscribers.delete(f)
}

/** The current locale; the component re-renders when it changes. */
export const useLocale = () => useSyncExternalStore(subscribeLocale, getLocale, getLocale)

export type Vars = Record<string, string | number>

let pluralRules: Intl.PluralRules | undefined

function interpolate(text: string, vars?: Vars) {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all))
}

/**
 * Translates a message key into the current language. `{name}` placeholders are filled from `vars`;
 * plural messages pick their form from `vars.count`.
 */
export function t(key: MessageKey, vars?: Vars): string {
  const msg = catalogs[current][key] ?? catalogs.en[key]
  if (msg === undefined) return key
  if (typeof msg === 'string') return interpolate(msg, vars)
  pluralRules ??= new Intl.PluralRules(current)
  const form = pluralRules.select(Number(vars?.count ?? 0)) as keyof Plural
  return interpolate(msg[form] ?? msg.other, vars)
}

/** `t` for components: also subscribes the component to language changes. */
export function useT() {
  useLocale()
  return t
}
