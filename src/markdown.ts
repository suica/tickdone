// A small Markdown parser for task notes. It turns the source into a tree that components/Markdown.tsx
// renders as React elements: the text is never handed to the browser as HTML, so whatever a note
// contains is shown as text. Links are kept only for http(s) and mailto addresses.
//
// Blocks: ATX headings (# … ######), paragraphs (single line breaks kept), fenced code blocks (``` or ~~~),
// block quotes (>), thematic breaks (---, ***, ___), bulleted (-, *, +) and numbered (1. or 1)) lists,
// nested by indentation, and task list items (- [ ] / - [x]).
// Inline: **bold** / __bold__, *italic* / _italic_, ~~strike~~, `code`, [text](url), <https://…>, bare
// http(s):// addresses, backslash escapes and line breaks.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong' | 'em' | 'del'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' }

export interface ListItem {
  /** Task list item: whether it is ticked, and the source line (0-based) its box is on. */
  task?: { checked: boolean; line: number }
  blocks: Block[]
}

export type Block =
  | { t: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; c: Inline[] }
  | { t: 'para'; c: Inline[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'quote'; c: Block[] }
  | { t: 'hr' }
  | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }

interface Line {
  s: string
  /** line number in the note */
  n: number
}

const SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/** The address to link to, or null when it is not an http(s) or mailto address (javascript:, data:, relative …). */
export function safeHref(raw: string): string | null {
  // control characters and spaces inside a scheme are a classic way to sneak past checks: drop the link
  const s = raw.trim()
  // oxlint-disable-next-line no-control-regex -- looking for control characters is the point
  if (!s || /[\u0000-\u001f\u007f]/.test(s)) return null
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if (!SCHEMES.has(u.protocol)) return null
  if (u.protocol !== 'mailto:' && !u.hostname) return null
  return u.href
}

