import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from '../components/Markdown'
import { markdownToText, parseInline, parseMarkdown, safeHref, toggleTaskLine } from '../markdown'

const html = (src: string, onToggle?: (line: number) => void) => renderToStaticMarkup(createElement(Markdown, { source: src, onToggle }))
/** The rendered note without its wrapper. */
const body = (src: string) => html(src).replace(/^<div class="md">/, '').replace(/<\/div>$/, '')

describe('blocks', () => {
  it('headings, paragraphs with line breaks, rules and quotes', () => {
    expect(body('# Title\n### Sub ###')).toBe('<h1>Title</h1><h3>Sub</h3>')
    expect(body('#nospace')).toBe('<p>#nospace</p>')
    expect(body('one\ntwo\n\nthree')).toBe('<p>one<br/>two</p><p>three</p>')
    expect(body('a\n\n---\n\n***\n___')).toBe('<p>a</p><hr/><hr/><hr/>')
    expect(body('> quoted\n> **still**\nlazy\n\nafter')).toBe('<blockquote><p>quoted<br/><strong>still</strong><br/>lazy</p></blockquote><p>after</p>')
    expect(body('> # in a quote\n> > nested')).toBe('<blockquote><h1>in a quote</h1><blockquote><p>nested</p></blockquote></blockquote>')
  })

  it('fenced code blocks keep their text as it is', () => {
    expect(body('```js\nconst a = 1 < 2 && **b**\n\n  indented\n```\nafter')).toBe(
      '<pre><code>const a = 1 &lt; 2 &amp;&amp; **b**\n\n  indented</code></pre><p>after</p>',
    )
    expect(parseMarkdown('~~~\nopen to the end')).toEqual([{ t: 'code', lang: '', v: 'open to the end' }])
    expect(parseMarkdown('````\n```\n````')[0]).toEqual({ t: 'code', lang: '', v: '```' })
  })

  it('bulleted and numbered lists, nested by indentation', () => {
    expect(body('- a\n- b\n  - b1\n  - b2\n- c')).toBe('<ul><li><span>a</span></li><li><p>b</p><ul><li><span>b1</span></li><li><span>b2</span></li></ul></li><li><span>c</span></li></ul>')
    expect(body('3. three\n4. four')).toBe('<ol start="3"><li><span>three</span></li><li><span>four</span></li></ol>')
    expect(body('* x\n+ y')).toBe('<ul><li><span>x</span></li></ul><ul><li><span>y</span></li></ul>')
    expect(body('- a\n\n- b')).toBe('<ul><li><span>a</span></li><li><span>b</span></li></ul>')
    expect(body('para\n- item')).toBe('<p>para</p><ul><li><span>item</span></li></ul>')
  })

  it('task list items know their line', () => {
    const blocks = parseMarkdown('Shopping\n- [ ] milk\n- [x] bread\n  - [X] rye')
    const list = blocks[1] as Extract<(typeof blocks)[number], { t: 'list' }>
    expect(list.items.map((x) => x.task)).toEqual([
      { checked: false, line: 1 },
      { checked: true, line: 2 },
    ])
    expect(body('- [ ] milk\n- [x] bread')).toBe(
      '<ul class="md-tasks"><li class="md-task"><input type="checkbox" class="md-check" disabled="" data-line="0"/><span>milk</span></li>' +
        '<li class="md-task checked"><input type="checkbox" class="md-check" disabled="" data-line="1" checked=""/><span>bread</span></li></ul>',
    )
    // with a handler the boxes can be clicked
    expect(html('- [ ] milk', () => {})).not.toContain('disabled')
    // an empty box is still a task
    expect(parseMarkdown('- [ ]')[0]).toMatchObject({ items: [{ task: { checked: false, line: 0 } }] })
  })
})

describe('inline', () => {
  it('bold, italic, strike, code', () => {
    expect(body('**b** __b__ *i* _i_ ~~s~~ `c`')).toBe('<p><strong>b</strong> <strong>b</strong> <em>i</em> <em>i</em> <del>s</del> <code>c</code></p>')
    expect(body('***both***')).toBe('<p><em><strong>both</strong></em></p>')
    expect(body('**bold with *italic* inside**')).toBe('<p><strong>bold with <em>italic</em> inside</strong></p>')
    expect(body('`` a ` b ``')).toBe('<p><code>a ` b</code></p>')
    expect(body('`**not bold**`')).toBe('<p><code>**not bold**</code></p>')
  })

  it('leaves stray marks and words with underscores alone', () => {
    expect(body('2 * 3 * 4')).toBe('<p>2 * 3 * 4</p>')
    expect(body('snake_case_name and file_v2')).toBe('<p>snake_case_name and file_v2</p>')
    expect(body('**unclosed')).toBe('<p>**unclosed</p>')
    expect(body('\\*not italic\\* \\# \\[x\\]')).toBe('<p>*not italic* # [x]</p>')
  })

  it('links: [text](url), <url> and bare addresses, opened in a new tab', () => {
    expect(body('[Docs](https://example.com/a?b=1&c=2)')).toBe('<p><a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">Docs</a></p>')
    expect(body('see https://example.com/path.')).toBe('<p>see <a href="https://example.com/path" target="_blank" rel="noopener noreferrer">https://example.com/path</a>.</p>')
    expect(body('(https://en.wikipedia.org/wiki/Foo_(bar))')).toContain('href="https://en.wikipedia.org/wiki/Foo_(bar)"')
    expect(body('<https://example.com>')).toContain('<a href="https://example.com/"')
    expect(body('[mail me](mailto:me@example.com)')).toContain('href="mailto:me@example.com"')
    expect(body('[**bold** link](http://example.com)')).toContain('><strong>bold</strong> link</a>')
    // no link inside a word or a code span
    expect(body('xhttps://example.com')).toBe('<p>xhttps://example.com</p>')
    expect(body('`https://example.com`')).toBe('<p><code>https://example.com</code></p>')
  })
})

