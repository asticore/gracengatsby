'use client'

import React, { useEffect, useReducer, useRef } from 'react'

import { inlineReducer, inlineResult, startInline } from './inlineEdit'

export type InlineEditorProps = {
  /** Text when editing began. */
  value: string
  /** Quote and rich-text-as-plain elements may span lines; Shift+Enter inserts a line break there. */
  multiline: boolean
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
export const CanvasInlineEditor: React.FC<InlineEditorProps> = ({ value, multiline, label, onCommit, onCancel, onTab }) => {
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
