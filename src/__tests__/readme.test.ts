import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOCALES } from '../i18n/locales'

const roadmap = (file: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => /^- \[[ x]\] /.test(l))
    .map((l) => `${l.slice(0, 5)} ${l.match(/\/issues\/(\d+)\)/)?.[1] ?? '-'}`)

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