describe('sanitising', () => {
  it('only http(s) and mailto addresses become links', () => {
    for (const ok of ['https://a.example', 'http://a.example/x', 'mailto:a@b.example', 'HTTPS://A.EXAMPLE']) expect(safeHref(ok)).not.toBeNull()
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'javascript&#58;alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'file:///etc/passwd',
      '//evil.example',
      '/relative',
      '#anchor',
      'https:',
      'http://',
      '',
    ])
      expect(safeHref(bad), bad).toBeNull()
  })

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '[click](javascript:alert(1))',
    '[click](JAVASCRIPT:alert(document.cookie))',
    '[click]( javascript:alert(1) )',
    '[click](data:text/html,<script>alert(1)</script>)',
    '[click](vbscript:msgbox)',
    '<javascript:alert(1)>',
    '[x](https://ok.example "title" onmouseover="alert(1)")',
    '# <svg onload=alert(1)>',
    '- [ ] <iframe src="javascript:alert(1)">',
    '> <style>body{display:none}</style>',
    '```\n</code></pre><script>alert(1)</script>\n```',
    '`<b onclick=alert(1)>`',
    '**<img src=x onerror=alert(1)>**',
    'https://ok.example/"><script>alert(1)</script>',
    '[a](https://ok.example/"onmouseover="alert(1))',
  ])('renders %j without markup or script', (src) => {
    const out = html(src)
    // every tag in the output is one the renderer makes, and none carries an event handler or a script address
    const tags = [...out.matchAll(/<\/?([a-zA-Z0-9]+)/g)].map((m) => m[1].toLowerCase())
    for (const tag of tags) expect(['div', 'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'hr', 'ul', 'ol', 'li', 'span', 'a', 'input']).toContain(tag)
    expect(out).not.toMatch(/<[^>]*\son[a-z]+=/i)
    expect(out).not.toMatch(/(href|src)="(?!https?:|mailto:)/i)
    expect(out.toLowerCase()).not.toContain('javascript:alert(1)"')
    // the text the user typed is still there, escaped
    if (src.includes('<script>')) expect(out).toContain('&lt;script&gt;')
  })

  it('a disallowed link keeps its words without the link', () => {
    expect(parseInline('[click me](javascript:alert(1))')).toEqual([{ t: 'text', v: 'click me' }])
    expect(body('[click](javascript:alert(1))')).toBe('<p>click</p>')
  })
})

describe('plain text and checklists', () => {
  it('the preview drops the Markdown marks', () => {
    expect(markdownToText('# Plan\n**Bold** and [a link](https://x.example) `code`\n\n- [ ] one\n- [x] two\n> quote\n\n---')).toBe('Plan\nBold and a link code\n☐ one\n☑ two\nquote')
    expect(markdownToText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
  })

  it('toggling a box changes only that line', () => {
    const src = 'List\n- [ ] milk\n  - [x] rye\n> - [ ] quoted\n1. [ ] numbered'
    expect(toggleTaskLine(src, 1)).toBe('List\n- [x] milk\n  - [x] rye\n> - [ ] quoted\n1. [ ] numbered')
    expect(toggleTaskLine(src, 2)).toBe('List\n- [ ] milk\n  - [ ] rye\n> - [ ] quoted\n1. [ ] numbered')
    expect(toggleTaskLine(src, 3)).toContain('> - [x] quoted')
    expect(toggleTaskLine(src, 4)).toContain('1. [x] numbered')
    expect(toggleTaskLine(src, 0)).toBe(src)
    expect(toggleTaskLine(src, 99)).toBe(src)
    // the line numbers the parser gives are the ones toggling uses
    const lines: number[] = []
    const walk = (bs: ReturnType<typeof parseMarkdown>) =>
      bs.forEach((b) => {
        if (b.t === 'list') b.items.forEach((it) => (it.task && lines.push(it.task.line), walk(it.blocks)))
        if (b.t === 'quote') walk(b.c)
      })
    walk(parseMarkdown(src))
    expect(lines).toEqual([1, 2, 3, 4])
  })
})
