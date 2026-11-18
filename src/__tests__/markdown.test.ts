import { describe, expect, it } from 'vitest'
import { markdownToText, safeHref } from '../markdown'

// The note editor itself (components/NoteEditor.tsx) is covered in the browser by e2e/notes.spec.ts,
// including the notes that try to sneak in markup or script links.

describe('links', () => {
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
})

describe('plain text', () => {
  it('the preview drops the Markdown marks', () => {
    expect(markdownToText('# Plan\n**Bold** and [a link](https://x.example) `code`\n\n- [ ] one\n- [x] two\n> quote\n\n---')).toBe('Plan\nBold and a link code\n☐ one\n☑ two\nquote')
    expect(markdownToText('## Inbox zero\n**Reply** to [Ann](https://example.com)\n- [ ] invoices\n`code`')).toBe('Inbox zero\nReply to Ann\n☐ invoices\ncode')
  })

  it('emphasis, strike, escapes and code', () => {
    expect(markdownToText('*it* _it_ ***both*** ~~gone~~ __strong__')).toBe('it it both gone strong')
    expect(markdownToText('snake_case_name and 2*3*4')).toBe('snake_case_name and 2*3*4')
    expect(markdownToText('\\*not italic\\* and `**kept**`')).toBe('*not italic* and **kept**')
    expect(markdownToText('```js\nconst a = 1\n```\nafter')).toBe('const a = 1\nafter')
    expect(markdownToText('1. first\n2) second\n  - nested')).toBe('first\nsecond\nnested')
    expect(markdownToText('line one\\\nline two')).toBe('line one\nline two')
  })

  it('HTML stays as text', () => {
    expect(markdownToText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
    expect(markdownToText('[click](javascript:alert(1))')).toBe('click')
  })
})
