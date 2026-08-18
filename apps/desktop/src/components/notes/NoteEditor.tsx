import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Typography, Tag } from '@arco-design/web-react'
import {
  ArrowLeft,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Link2,
  Trash2,
  Check,
  Sparkles,
  Wand2,
  Languages,
  Shrink,
  Expand,
  Loader2,
} from 'lucide-react'
import { useNoteStore } from '../../stores/noteStore'
import { NoteLinker } from '../../extensions/NoteLinker'
import { noteService } from '../../services/noteService'
import { aiService } from '../../services/aiService'

const { Text } = Typography

const MARKDOWN_HINT =
  /(\*\*|__|~~|```|\[\[)|(^|\n)\s{0,3}(#{1,6}\s|>|[-*+]\s|\d+\.\s)|\[[^\[\]\n]*\]\([^)\n]*\)/

function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_HINT.test(text)
}

interface Props {
  noteId: string
  title: string
  content: string
  onTitleChange: (v: string) => void
  onContentChange: (v: string) => void
  onSave: () => void
  onClose: () => void
  onOpenLink?: (noteId: string) => void
}

export default function NoteEditor({ noteId, title, content, onTitleChange, onContentChange, onSave, onClose, onOpenLink }: Props) {
  const { deleteNote } = useNoteStore()
  const [preview, setPreview] = useState<{ x: number; y: number; data: { title: string; summary: string | null; tags: { id: string; name: string; color: string | null }[] } } | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: '开始书写…（输入 [[ 可链接其他笔记）' }),
      NoteLinker.configure({
        items: (q) => noteService.search(q),
        buildHref: (item) => `lumina://note/${item.id}`,
      }),
      Markdown,
    ],
    content,
    contentType: 'markdown',
    onUpdate: ({ editor: e }) => onContentChange(e.getMarkdown()),
    editorProps: {
      attributes: {
        class: 'lumina-editor-prosemirror',
      },
      handlePaste: (_view, event) => {
        const html = event.clipboardData?.getData('text/html') ?? ''
        if (html) return false
        const text = event.clipboardData?.getData('text/plain') ?? ''
        if (!text || !looksLikeMarkdown(text)) return false
        event.preventDefault()
        editor?.commands.insertContent(text, { contentType: 'markdown' })
        return true
      },
    },
  })

  useEffect(() => {
    if (editor && content !== editor.getMarkdown()) {
      editor.commands.setContent(content || '', { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  const onDelete = async () => {
    if (!noteId) return
    await deleteNote(noteId)
    onClose()
  }

  const onHoverLink = async (e: React.MouseEvent, href: string) => {
    const id = href.replace(/^.*lumina:\/\/note\//, '')
    if (!id || id === noteId) return
    if (hideTimer.current) clearTimeout(hideTimer.current)
    try {
      const detail = await noteService.getWithDetails(id)
      if (!detail) return
      setPreview({
        x: e.clientX,
        y: e.clientY,
        data: { title: detail.note.title, summary: detail.note.summary, tags: detail.tags },
      })
    } catch {
      /* ignore */
    }
  }

  const onLeaveLink = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setPreview(null), 250)
  }

  const [aiBusy, setAiBusy] = useState<string | null>(null)

  const runAiTransform = async (mode: 'polish' | 'rewrite' | 'translate' | 'shorten' | 'expand') => {
    if (!editor || aiBusy) return
    const { from, to, empty } = editor.state.selection
    if (empty) {
      window.alert('请先选中要处理的文本')
      return
    }
    const selected = editor.state.doc.textBetween(from, to, '\n')
    if (!selected.trim()) return
    setAiBusy(mode)
    try {
      let targetLang: string | undefined
      if (mode === 'translate') {
        const input = window.prompt('翻译目标语言（默认中文）', '中文')
        if (input === null) return
        targetLang = input.trim() || '中文'
      }
      const result = await aiService.transform(selected, mode, targetLang)
      editor.chain().focus().deleteRange({ from, to }).insertContent(result).run()
      onContentChange(editor.getMarkdown())
    } catch (e) {
      window.alert(`AI 处理失败：${e instanceof Error ? e.message : '未知错误'}`)
    } finally {
      setAiBusy(null)
    }
  }

  const AI_TOOLS: { Icon: typeof Wand2; title: string; mode: 'polish' | 'rewrite' | 'translate' | 'shorten' | 'expand' }[] = [
    { Icon: Sparkles, title: '润色', mode: 'polish' },
    { Icon: Wand2, title: '改写', mode: 'rewrite' },
    { Icon: Languages, title: '翻译', mode: 'translate' },
    { Icon: Shrink, title: '精简', mode: 'shorten' },
    { Icon: Expand, title: '扩写', mode: 'expand' },
  ]

  const setLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('链接 URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const TOOLS: { Icon: typeof Bold; title: string; run: () => void; active?: () => boolean }[] = [
    { Icon: Bold, title: '加粗', run: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive('bold') },
    { Icon: Italic, title: '斜体', run: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive('italic') },
    { Icon: Heading1, title: '一级标题', run: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: () => editor?.isActive('heading', { level: 1 }) },
    { Icon: Heading2, title: '二级标题', run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor?.isActive('heading', { level: 2 }) },
    { Icon: Heading3, title: '三级标题', run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), active: () => editor?.isActive('heading', { level: 3 }) },
    { Icon: List, title: '无序列表', run: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive('bulletList') },
    { Icon: ListOrdered, title: '有序列表', run: () => editor?.chain().focus().toggleOrderedList().run(), active: () => editor?.isActive('orderedList') },
    { Icon: Quote, title: '引用', run: () => editor?.chain().focus().toggleBlockquote().run(), active: () => editor?.isActive('blockquote') },
    { Icon: Code2, title: '代码块', run: () => editor?.chain().focus().toggleCodeBlock().run(), active: () => editor?.isActive('codeBlock') },
    { Icon: Link2, title: '插入链接', run: setLink, active: () => editor?.isActive('link') },
  ]

  return (
    <div className="glass" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>
      {/* 顶栏 */}
      <div style={{ padding: '10px var(--sp-4)', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="lumina-iconbtn" onClick={onClose} title="返回" style={{ width: 30, height: 30 }}>
          <ArrowLeft size={17} />
        </button>
        <span className="lumina-label">编辑笔记</span>
        <div style={{ flex: 1 }} />
        <button className="lumina-toolbtn" onClick={onDelete} style={{ color: 'var(--danger)' }} title="删除">
          <Trash2 size={14} /> 删除
        </button>
        <button className="lumina-toolbtn lumina-toolbtn-primary" onClick={onSave}>
          <Check size={14} /> 保存
        </button>
      </div>

      {/* 工具栏 */}
      <div style={{ padding: '4px var(--sp-4)', borderBottom: '1px solid var(--glass-border)', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {TOOLS.map(({ Icon, title, run, active }) => (
          <button
            key={title}
            title={title}
            className="lumina-tool"
            style={{ background: active?.() ? 'var(--accent-soft)' : 'transparent', color: active?.() ? 'var(--accent)' : 'var(--text-2)' }}
            onClick={run}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      {/* AI 工具栏 */}
      <div style={{ padding: '4px var(--sp-4)', borderBottom: '1px solid var(--glass-border)', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginRight: 4 }}>AI</span>
        {AI_TOOLS.map(({ Icon, title, mode }) => (
          <button
            key={mode}
            title={`${title}（需选中文本）`}
            className="lumina-tool"
            disabled={!!aiBusy}
            style={{ color: aiBusy === mode ? 'var(--accent)' : 'var(--text-2)' }}
            onClick={() => void runAiTransform(mode)}
          >
            {aiBusy === mode ? <Loader2 size={15} className="lumina-spin" /> : <Icon size={15} />}
          </button>
        ))}
      </div>

      {/* 正文 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-5) var(--sp-7)', maxWidth: 780, width: '100%', margin: '0 auto' }}>
        <input
          value={title}
          placeholder="标题"
          onChange={(e) => onTitleChange(e.target.value)}
          className="lumina-editor-title"
        />
        <div className="lumina-editor">
          <EditorContent
            editor={editor}
            onClick={(e) => {
              const a = (e.target as HTMLElement)?.closest?.('a[href*="lumina://note/"]') as HTMLAnchorElement | null
              if (a) {
                e.preventDefault()
                e.stopPropagation()
                const id = a.href.replace(/^.*lumina:\/\/note\//, '')
                if (id) onOpenLink?.(id)
              }
            }}
            onMouseMove={(e) => {
              const a = (e.target as HTMLElement)?.closest?.('a[href*="lumina://note/"]') as HTMLAnchorElement | null
              if (a && !preview) void onHoverLink(e, a.href)
            }}
            onMouseLeave={() => onLeaveLink()}
          />
        </div>

        {/* 链接预览 */}
        {preview && (
          <div
            className="glass"
            style={{
              position: 'fixed',
              left: Math.min(preview.x + 14, window.innerWidth - 250),
              top: Math.min(preview.y + 14, window.innerHeight - 140),
              zIndex: 2100,
              width: 240,
              padding: 14,
              pointerEvents: 'none',
              boxShadow: 'var(--shadow-3)',
            }}
          >
            <Text style={{ fontSize: 'var(--text-base)', fontWeight: 700, display: 'block', marginBottom: 6, color: 'var(--text-1)' }}>
              {preview.data.title || '(无标题)'}
            </Text>
            {preview.data.summary && (
              <Text style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)', display: 'block', marginBottom: 6, lineHeight: 1.5 }}>
                {preview.data.summary}
              </Text>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {preview.data.tags.map((t) => (
                <Tag key={t.id} size="small" color={t.color ?? 'arcoblue'}>
                  #{t.name}
                </Tag>
              ))}
            </div>
            <Text style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block', marginTop: 6 }}>
              点击打开 · [[双链已关联]]
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}