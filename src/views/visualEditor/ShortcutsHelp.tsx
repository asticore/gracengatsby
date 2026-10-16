'use client'

import React, { useEffect, useRef, useState } from 'react'

import { SHORTCUT_LIST } from './useEditorShortcuts'

/** Top-bar button that opens a small list of every keyboard shortcut. */
export const ShortcutsHelp: React.FC<{ modLabel: string }> = ({ modLabel }) => {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [open])

  return (
    <div className="ve-shortcuts" ref={rootRef}>
      <button
        type="button"
        className="ve-btn ve-btn--ghost"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
        onClick={() => setOpen((o) => !o)}
      >
        Shortcuts
      </button>
      {open && (
        <div className="ve-shortcuts__panel" role="dialog" aria-label="Keyboard shortcuts">
          <p className="ve-shortcuts__title">Keyboard shortcuts</p>
          <dl className="ve-shortcuts__list">
            {SHORTCUT_LIST.map((item) => (
              <React.Fragment key={item.keys}>
                <dt>{item.keys.replace(/Mod/g, modLabel)}</dt>
                <dd>{item.label}</dd>
              </React.Fragment>
            ))}
          </dl>
          <p className="ve-shortcuts__note">Shortcuts are off while you type in a field.</p>
        </div>
      )}
    </div>
  )
}

export default ShortcutsHelp
