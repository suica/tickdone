// Small helpers for task notes, which are stored as Markdown text. The notes themselves are edited and shown
// by components/NoteEditor.tsx (loaded on demand); this file stays light so that the task list can use it.

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

/** Inline marks dropped: links keep their words, code spans their text, and emphasis its words. */
function inlineText(s: string): string {
  // code spans first, so that marks inside them stay as they are
  return s
    .split(/(`+)([^`]|[^`].*?[^`])\1(?!`)/)
    .map((part, i) => {
      if (i % 3 === 1) return ''
      if (i % 3 === 2) return part.trim() ? part.replace(/^ (.*) $/, '$1') : part
      return part
        // escaped marks are set aside first, so that they are not read as marks
        .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, (_, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)))
        .replace(/!?\[((?:\\.|[^\]\\])*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
        .replace(/<((?:https?:\/\/|mailto:)[^\s<>]+)>/gi, '$1')
        .replace(/(\*\*\*|___)(?=\S)(.+?)(?<=\S)\1/g, '$2')
        .replace(/(\*\*|__|~~)(?=\S)(.+?)(?<=\S)\1/g, '$2')
        .replace(/(^|[^\p{L}\p{N}*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?!\*)/gu, '$1$2')
        .replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\p{L}\p{N}_])/gu, '$1$2')
        .replace(/\\$/, '')
        .replace(/[\ue000-\ue07f]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000))
    })
    .join('')
}

/** The note as plain text, without the Markdown marks (for previews in the task list). */
export function markdownToText(src: string): string {
  const out: string[] = []
  let fence = ''
  for (let line of src.replace(/\r\n?/g, '\n').split('\n')) {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length).trim()) fence = ''
      else if (line.trim()) out.push(line)
      continue
    }
    if (f) {
      fence = f[1]
      continue
    }
    // thematic breaks
    if (/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) continue
    line = line
      .replace(/^(?:[ \t]*>[ \t]?)+/, '')
      .replace(/^ {0,3}#{1,6}(?:[ \t]+|$)/, '')
      .replace(/[ \t]+#+[ \t]*$/, '')
      .replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[([ xX])\](?:[ \t]+|$)/, (_, c: string) => (c === ' ' ? '☐ ' : '☑ '))
      .replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/, '')
    line = inlineText(line).trim()
    if (line) out.push(line)
  }
  return out.join('\n')
}
