// Puts the theme and accent on the page: the data-theme attribute the stylesheets key on, the accent
// tokens, the browser's theme colour and the tab icon. The inline script in index.html repeats the first
// steps from the copy saved here, so the launch screen already has the right colours.
import { accentTokens, DEFAULT_ACCENT, isAccent, LOOK_KEY, lookFor, resolveTheme, SURFACE, type AccentId, type ThemeMode } from './theme'

export const SYSTEM_DARK = '(prefers-color-scheme: dark)'

export function applyLook(mode: ThemeMode | undefined, accent: AccentId | undefined, systemDark: boolean) {
  const id = isAccent(accent) ? accent : DEFAULT_ACCENT
  const m: ThemeMode = mode === 'light' || mode === 'dark' ? mode : 'system'
  const theme = resolveTheme(m, systemDark)
  const root = document.documentElement
  root.dataset.theme = theme
  root.dataset.accent = id
  for (const [k, v] of Object.entries(accentTokens(id, theme))) root.style.setProperty(k, v)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SURFACE[theme])
  const look = lookFor(m, id)
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon) icon.href = id === DEFAULT_ACCENT ? '/favicon.svg' : look.icon
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look))
  } catch {
    /* storage full or blocked: the launch screen falls back to the default colours */
  }
}
