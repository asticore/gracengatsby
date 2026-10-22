'use client'

import React, { useEffect, useReducer, useRef } from 'react'

import { ALL_MARKS, applyFormat, clearFormat, sanitizeInlineHtml, shortcutMark, type Mark } from './inlineFormat'
import { inlineReducer, inlineResult, startInline } from './inlineEdit'

export type InlineEditorProps = {
  /** Text when editing began. */
  value: string
  /** Quote and rich-text-as-plain elements may span lines; Shift+Enter inserts a line break there. */
  multiline: boolean
  /** Value is the sanitised HTML subset (strong, em, a, br); shows the Bold/Italic/Link/Clear toolbar. */
  rich?: boolean
  /** Marks this element allows (default all): the toolbar offers only these and the sanitiser drops the rest. */
  formats?: readonly Mark[]
  /** Accessible name, e.g. "Edit heading". */
  label: string
  /** Called once with the new text (only when it changed). */
  onCommit: (value: string) => void
  /** Called once when nothing is written (Esc, or no change). */
  onCancel: () => void
  /** Tab / Shift+Tab: commit, then move to the neighbouring editable text. */
  onTab: (direction: 'next' | 'prev', value: string | null) => void
}

/**
 * Plain-text editor laid over a canvas element (double-click). Enter or blur commits, Esc cancels,
 * Tab commits and moves on. The session reducer (inlineEdit.ts) guarantees exactly one outcome:
 * a blur that follows Enter/Esc/Tab is ignored.
 */
export const CanvasInlineEditor: React.FC<InlineEditorProps> = ({ value, multiline, rich, formats, label, onCommit, onCancel, onTab }) => {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [session, dispatch] = useReducer(inlineReducer, value, startInline)
  const finished = useRef(false)
  const pendingTab = useRef<'next' | 'prev' | null>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  // Report the outcome exactly once, after the reducer has settled.
  useEffect(() => {
    if (!session.done || finished.current) return
    finished.current = true
    const result = inlineResult(session)
    const tab = pendingTab.current
    if (tab) onTab(tab, result)
    else if (result !== null) onCommit(result)
    else onCancel()
  }, [session, onCommit, onCancel, onTab])

  if (rich) return <RichInlineEditor {...{ value, multiline, formats, label, onCommit, onCancel, onTab }} />
  return (
    <textarea
      ref={ref}
      className="ve-inline-editor"
      aria-label={label}
      value={session.draft}
      rows={1}
      onChange={(e) => dispatch({ type: 'change', value: multiline ? e.target.value : e.target.value.replace(/\r?\n/g, ' ') })}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.preventDefault()
          dispatch({ type: 'cancel' })
        } else if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
          e.preventDefault()
          dispatch({ type: 'commit' })
        } else if (e.key === 'Tab') {
          e.preventDefault()
          pendingTab.current = e.shiftKey ? 'prev' : 'next'
          dispatch({ type: 'commit' })
        }
      }}
      onBlur={() => dispatch({ type: 'commit' })}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        minHeight: 32,
        boxSizing: 'border-box',
        padding: '4px 8px',
        border: '2px solid #0066cc',
        borderRadius: 4,
        font: 'inherit',
        color: '#111',
        textAlign: 'inherit',
        backgroundColor: '#fff',
        resize: 'none',
        zIndex: 20,
      }}
    />
  )
}

export default CanvasInlineEditor

/* ---- rich mode ---- */

const textLen = (n: Node): number => (n.nodeType === 3 ? (n.nodeValue ?? '').length : (n as Element).tagName === 'BR' ? 1 : Array.from(n.childNodes).reduce((a, c) => a + textLen(c), 0))

/** Plain-text offset (br counts 1) of a DOM point inside `root`. */
function offsetOf(root: Node, node: Node, off: number): number {
  let total = 0
  let found = false
  const walk = (n: Node) => {
    if (found) return
    if (n === node) {
      found = true
      total += n.nodeType === 3 ? off : Array.from(n.childNodes).slice(0, off).reduce((a, c) => a + textLen(c), 0)
      return
    }
    if (n.nodeType === 3 || (n as Element).tagName === 'BR') {
      total += textLen(n)
      return
    }
    n.childNodes.forEach(walk)
  }
  walk(root)
  return total
}

/** DOM point for a plain-text offset. */
function pointAt(root: Node, offset: number): { node: Node; offset: number } {
  let left = offset
  let result: { node: Node; offset: number } | null = null
  const walk = (n: Node) => {
    if (result) return
    if (n.nodeType === 3) {
      const len = (n.nodeValue ?? '').length
      if (left <= len) result = { node: n, offset: left }
      else left -= len
    } else if ((n as Element).tagName === 'BR') {
      if (left === 0) result = { node: n.parentNode as Node, offset: Array.from(n.parentNode!.childNodes).indexOf(n as ChildNode) }
      else left -= 1
    } else n.childNodes.forEach(walk)
  }
  walk(root)
  return result ?? { node: root, offset: root.childNodes.length }
}

const ToolButton: React.FC<{ text: string; title: string; run: () => void; style?: React.CSSProperties }> = ({ text, title, run, style }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onMouseDown={(e) => {
      e.preventDefault()
      run()
    }}
    style={{ padding: '2px 8px', border: 0, background: 'transparent', color: '#fff', cursor: 'pointer', font: '600 13px sans-serif', ...style }}
  >
    {text}
  </button>
)

