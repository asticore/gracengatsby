import React from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

/**
 * The strip across the top of the canvas while a translation is being edited.
 * It says that the structure is locked, and gives the one way back out.
 */
export function TranslateBanner({ languageLabel, onExit }: { languageLabel: string; onExit: () => void }): React.ReactElement {
  const t = useAdminT()
  return (
    <div className="ve-translate-banner" role="status" data-testid="visual-editor-translate-banner">
      <span className="ve-translate-banner__text">
        {t('builder.translate.banner', { language: languageLabel })}
      </span>
      <button type="button" className="ve-btn ve-btn--ghost ve-translate-banner__exit" onClick={onExit}>
        {t('builder.translate.exit')}
      </button>
    </div>
  )
}

export const TRANSLATE_BANNER_CSS = `
.ve-translate-banner { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 12px; font-size: 13px; background: var(--theme-elevation-100, #f4f4f5); border-bottom: 2px solid var(--theme-success-500, #16a34a); }
.ve-translate-banner__exit { white-space: nowrap; }
.ve-canvas-wrap--translating .ve-canvas { opacity: 1; }
.ve-canvas-wrap--translating .ve-node { cursor: pointer; }
.ve-node[data-ve-tr="needs_review"] { outline: 2px dotted #ea580c; outline-offset: -2px; }
.ve-node[data-ve-tr="machine_draft"] { outline: 2px dashed #7c3aed; outline-offset: -2px; }
.ve-node[data-ve-tr="approved"] { outline: 2px solid #16a34a; outline-offset: -2px; }
.ve-node[data-ve-tr="untranslated"] { outline: 1px dashed #a1a1aa; outline-offset: -1px; }
.ve-node[data-ve-tr="untranslated"]::after { content: attr(data-ve-tr-label); position: absolute; top: 4px; right: 4px; z-index: 5; font-size: 11px; padding: 1px 6px; border-radius: 999px; background: #e4e4e7; color: #3f3f46; pointer-events: none; }
.ve-node[data-ve-tr-hint]::before { content: attr(data-ve-tr-hint); position: absolute; top: 4px; left: 4px; z-index: 5; font-size: 11px; padding: 1px 6px; border-radius: 6px; background: #1f2937; color: #fff; pointer-events: none; }
.ve-node--translate-focus { box-shadow: 0 0 0 3px #2563eb; }
`
