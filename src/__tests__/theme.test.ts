import { describe, expect, it } from 'vitest'
import {
  ACCENT_IDS,
  DEFAULT_ACCENT,
  INK,
  MIN_CONTRAST,
  SURFACE,
  TEXT_CONTRAST,
  accentColors,
  accentTokens,
  contrast,
  faviconSvg,
  fitContrast,
  isAccent,
  lookFor,
  luminance,
  mix,
  parseHex,
  resolveTheme,
  toHex,
} from '../theme'

// CIE76 colour difference, enough to tell whether two colours read as the same colour.
function lab(hex: string) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const xyz = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883]
  const [x, y, z] = xyz.map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116))
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const deltaE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]))

// Priority colours from src/index.css, per theme
const PRIORITY = { light: ['#d52b24', '#f29a0e', '#1e9eb0'], dark: ['#ec4b44', '#f0a020', '#3bb3c4'] } as const

describe('colour maths', () => {
  it('parses and prints hex colours', () => {
    expect(parseHex('#4772fa')).toEqual([71, 114, 250])
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(toHex([71, 114, 250])).toBe('#4772fa')
    expect(toHex([300, -4, 127.6])).toBe('#ff0080')
  })

  it('computes WCAG luminance and contrast', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1)
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21)
    expect(contrast('#777777', '#777777')).toBe(1)
    // The default blue on white, a known value
    expect(contrast('#4772fa', '#ffffff')).toBeCloseTo(4.15, 2)
  })

  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('fits a colour to a contrast floor with the smallest change', () => {
    const pale = '#9fb4ff'
    expect(contrast(pale, '#ffffff')).toBeLessThan(3)
    const fitted = fitContrast(pale, '#ffffff', 3, 'black')
    expect(contrast(fitted, '#ffffff')).toBeGreaterThanOrEqual(3)
    expect(contrast(fitted, '#ffffff')).toBeLessThan(3.1)
    // Already fine: unchanged
    expect(fitContrast('#4772fa', '#ffffff', 3, 'black')).toBe('#4772fa')
    // Lightening for a dark background
    const dim = fitContrast('#303060', '#1c1c1c', 4.5, 'white')
    expect(contrast(dim, '#1c1c1c')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('accent presets', () => {
  it('has about eight presets with blue as the default', () => {
    expect(ACCENT_IDS.length).toBe(8)
    expect(DEFAULT_ACCENT).toBe('blue')
    expect(isAccent('violet')).toBe(true)
    expect(isAccent('neon')).toBe(false)
    expect(isAccent(undefined)).toBe(false)
  })

  it('darkens the default blue just enough for AA text in light and keeps its dark value', () => {
    expect(accentTokens('blue', 'light')).toMatchObject({
      '--primary': '#3e62d9',
      '--primary-soft': 'rgba(62, 98, 217, 0.1)',
      '--primary-soft2': 'rgba(62, 98, 217, 0.18)',
      '--on-primary': '#ffffff',
      '--accent-ring': '#dfe7ff',
      // the app mark keeps the preset's own colour
      '--accent-mark': '#4772fa',
    })
    expect(accentTokens('blue', 'dark')).toMatchObject({
      // the default blue keeps its own dark value and white labels
      '--primary': '#6388fb',
      '--primary-soft': 'rgba(99, 136, 251, 0.16)',
      '--primary-soft2': 'rgba(99, 136, 251, 0.26)',
      '--on-primary': '#ffffff',
      '--accent-ring': '#2c3a66',
    })
  })

  for (const id of ACCENT_IDS)
    for (const theme of ['light', 'dark'] as const)
      it(`${id} in the ${theme} theme meets AA and stays apart from the priority colours`, () => {
        const c = accentColors(id, theme)
        // The default blue keeps its own designed dark value (a product decision); it still clears the UI floor
        const floor = id === 'blue' && theme === 'dark' ? MIN_CONTRAST : TEXT_CONTRAST
        // The accent is text (dates, links, selected tabs): AA on the page and on the greys and tints it sits on
        for (const bg of [SURFACE[theme], ...(theme === 'light' ? ['#ededed', '#edf1ff'] : floor === TEXT_CONTRAST ? ['#3a3a3a', '#303648'] : [])])
          expect(contrast(c.primary, bg)).toBeGreaterThanOrEqual(floor - 0.01)
        // Labels on accent fills (buttons) are text too
        expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(floor)
        for (const p of PRIORITY[theme]) expect(deltaE(c.primary, p)).toBeGreaterThan(25)
        // The soft tints are the accent at low alpha
        const [r, g, b] = parseHex(c.primary)
        expect(c.soft).toBe(`rgba(${r}, ${g}, ${b}, ${theme === 'light' ? 0.1 : 0.16})`)
      })

  it('falls back to dark labels when white would be too faint', () => {
    // Not a preset: a light yellow forced through the same rule
    const pale = '#f5d742'
    expect(contrast('#ffffff', pale)).toBeLessThan(MIN_CONTRAST)
    expect(contrast(INK, pale)).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  it('gives every preset a distinct colour', () => {
    const seen = new Set(ACCENT_IDS.map((id) => accentColors(id, 'light').primary))
    expect(seen.size).toBe(ACCENT_IDS.length)
    for (const a of ACCENT_IDS)
      for (const b of ACCENT_IDS) if (a < b) expect(deltaE(accentColors(a, "light").primary, accentColors(b, "light").primary), a + " " + b).toBeGreaterThan(12)
  })
})

describe('theme mode', () => {
  it('resolves light, dark and follow-system', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme(undefined, true)).toBe('dark')
  })

  it('builds the launch-screen copy and the tab icon in the accent', () => {
    const look = lookFor('system', 'green')
    expect(look.mode).toBe('system')
    expect(look.light['--primary']).toBe(accentColors('green', 'light').primary)
    expect(look.dark['--primary']).toBe(accentColors('green', 'dark').primary)
    expect(look.icon.startsWith('data:image/svg+xml,')).toBe(true)
    const svg = faviconSvg('green')
    expect(svg).toContain(accentColors('green', 'light').mark)
    expect(svg).toContain(accentColors('green', 'dark').ring)
    expect(svg).not.toContain('#4772fa')
  })
})
