#!/usr/bin/env node
// Ticks or unticks roadmap items in README.md and every translation, by issue number.
//   node scripts/roadmap.mjs done 8 9     → "- [x] … (#8)", "- [x] … (#9)"
//   node scripts/roadmap.mjs undo 8       → "- [ ] … (#8)"
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const [cmd, ...nums] = process.argv.slice(2)
if (!['done', 'undo'].includes(cmd) || nums.length === 0 || nums.some((n) => !/^\d+$/.test(n))) {
  console.error('usage: node scripts/roadmap.mjs done|undo <issue number>...')
  process.exit(1)
}
const from = cmd === 'done' ? '- [ ]' : '- [x]'
const to = cmd === 'done' ? '- [x]' : '- [ ]'
const files = readdirSync('.').filter((f) => /^README(\.[\w-]+)?\.md$/.test(f))
let missing = false
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n')
  for (const n of nums) {
    const i = lines.findIndex((l) => /^- \[[ x]\] /.test(l) && l.includes(`/issues/${n})`))
    if (i < 0) {
      console.error(`${f}: no roadmap line for #${n}`)
      missing = true
      continue
    }
    if (lines[i].startsWith(from)) lines[i] = to + lines[i].slice(from.length)
  }
  writeFileSync(f, lines.join('\n'))
}
console.log(`${cmd} ${nums.map((n) => '#' + n).join(' ')} in ${files.length} files`)
process.exit(missing ? 1 : 0)
