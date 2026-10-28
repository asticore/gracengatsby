'use client'

import React, { useEffect, useRef } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { SHORTCUT_LIST } from './useEditorShortcuts'
import './saveStatusChip.css'

/**
 * Top-bar button that opens a small list of every keyboard shortcut. The parent owns `open` so the
 * "?" key can open it too. `onTour` replays the first-use coach marks.
 */
export const ShortcutsHelp: React.FC<{
  modLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onTour?: () => void
}> = ({ modLabel, open, onOpenChange, onTour }) => {
  const t = useAdminT()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onOpenChange(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    const close = () => onOpenChange(false)
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [open, onOpenChange])

  return (
    <div className="ve-shortcuts" ref={rootRef}>
      <button
        type="button"
        className="ve-btn ve-btn--ghost"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('ve.shortcuts.title')}
        title={t('ve.shortcuts.buttonTitle')}
        onClick={() => onOpenChange(!open)}
      >
        {t('ve.shortcuts.button')}
      </button>
      {open && (
        <div className="ve-shortcuts__panel" role="dialog" aria-label={t('ve.shortcuts.title')}>
          <div className="ve-shortcuts__head">
            <p className="ve-shortcuts__title">{t('ve.shortcuts.title')}</p>
            {onTour && (
              <button
                type="button"
                className="ve-shortcuts__tour"
                onClick={() => {
                  onOpenChange(false)
                  onTour()
                }}
                title={t('ve.shortcuts.tourTitle')}
              >
                {t('ve.shortcuts.tour')}
              </button>
            )}
          </div>
          <dl className="ve-shortcuts__list">
            {SHORTCUT_LIST.map((item) => (
              <React.Fragment key={item.keys}>
                <dt>{item.keys.replace(/Mod/g, modLabel)}</dt>
                <dd>{t(item.labelKey)}</dd>
              </React.Fragment>
            ))}
          </dl>
          <p className="ve-shortcuts__note">{t('ve.shortcuts.note')}</p>
        </div>
      )}
    </div>
  )
}

export default ShortcutsHelp
