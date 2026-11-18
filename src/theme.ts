// Theme and accent colour. The accent is one preset colour; everything the app draws in it (--primary,
// its soft tints, the label colour on accent fills, the launch-screen ring) is derived here for the light
// and the dark theme, with a contrast floor so text and controls stay readable in both.

export type ThemeMode = 'light' | 'dark' | 'system'
export type Resolved = 'light' | 'dark'

export const ACCENT_IDS = ['blue', 'indigo', 'violet', 'pink', 'green', 'moss', 'cocoa', 'graphite'] as const
export type AccentId = (typeof ACCENT_IDS)[number]
export const DEFAULT_ACCENT: AccentId = 'blue'

/** The page background in each theme (--bg in index.css). */
export const SURFACE: Record<Resolved, string> = { light: '#ffffff', dark: '#1c1c1c' }
const WHITE = '#ffffff'
/** Label colour on accent fills when white would be too faint. */
export const INK = '#141414'
/** WCAG AA for user-interface components and large text: the floor for the accent on the page and for labels on the accent. */
export const MIN_CONTRAST = 3
/** WCAG AA for body text. Dark-theme accents reach it on the page, since dates and links are written in the accent. */
export const TEXT_CONTRAST = 4.5

interface Preset {
  /** The colour as used in the light theme. */
  light: string
  /** A hand-tuned dark-theme colour; derived from `light` when absent. */
  dark?: string
  /** Hand-tuned launch-ring track colours; derived when absent. */
  ring?: Record<Resolved, string>
}

// Hues stay clear of the priority colours (red, orange, teal) so a high-priority checkbox never reads as
// the accent. Blue is the app's own colour and keeps its tuned values in both themes.
export const PRESETS: Record<AccentId, Preset> = {
  blue: { light: '#4772fa', dark: '#6388fb', ring: { light: '#dfe7ff', dark: '#2c3a66' } },
  indigo: { light: '#5b5bd6' },
  violet: { light: '#8250df' },
  pink: { light: '#c93d8a' },
  green: { light: '#21874a' },
  moss: { light: '#5f7d1e' },
  cocoa: { light: '#8a6450' },
  graphite: { light: '#5b6573' },
}

export const isAccent = (v: unknown): v is AccentId => typeof v === 'string' && (ACCENT_IDS as readonly string[]).includes(v)

// ---- Colour maths (sRGB hex) ----

type RGB = [number, number, number]

export function parseHex(hex: string): RGB {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) as RGB
}

export function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
}

/** Relative luminance, as WCAG defines it. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** `a` moved towards `b` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB)
}

/** The closest colour to `color` (mixing towards black or white) that has at least `min` contrast with `against`. */
export function fitContrast(color: string, against: string, min: number, towards: 'black' | 'white'): string {
  if (contrast(color, against) >= min) return color
  const end = towards === 'black' ? '#000000' : WHITE
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (contrast(mix(color, end, mid), against) >= min) hi = mid
    else lo = mid
  }
  return mix(color, end, hi)
}

const rgba = (hex: string, a: number) => `rgba(${parseHex(hex).join(', ')}, ${a})`

export interface AccentColors {
  primary: string
  /** Labels and icons drawn on an accent fill. */
  onPrimary: string
  soft: string
  soft2: string
  /** The track behind the launch-screen and favicon ring. */
  ring: string
  /** The ring and tick of the app mark: the preset's own colour in both themes, like the app icon. */
  mark: string
}

/** Every colour the app derives from an accent preset, for one theme. */
export function accentColors(id: AccentId, theme: Resolved): AccentColors {
  const p = PRESETS[id] ?? PRESETS[DEFAULT_ACCENT]
  const bg = SURFACE[theme]
  let primary: string
  if (theme === 'light') {
    // On white the accent and a white label on the accent are the same pair: one floor covers both.
    primary = fitContrast(p.light, bg, MIN_CONTRAST, 'black')
  } else {
    // A step lighter so it carries on near-black, and light enough to be read as text there.
    primary = p.dark ?? fitContrast(mix(p.light, WHITE, 0.16), bg, TEXT_CONTRAST, 'white')
  }
  const onPrimary = contrast(WHITE, primary) >= MIN_CONTRAST ? WHITE : INK
  const soft = rgba(primary, theme === 'light' ? 0.1 : 0.16)
  const soft2 = rgba(primary, theme === 'light' ? 0.18 : 0.26)
  const ring = p.ring?.[theme] ?? (theme === 'light' ? mix(p.light, WHITE, 0.82) : mix(p.light, bg, 0.65))
  return { primary, onPrimary, soft, soft2, ring, mark: p.light }
}

/** CSS custom properties for an accent in one theme, set on the document element. */
export function accentTokens(id: AccentId, theme: Resolved): Record<string, string> {
  const c = accentColors(id, theme)
  return { '--primary': c.primary, '--primary-soft': c.soft, '--primary-soft2': c.soft2, '--on-primary': c.onPrimary, '--accent-ring': c.ring, '--accent-mark': c.mark }
}

export function resolveTheme(mode: ThemeMode | undefined, systemDark: boolean): Resolved {
  if (mode === 'light' || mode === 'dark') return mode
  return systemDark ? 'dark' : 'light'
}

/** The app icon in the accent, for the tab. The track follows the browser's colour scheme like the static icon. */
export function faviconSvg(id: AccentId): string {
  const l = accentColors(id, 'light')
  const d = accentColors(id, 'dark')
  const stroke = l.mark
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><style>.r{stroke:${l.ring}}@media (prefers-color-scheme:dark){.r{stroke:${d.ring}}}</style>` +
    `<circle class="r" cx="256" cy="256" r="196" fill="none" stroke-width="44"/>` +
    `<path d="M256 60A196 196 0 1 1 79 172" fill="none" stroke="${stroke}" stroke-width="44" stroke-linecap="round"/>` +
    `<path d="M176 260l56 56 112-124" fill="none" stroke="${stroke}" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  )
}

/** What the inline script in index.html reads before the app loads, so the launch screen is already in the right colours. */
export const LOOK_KEY = 'tickdone:look:v1'
export interface Look {
  mode: ThemeMode
  light: Record<string, string>
  dark: Record<string, string>
  icon: string
}

export function lookFor(mode: ThemeMode, id: AccentId): Look {
  return { mode, light: accentTokens(id, 'light'), dark: accentTokens(id, 'dark'), icon: 'data:image/svg+xml,' + encodeURIComponent(faviconSvg(id)) }
}
