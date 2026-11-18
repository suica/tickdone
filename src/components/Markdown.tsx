import { useMemo, type ReactNode } from 'react'
import { parseMarkdown, type Block, type Inline } from '../markdown'

// Renders a note's Markdown (see ../markdown.ts) as React elements. Text only ever reaches the page as
// React text nodes, and links are only the http(s)/mailto addresses the parser let through.

interface Opts {
  /** Called with the source line of a task list box that was clicked; boxes are read-only without it. */
  onToggle?: (line: number) => void
}

function inline(nodes: Inline[], key = ''): ReactNode[] {
  return nodes.map((n, i) => {
    const k = key + i
    switch (n.t) {
      case 'text':
        return n.v
      case 'br':
        return <br key={k} />
      case 'code':
        return <code key={k}>{n.v}</code>
      case 'strong':
        return <strong key={k}>{inline(n.c, k + '.')}</strong>
      case 'em':
        return <em key={k}>{inline(n.c, k + '.')}</em>
      case 'del':
        return <del key={k}>{inline(n.c, k + '.')}</del>
      case 'link':
        return (
          <a key={k} href={n.href} target="_blank" rel="noopener noreferrer">
            {inline(n.c, k + '.')}
          </a>
        )
    }
  })
}

function block(b: Block, k: string, o: Opts): ReactNode {
  switch (b.t) {
    case 'heading': {
      const H = `h${b.level}` as const
      return <H key={k}>{inline(b.c)}</H>
    }
    case 'para':
      return <p key={k}>{inline(b.c)}</p>
    case 'code':
      return (
        <pre key={k}>
          <code>{b.v}</code>
        </pre>
      )
    case 'quote':
      return <blockquote key={k}>{b.c.map((x, i) => block(x, k + '.' + i, o))}</blockquote>
    case 'hr':
      return <hr key={k} />
    case 'list': {
      const items = b.items.map((it, i) => (
        <li key={i} className={it.task ? 'md-task' + (it.task.checked ? ' checked' : '') : undefined}>
          {it.task && (
            <input
              type="checkbox"
              className="md-check"
              checked={it.task.checked}
              disabled={!o.onToggle}
              data-line={it.task.line}
              onChange={() => o.onToggle?.(it.task!.line)}
            />
          )}
          {/* a single paragraph sits on the line of its bullet or box */}
          {it.blocks.length === 1 && it.blocks[0].t === 'para' ? <span>{inline(it.blocks[0].c)}</span> : it.blocks.map((x, j) => block(x, k + '.' + i + '.' + j, o))}
        </li>
      ))
      const hasTasks = b.items.some((it) => it.task)
      return b.ordered ? (
        <ol key={k} start={b.start !== 1 ? b.start : undefined} className={hasTasks ? 'md-tasks' : undefined}>
          {items}
        </ol>
      ) : (
        <ul key={k} className={hasTasks ? 'md-tasks' : undefined}>
          {items}
        </ul>
      )
    }
  }
}

/** The blocks of a note as React elements. */
function renderMarkdown(src: string, o: Opts = {}): ReactNode[] {
  return parseMarkdown(src).map((b, i) => block(b, String(i), o))
}

export function Markdown({ source, onToggle, className }: { source: string; onToggle?: (line: number) => void; className?: string }) {
  const nodes = useMemo(() => renderMarkdown(source, { onToggle }), [source, onToggle])
  return <div className={'md' + (className ? ' ' + className : '')}>{nodes}</div>
}
