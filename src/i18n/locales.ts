/** Supported UI languages, in the order shown in Settings. English is the source language. */
export const LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'ru', name: 'Русский' },
] as const

export type Locale = (typeof LOCALES)[number]['code']

export const LOCALE_CODES: readonly Locale[] = LOCALES.map((l) => l.code)

/** Picks the best supported locale for a list of BCP 47 tags (e.g. `navigator.languages`). */
export function matchLocale(tags: readonly string[]): Locale {
  for (const raw of tags) {
    const tag = raw.toLowerCase()
    const exact = LOCALE_CODES.find((c) => c.toLowerCase() === tag)
    if (exact) return exact
    if (tag === 'zh' || tag.startsWith('zh-')) return /hant|-tw|-hk|-mo/.test(tag) ? 'zh-TW' : 'zh-CN'
    if (tag === 'pt' || tag.startsWith('pt-')) return 'pt-BR'
    const base = LOCALE_CODES.find((c) => c.toLowerCase() === tag.split('-')[0])
    if (base) return base
  }
  return 'en'
}
