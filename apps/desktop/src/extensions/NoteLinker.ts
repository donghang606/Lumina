import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionOptions, type SuggestionKeyDownProps, type SuggestionProps, type SuggestionMatch } from '@tiptap/suggestion'
import type { Editor } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'

export interface NoteLinkItem {
  id: string
  title: string
}

export interface NoteLinkerOptions {
  items: (query: string) => Promise<NoteLinkItem[]>
  buildHref: (item: NoteLinkItem) => string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteLink: {
      insertNoteLink: (item: NoteLinkItem) => ReturnType
    }
  }
}

export const NOTE_LINK_PREFIX = 'lumina://note/'

interface WikiTrigger {
  char: string
  allowSpaces: boolean
  allowToIncludeChar: boolean
  allowedPrefixes: string[] | null
  startOfLine: boolean
  $position: {
    nodeBefore: { isText?: boolean; text?: string } | null
    pos: number
  }
}

function wikiMatcher(config: WikiTrigger): SuggestionMatch {
  const { $position } = config
  const nodeBefore = $position?.nodeBefore
  if (!nodeBefore?.isText || !nodeBefore.text) return null
  const text = nodeBefore.text
  const textFrom = $position.pos - text.length
  const m = text.match(/\[\[([^\[\]]*)$/)
  if (!m || m.index === undefined) return null
  const from = textFrom + m.index
  const to = $position.pos
  if (to < from) return null
  return {
    range: { from, to },
    query: m[1],
    text: m[0],
  }
}

function buildRenderer(editor: Editor) {
  let el: HTMLDivElement | null = null
  let items: NoteLinkItem[] = []
  let selected = 0
  let onPick: ((item: NoteLinkItem) => void) | null = null

  function render() {
    const root = el
    if (!root) return
    root.innerHTML = ''
    const header = document.createElement('div')
    header.className = 'li-header'
    header.textContent = '链接到笔记'
    root.appendChild(header)
    if (items.length === 0) {
      const e = document.createElement('div')
      e.className = 'li-empty'
      e.textContent = '没有匹配的笔记'
      root.appendChild(e)
      return
    }
    items.forEach((item, i) => {
      const row = document.createElement('div')
      row.className = 'li-item' + (i === selected ? ' active' : '')
      row.textContent = item.title || '(未命名)'
      row.onmousedown = (e) => {
        e.preventDefault()
        onPick?.(item)
      }
      root.appendChild(row)
    })
  }

  return {
    onStart: (props: SuggestionProps) => {
      items = (props.items as NoteLinkItem[]) ?? []
      onPick = (item: NoteLinkItem) => {
        editor.state.tr.deleteRange(props.range.from, props.range.to)
        editor.commands.insertNoteLink(item)
      }
      selected = 0
      el = document.createElement('div')
      el.className = 'lumina-note-linker'
      document.body.appendChild(el)
      render()
    },
    onUpdate: (props: SuggestionProps) => {
      items = (props.items as NoteLinkItem[]) ?? []
      onPick = (item: NoteLinkItem) => {
        editor.state.tr.deleteRange(props.range.from, props.range.to)
        editor.commands.insertNoteLink(item)
      }
      selected = 0
      render()
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'ArrowUp') {
        selected = (selected - 1 + items.length) % items.length
        render()
        return true
      }
      if (props.event.key === 'ArrowDown') {
        selected = (selected + 1) % items.length
        render()
        return true
      }
      if (props.event.key === 'Enter') {
        if (items[selected]) onPick?.(items[selected])
        return true
      }
      if (props.event.key === 'Escape') {
        el?.remove()
        el = null
        return true
      }
      return false
    },
    onExit: () => {
      el?.remove()
      el = null
    },
  }
}

export const NoteLinker = Extension.create<NoteLinkerOptions>({
  name: 'noteLinker',

  addOptions() {
    return {
      items: async () => [],
      buildHref: (item: NoteLinkItem) => `${NOTE_LINK_PREFIX}${item.id}`,
    }
  },

  addCommands() {
    return {
      insertNoteLink:
        (item: NoteLinkItem) =>
        ({ editor, tr }: { editor: Editor; tr: import('@tiptap/pm/state').Transaction }) => {
          const { from } = editor.state.selection
          if (from >= 2) {
            const before = editor.state.doc.textBetween(from - 2, from)
            if (before === '[[') tr.delete(from - 2, from)
          }
          const title = item.title || '(未命名)'
          const linkMark = editor.schema.marks.link
          const start = from - 2
          tr.insertText(title)
          tr.addMark(start, start + title.length, linkMark.create({ href: this.options.buildHref(item), title }))
          editor.commands.setTextSelection(start + title.length)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const options: SuggestionOptions<NoteLinkItem> = {
      editor: this.editor,
      char: '[[',
      pluginKey: new PluginKey('noteLinkerSuggest'),
      findSuggestionMatch: wikiMatcher as unknown as typeof import('@tiptap/suggestion').findSuggestionMatch,
      render: () => buildRenderer(this.editor),
      command: () => {},
      items: async ({ query }: { query?: string | null }) => {
        try {
          const all = await this.options.items((query ?? '').trim())
          return all.slice(0, 8)
        } catch {
          return []
        }
      },
    }
    return [Suggestion(options)]
  },
})