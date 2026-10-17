'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { NodePath } from './treeOps'

export type InlineEditorProps = {
  blockId: string
  elementType: string
  field: string
  value: string
  device: 'desktop' | 'tablet' | 'mobile'
  onSave: (value: string) => void
  onCancel: () => void
}

/**
 * Inline text editor rendered inside the CanvasFrame iframe when double-clicking
 * a text element. Supports simple text editing with blur-to-save and Esc-to-cancel.
 * Tab/Shift+Tab moves to next/prev editable element.
 */
export const CanvasInlineEditor: React.FC<InlineEditorProps> = ({ blockId, elementType, field, value, device, onSave, onCancel }) => {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(value)
  const savedValue = useRef(value)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return

    // Focus and select all text
    input.focus()
    input.select()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const isShift = e.shiftKey
        // Post message to navigate to next/prev editable element
        window.parent.postMessage(
          {
            source: 've-canvas',
            type: 'inlineNavigate',
            blockId,
            direction: isShift ? 'prev' : 'next',
            device,
          },
          window.location.origin
        )
      }
    }

    const handleBlur = () => {
      if (text !== savedValue.current) {
        onSave(text)
        savedValue.current = text
      } else {
        onCancel()
      }
    }

    input.addEventListener('keydown', handleKeyDown)
    input.addEventListener('blur', handleBlur)

    return () => {
      input.removeEventListener('keydown', handleKeyDown)
      input.removeEventListener('blur', handleBlur)
    }
  }, [blockId, device, text, onSave, onCancel])

  return (
    <textarea
      ref={inputRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      className="ve-inline-editor"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        padding: '8px',
        border: '2px solid #0066cc',
        borderRadius: '4px',
        fontSize: 'inherit',
        fontFamily: 'inherit',
        backgroundColor: 'white',
        zIndex: 10000,
      }}
      aria-label={`Edit ${field}`}
    />
  )
}