// ---------------- blocks ----------------

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const QUOTE = /^ {0,3}> ?/
const ITEM = /^( {0,12})([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/
const TASK = /^\[([ xX])\](?:[ \t]+|$)/

const blank = (l: Line) => !l.s.trim()
const indentOf = (s: string) => s.length - s.trimStart().length

function startsBlock(s: string): boolean {
  return FENCE.test(s) || HEADING.test(s) || HR.test(s) || QUOTE.test(s) || ITEM.test(s)
}

function parseBlocks(lines: Line[]): Block[] {
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const { s } = lines[i]
    if (!s.trim()) {
      i++
      continue
    }
    const fence = FENCE.exec(s)
    if (fence) {
      const mark = fence[1]
      const body: string[] = []
      i++
      while (i < lines.length && !new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}\\s*$`).test(lines[i].s)) body.push(lines[i++].s)
      i++ // the closing fence (or the end of the note)
      out.push({ t: 'code', lang: fence[2], v: body.join('\n') })
      continue
    }
    const h = HEADING.exec(s)
    if (h) {
      out.push({ t: 'heading', level: h[1].length as 1, c: parseInline(h[2] ?? '') })
      i++
      continue
    }
    if (HR.test(s)) {
      out.push({ t: 'hr' })
      i++
      continue
    }
    if (QUOTE.test(s)) {
      const inner: Line[] = []
      // a quote runs over its ">" lines and the lines that continue its paragraph
      while (i < lines.length && !blank(lines[i]) && (QUOTE.test(lines[i].s) || (inner.length && !startsBlock(lines[i].s)))) {
        inner.push({ s: lines[i].s.replace(QUOTE, ''), n: lines[i].n })
        i++
      }
      out.push({ t: 'quote', c: parseBlocks(inner) })
      continue
    }
    if (ITEM.test(s)) {
      const [list, next] = parseList(lines, i)
      out.push(list)
      i = next
      continue
    }
    const para: string[] = []
    while (i < lines.length && !blank(lines[i]) && (para.length === 0 || !startsBlock(lines[i].s))) para.push(lines[i++].s.trim())
    out.push({ t: 'para', c: parseInline(para.join('\n')) })
  }
  return out
}

/** A list starting at line `i`: its items, each with the lines indented under it. Returns the list and the next line. */
function parseList(lines: Line[], i: number): [Block, number] {
  const first = ITEM.exec(lines[i].s)!
  const ordered = /\d/.test(first[2])
  const delim = ordered ? first[2].slice(-1) : first[2]
  const base = first[1].length
  const items: ListItem[] = []
  const start = ordered ? parseInt(first[2], 10) : 1
  while (i < lines.length) {
    const m = ITEM.exec(lines[i].s)
    if (!m || m[1].length !== base) break
    const isOrdered = /\d/.test(m[2])
    if (isOrdered !== ordered || (isOrdered ? m[2].slice(-1) : m[2]) !== delim) break
    const contentIndent = m[1].length + m[2].length + Math.max(1, Math.min(m[3].length, 4))
    let text = m[4]
    let task: ListItem['task']
    const tm = TASK.exec(text)
    if (tm) {
      task = { checked: tm[1] !== ' ', line: lines[i].n }
      text = text.slice(tm[0].length)
    }
    const body: Line[] = [{ s: text, n: lines[i].n }]
    i++
    // the item's other lines: indented under it, or continuing its first paragraph
    while (i < lines.length) {
      const l = lines[i]
      if (blank(l)) {
        // a blank line stays in the item only when indented content follows
        const nextLine = lines.slice(i + 1).find((x) => !blank(x))
        if (nextLine && indentOf(nextLine.s) >= contentIndent) {
          body.push({ s: '', n: l.n })
          i++
          continue
        }
        break
      }
      const ind = indentOf(l.s)
      if (ind >= Math.min(contentIndent, base + 2)) body.push({ s: l.s.slice(Math.min(ind, contentIndent)), n: l.n })
      else if (!startsBlock(l.s) && !blank(body[body.length - 1])) body.push({ s: l.s.trim(), n: l.n })
      else break
      i++
    }
    items.push({ task, blocks: parseBlocks(body) })
    // blank lines between items keep the list going
    let j = i
    while (j < lines.length && blank(lines[j])) j++
    if (j > i && j < lines.length && ITEM.test(lines[j].s) && ITEM.exec(lines[j].s)![1].length === base) i = j
  }
  return [{ t: 'list', ordered, start, items }, i]
}

/** Parses a note into blocks. */
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n').map((s, n) => ({ s, n }))
  return parseBlocks(lines)
}

// ---------------- inline ----------------

const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/
const WORD = /[\p{L}\p{N}]/u
const BARE_URL = /^https?:\/\/[^\s<>"]+/i

/** Trailing punctuation is not part of a bare address, nor is a ")" without its "(". */
function trimUrl(url: string): string {
  let u = url.replace(/[.,;:!?'"*_~]+$/, '')
  while (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1).replace(/[.,;:!?'"*_~]+$/, '')
  return u
}

/** Where the closing `delim` for an opening at `from` is, or -1. Skips code spans and escapes. */
function findClose(s: string, from: number, delim: string): number {
  for (let i = from; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '`') {
      const run = /^`+/.exec(s.slice(i))![0]
      const end = s.indexOf(run, i + run.length)
      if (end > 0) {
        i = end + run.length - 1
        continue
      }
    }
    if (s.startsWith(delim, i) && i > from && !/\s/.test(s[i - 1])) {
      // a single * or _ must not be the start of a double one
      if (delim.length === 1 && s[i + 1] === delim && s[i - 1] !== delim) {
        const close2 = s.indexOf(delim + delim, i)
        if (close2 === i) {
          i++
          continue
        }
      }
      if (delim === '_' && WORD.test(s[i + 1] ?? '')) continue
      return i
    }
  }
  return -1
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ t: 'text', v: text })
    text = ''
  }
  const push = (n: Inline) => {
    flush()
    out.push(n)
  }
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    const rest = s.slice(i)
    if (ch === '\\' && i + 1 < s.length && PUNCT.test(s[i + 1])) {
      text += s[i + 1]
      i += 2
      continue
    }
    if (ch === '\n') {
      push({ t: 'br' })
      i++
      continue
    }
    if (ch === '`') {
      const run = /^`+/.exec(rest)![0]
      const end = s.indexOf(run, i + run.length)
      if (end > 0) {
        let v = s.slice(i + run.length, end).replace(/\n/g, ' ')
        if (/^ .* $/.test(v) && v.trim()) v = v.slice(1, -1)
        push({ t: 'code', v })
        i = end + run.length
        continue
      }
      text += run
      i += run.length
      continue
    }
    // ***both*** / ___both___: emphasis around strong
    const triple = rest.startsWith('***') ? '***' : rest.startsWith('___') && !WORD.test(s[i - 1] ?? '') ? '___' : ''
    if (triple && s[i + 3] && !/\s/.test(s[i + 3])) {
      const end = s.indexOf(triple, i + 3)
      if (end > i + 3 && !/\s/.test(s[end - 1])) {
        push({ t: 'em', c: [{ t: 'strong', c: parseInline(s.slice(i + 3, end)) }] })
        i = end + 3
        continue
      }
    }
    const double = rest.startsWith('**') ? '**' : rest.startsWith('__') ? '__' : rest.startsWith('~~') ? '~~' : ''
    if (double && s[i + 2] && !/\s/.test(s[i + 2]) && !(double === '__' && WORD.test(s[i - 1] ?? ''))) {
      const end = findClose(s, i + 2, double)
      if (end > 0) {
        push({ t: double === '~~' ? 'del' : 'strong', c: parseInline(s.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    }
    if ((ch === '*' || ch === '_') && s[i + 1] && !/\s/.test(s[i + 1]) && !(ch === '_' && WORD.test(s[i - 1] ?? ''))) {
      const end = findClose(s, i + 1, ch)
      if (end > i + 1) {
        push({ t: 'em', c: parseInline(s.slice(i + 1, end)) })
        i = end + 1
        continue
      }
    }
    if (ch === '[') {
      const m = /^\[((?:\\.|[^\]\\])*)\]\(\s*<?([^\s<>()]*(?:\([^\s<>()]*\)[^\s<>()]*)*)>?(?:\s+"[^"]*")?\s*\)/.exec(rest)
      if (m) {
        const href = safeHref(m[2])
        const label = parseInline(m[1])
        if (href) push({ t: 'link', href, c: label.length ? label : [{ t: 'text', v: m[2] }] })
        // an address that is not allowed: keep the words, drop the link
        else {
          flush()
          out.push(...label)
        }
        i += m[0].length
        continue
      }
    }
    if (ch === '<') {
      const m = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(rest)
      const href = m && safeHref(m[1])
      if (m && href) {
        push({ t: 'link', href, c: [{ t: 'text', v: m[1] }] })
        i += m[0].length
        continue
      }
    }
    if ((ch === 'h' || ch === 'H') && !WORD.test(s[i - 1] ?? '')) {
      const m = BARE_URL.exec(rest)
      if (m) {
        const url = trimUrl(m[0])
        const href = safeHref(url)
        if (href && url.length > 'https://'.length) {
          push({ t: 'link', href, c: [{ t: 'text', v: url }] })
          i += url.length
          continue
        }
      }
    }
    text += ch
    i++
  }
  flush()
  return out
}

// ---------------- plain text ----------------

const inlineText = (c: Inline[]): string =>
  c.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : n.t === 'br' ? '\n' : inlineText(n.c))).join('')

function blockText(b: Block): string {
  switch (b.t) {
    case 'heading':
    case 'para':
      return inlineText(b.c)
    case 'code':
      return b.v
    case 'quote':
      return b.c.map(blockText).join('\n')
    case 'hr':
      return ''
    case 'list':
      return b.items.map((it) => (it.task ? (it.task.checked ? '☑ ' : '☐ ') : '') + it.blocks.map(blockText).join('\n')).join('\n')
  }
}

/** The note as plain text, without the Markdown marks (for previews in the task list). */
export function markdownToText(src: string): string {
  return parseMarkdown(src).map(blockText).filter(Boolean).join('\n')
}

// ---------------- checklists ----------------

/** Ticks or unticks the task list item whose box is on `line`; returns the note unchanged if there is none. */
export function toggleTaskLine(src: string, line: number): string {
  const lines = src.split('\n')
  const l = lines[line]
  if (l === undefined) return src
  const m = /^((?:[ \t]*>[ \t]?)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])(\])/.exec(l)
  if (!m) return src
  lines[line] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3] + l.slice(m[0].length)
  return lines.join('\n')
}
