import { useEffect, useRef } from 'react'
import { EditorContent, Extension, InputRule, markInputRule, useEditor, type Editor } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import HardBreak from '@tiptap/extension-hard-break'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Markdown } from 'tiptap-markdown'
import { safeHref } from '../markdown'
import { t } from '../i18n'

// The task's notes, edited in place with their formatting shown as you type: "**bold**", "# " at the start
// of a line, "- [ ] " and the other Markdown marks turn into formatting right away, and pasted Markdown is
// converted. The note is still stored as Markdown text. Loaded on demand (see NoteField in TaskDetail.tsx).
//
// Safety: raw HTML in a note is never turned into elements (it stays text), and links are kept only for
// http(s) and mailto addresses; they open in a new tab.

// Single line breaks in a note are kept as line breaks (the Markdown extension reads them that way), so a
// break is written back as a plain line break rather than as "\" at the end of the line.
const LineBreak = HardBreak.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void }) {
          state.write('\n')
        },
      },
    }
  },
})

/**
 * "[ ] " or "[x] " typed at the start of a bulleted item (after "- " made it one) turns that item into a
 * checklist item. The bulleted items around it stay bulleted, in lists of their own.
 */
const BulletToTask = Extension.create({
  name: 'bulletToTask',
  addInputRules() {
    return [
      new InputRule({
        find: /^\[([ xX])?\]\s$/,
        handler: ({ state, range, match }) => {
          const $from = state.doc.resolve(range.from)
          const { taskList, taskItem } = state.schema.nodes
          // the paragraph must be the first child of a list item in a bulleted list
          const d = $from.depth
          if (d < 3 || $from.index(d - 1) !== 0) return null
          const item = $from.node(d - 1)
          const list = $from.node(d - 2)
          if (item.type.name !== 'listItem' || list.type.name !== 'bulletList' || !taskList || !taskItem) return null
          const tr = state.tr.delete(range.from, range.to)
          const listPos = tr.mapping.map($from.before(d - 2))
          const newList = tr.doc.nodeAt(listPos)!
          const at = $from.index(d - 2)
          const items: PMNode[] = []
          newList.forEach((n) => items.push(n))
          const checked = (match[1] ?? ' ').toLowerCase() === 'x'
          const parts: PMNode[] = []
          if (at > 0) parts.push(list.type.create(list.attrs, items.slice(0, at)))
          parts.push(taskList.create(null, taskItem.create({ checked }, items[at].content)))
          if (at < items.length - 1) parts.push(list.type.create(list.attrs, items.slice(at + 1)))
          tr.replaceWith(listPos, listPos + newList.nodeSize, parts)
          // the cursor goes to the start of the new checklist item's text
          let pos = listPos + 3
          if (at > 0) pos += parts[0].nodeSize
          tr.setSelection(TextSelection.near(tr.doc.resolve(pos)))
        },
      }),
      // in a checklist item (Enter after one makes the next), "- [x] " or "[x] " sets its box instead
      new InputRule({
        find: /^(?:[-*+]\s)?\[([ xX])?\]\s$/,
        handler: ({ state, range, match }) => {
          const $from = state.doc.resolve(range.from)
          const d = $from.depth
          if (d < 2 || $from.index(d - 1) !== 0 || $from.node(d - 1).type.name !== 'taskItem') return null
          const checked = (match[1] ?? ' ').toLowerCase() === 'x'
          const itemPos = $from.before(d - 1)
          state.tr.delete(range.from, range.to).setNodeMarkup(itemPos, undefined, { ...$from.node(d - 1).attrs, checked })
        },
      }),
    ]
  },
})

/**
 * "**bold**", "*italic*", "~~strike~~" and "`code`" format as soon as they are closed, also right after a
 * letter or punctuation with no space before them, as in Chinese or Japanese text ("现在**加粗**了"). The
 * built-in rules only fire after a space or at the start of a line.
 */
const MarksAnywhere = Extension.create({
  name: 'marksAnywhere',
  addInputRules() {
    const { bold, italic, strike, code } = this.editor.schema.marks
    return [
      markInputRule({ find: /(?<![*\\])\*\*(?![\s*])([^*]+?)(?<!\s)\*\*$/, type: bold }),
      markInputRule({ find: /(?<![*\\])\*(?![\s*])([^*]+?)(?<!\s)\*$/, type: italic }),
      markInputRule({ find: /(?<![~\\])~~(?![\s~])([^~]+?)(?<!\s)~~$/, type: strike }),
      markInputRule({ find: /(?<![`\\])`([^`]+)`$/, type: code }),
    ]
  },
})

/** Checklists are written without blank lines between their items, like bulleted lists, unless they had them. */
const TightTaskLists = Extension.create({
  name: 'tightTaskLists',
  addGlobalAttributes() {
    return [
      {
        types: ['taskList'],
        attributes: {
          tight: {
            default: true,
            parseHTML: (el) => el.getAttribute('data-tight') === 'true' || !el.querySelector('p'),
            renderHTML: (attrs) => ({ 'data-tight': attrs.tight ? 'true' : null }),
          },
        },
      },
    ]
  },
})

type MarkdownStorage = { markdown: { getMarkdown: () => string } }
const getMarkdown = (editor: Editor) => (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown()

export interface NoteEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder: string
  readOnly?: boolean
}

export default function NoteEditor({ value, onChange, placeholder, readOnly }: NoteEditorProps) {
  // the Markdown last written by or loaded into the editor, to tell outside changes (undo, another tab) apart
  const last = useRef(value)
  const change = useRef(onChange)
  useEffect(() => {
    change.current = onChange
  }, [onChange])

  const editor = useEditor({
    editable: !readOnly,
    // the editor is created in an effect, so the first paint shows it complete
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        hardBreak: false,
        underline: false,
        link: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      LineBreak,
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        protocols: ['mailto'],
        isAllowedUri: (url) => safeHref(url) !== null,
        shouldAutoLink: (url) => safeHref(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : 'https://' + url) !== null,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
      TaskList,
      TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node) => t('shell.detail.noteCheck', { text: node.textContent }) } }),
      BulletToTask,
      TightTaskLists,
      MarksAnywhere,
      Placeholder.configure({ placeholder }),
      Markdown.configure({
        // HTML in a note is shown as text, never parsed into elements
        html: false,
        linkify: true,
        breaks: true,
        tightLists: true,
        bulletListMarker: '-',
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    editorProps: {
      attributes: { class: 'detail-content md note-editor', spellcheck: 'false' },
    },
    onUpdate: ({ editor }) => {
      const md = getMarkdown(editor)
      if (md === last.current) return
      last.current = md
      change.current(md)
    },
  })

  // the note changed from outside (undo, a box ticked elsewhere): show it, unless it is what the editor wrote
  useEffect(() => {
    if (!editor || value === last.current) return
    last.current = value
    editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  useEffect(() => {
    editor?.setEditable(!readOnly, false)
  }, [editor, readOnly])

  return (
    <div
      className="detail-note"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
        // Esc leaves the editor, not the task
        e.preventDefault()
        e.stopPropagation()
        editor?.commands.blur()
      }}
    >
      {editor ? <EditorContent editor={editor} /> : <div className={'detail-content md note-loading' + (value ? '' : ' empty')}>{value || placeholder}</div>}
    </div>
  )
}