const RichInlineEditor: React.FC<Pick<InlineEditorProps, 'value' | 'multiline' | 'formats' | 'label' | 'onCommit' | 'onCancel' | 'onTab'>> = ({ value, multiline, formats = ALL_MARKS, label, onCommit, onCancel, onTab }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [session, dispatch] = useReducer(inlineReducer, value, startInline)
  const finished = useRef(false)
  const pendingTab = useRef<'next' | 'prev' | null>(null)
  const [bar, setBar] = React.useState<{ top: number; left: number } | null>(null)
  const [linkDraft, setLinkDraft] = React.useState<string | null>(null)
  const savedRange = useRef<[number, number]>([0, 0])

  const html = () => sanitizeInlineHtml(ref.current?.innerHTML ?? '', formats)
  const range = (): [number, number] | null => {
    const el = ref.current
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return null
    const a = offsetOf(el, sel.anchorNode!, sel.anchorOffset)
    const b = offsetOf(el, sel.focusNode!, sel.focusOffset)
    return [Math.min(a, b), Math.max(a, b)]
  }
  const setHtml = (next: string, sel?: [number, number]) => {
    const el = ref.current
    if (!el) return
    el.innerHTML = next
    dispatch({ type: 'change', value: next })
    if (sel) {
      const r = document.createRange()
      const s = pointAt(el, sel[0])
      const e = pointAt(el, sel[1])
      r.setStart(s.node, s.offset)
      r.setEnd(e.node, e.offset)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(r)
    }
  }
  const format = (mark: Mark | 'clear', href?: string | null, sel?: [number, number]) => {
    const cur = html()
    const [s, e] = sel ?? range() ?? savedRange.current
    setHtml(mark === 'clear' ? clearFormat(cur, s, e) : applyFormat(cur, s, e, mark, href), [s, e])
  }
  const updateBar = () => {
    const sel = window.getSelection()
    const r = range()
    if (!r || r[0] === r[1] || !sel?.rangeCount) return setBar(null)
    savedRange.current = r
    const box = sel.getRangeAt(0).getBoundingClientRect()
    const host = ref.current!.getBoundingClientRect()
    setBar({ top: Math.max(-40, box.top - host.top - 40), left: Math.max(0, box.left - host.left) })
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = sanitizeInlineHtml(value, formats)
    el.focus()
    const r = document.createRange()
    r.selectNodeContents(el)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(r)
    document.addEventListener('selectionchange', updateBar)
    return () => document.removeEventListener('selectionchange', updateBar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!session.done || finished.current) return
    finished.current = true
    const result = inlineResult(session)
    const tab = pendingTab.current
    if (tab) onTab(tab, result)
    else if (result !== null) onCommit(result)
    else onCancel()
  }, [session, onCommit, onCancel, onTab])

  return (
    <>
      {bar && (
        <div role="toolbar" aria-label="Text formatting" onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); e.stopPropagation() }} style={{ position: 'absolute', top: bar.top, left: bar.left, zIndex: 30, display: 'flex', gap: 2, alignItems: 'center', background: '#222', borderRadius: 4, padding: 2 }}>
          {linkDraft === null ? (
            <>
              {formats.includes('bold') && <ToolButton text='B' title='Bold (Ctrl+B)' run={() => format('bold')} />}
              {formats.includes('italic') && <ToolButton text='I' title='Italic (Ctrl+I)' run={() => format('italic')} style={{ fontStyle: 'italic' }} />}
              {formats.includes('link') && <ToolButton text='Link' title='Link (Ctrl+K)' run={() => setLinkDraft('')} />}
              <ToolButton text='Clear' title='Clear formatting' run={() => format('clear')} />
            </>
          ) : (
            <input
              autoFocus
              aria-label="Link URL"
              placeholder="https://"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  format('link', linkDraft.trim() || null, savedRange.current)
                  setLinkDraft(null)
                  ref.current?.focus()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setLinkDraft(null)
                  ref.current?.focus()
                }
              }}
              style={{ font: '13px sans-serif', padding: '2px 4px', width: 180 }}
            />
          )}
        </div>
      )}
      <div
        ref={ref}
        role="textbox"
        aria-multiline={multiline}
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        className="ve-inline-editor"
        onInput={() => dispatch({ type: 'change', value: html() })}
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          const sel = window.getSelection()
          if (!range() || !sel?.rangeCount) return
          const ins = multiline ? text : text.replace(/\r?\n/g, ' ')
          const r = sel.getRangeAt(0)
          r.deleteContents()
          const node = document.createTextNode(ins)
          r.insertNode(node)
          r.setStartAfter(node)
          r.collapse(true)
          sel.removeAllRanges()
          sel.addRange(r)
          dispatch({ type: 'change', value: html() })
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          const mark = shortcutMark(e.nativeEvent)
          if (mark && !formats.includes(mark)) {
            e.preventDefault()
          } else if (mark) {
            e.preventDefault()
            const r = range()
            if (!r || r[0] === r[1]) return
            savedRange.current = r
            if (mark === 'link') setLinkDraft('')
            else format(mark)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            dispatch({ type: 'cancel' })
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (multiline && e.shiftKey) {
              const sel = window.getSelection()
              if (sel?.rangeCount) {
                const r = sel.getRangeAt(0)
                r.deleteContents()
                r.insertNode(document.createElement('br'))
                r.collapse(false)
                dispatch({ type: 'change', value: html() })
              }
            } else dispatch({ type: 'commit' })
          } else if (e.key === 'Tab') {
            e.preventDefault()
            pendingTab.current = e.shiftKey ? 'prev' : 'next'
            dispatch({ type: 'commit' })
          }
        }}
        onBlur={(e) => {
          if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest('[role="toolbar"]')) return
          if (linkDraft !== null) return
          dispatch({ type: 'commit' })
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', minHeight: 32, boxSizing: 'border-box', padding: '4px 8px', border: '2px solid #0066cc', borderRadius: 4, font: 'inherit', color: '#111', textAlign: 'inherit', backgroundColor: '#fff', overflow: 'auto', zIndex: 20 }}
      />
    </>
  )
}
