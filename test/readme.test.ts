import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOCALES } from '../src/i18n/locales'

const roadmap = (file: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => /^- \[[ x]\] /.test(l))
    .map((l) => `${l.slice(0, 5)} ${l.match(/\/issues\/(\d+)\)/)?.[1] ?? '-'}`)

/** Images a README shows from the repository (HTML `src="…"` and Markdown `![…](…)`). */
const localImages = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(/(?:src="|!\[[^\]]*\]\()([^")\s]+)/g)].map((m) => m[1]).filter((src) => !/^https?:/.test(src))

describe('README translations', () => {
  const files = readdirSync('.').filter((f) => /^README\.[\w-]+\.md$/.test(f))

  it('exist for every supported language', () => {
    expect(files.sort()).toEqual(LOCALES.filter((l) => l.code !== 'en').map((l) => `README.${l.code}.md`).sort())
  })

  for (const f of files) {
    it(`${f} has the same roadmap items and progress as README.md`, () => {
      expect(roadmap(f)).toEqual(roadmap('README.md'))
    })
  }
})

describe('README banners', () => {
  it('have their text in scripts/promo/hero.json for every supported language', () => {
    const hero = JSON.parse(readFileSync('scripts/promo/hero.json', 'utf8'))
    expect(Object.keys(hero).sort()).toEqual(LOCALES.map((l) => l.code).sort())
  })

  for (const { code } of LOCALES) {
    const file = code === 'en' ? 'README.md' : `README.${code}.md`
    it(`${file} shows its own banner, and every image it shows exists`, () => {
      const images = localImages(file)
      expect(images).toContain(`docs/hero/hero.${code}.png`)
      for (const src of images) expect(existsSync(src), src).toBe(true)
    })
  }
})
