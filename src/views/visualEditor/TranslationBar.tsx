import React from 'react'

/**
 * The language dropdown and the per-language progress chips in the builder's
 * top bar. A chip switches the canvas to that language (it is not a link). Shown only when multilingual is on with more than one active
 * language, so a single-language site sees exactly the bar it always had.
 */

export type TranslationBarLocale = { code: string; label: string }
export type TranslationBarProgress = { code: string; label: string; approved: number; total: number; href?: string }

export function TranslationBar({
  defaultLocale,
  defaultLabel,
  targets,
  selected,
  progress,
  onSelect,
}: {
  defaultLocale: string
  defaultLabel: string
  targets: TranslationBarLocale[]
  /** The language being edited: the default locale, or one of the targets. */
  selected: string
  progress: TranslationBarProgress[]
  onSelect: (code: string) => void
}): React.ReactElement {
  return (
    <div className="ve-translation-bar" role="group" aria-label="Language">
      <label className="ve-translation-bar__label">
        <span className="ve-translation-bar__sr">Editing language</span>
        <select
          className="ve-translation-bar__select"
          value={selected}
          onChange={(event) => onSelect(event.target.value)}
          data-testid="visual-editor-language"
        >
          <option value={defaultLocale}>{defaultLabel} (default)</option>
          {targets.map((locale) => (
            <option key={locale.code} value={locale.code}>
              {locale.label}
            </option>
          ))}
        </select>
      </label>
      {progress.map((chip) => (
        <button
          key={chip.code}
          type="button"
          className={`ve-translation-bar__chip${chip.code === selected ? ' ve-translation-bar__chip--active' : ''}`}
          aria-pressed={chip.code === selected}
          title={`Translate into ${chip.label} (${chip.approved} of ${chip.total} approved)`}
          onClick={() => onSelect(chip.code)}
          data-locale={chip.code}
          data-approved={chip.approved}
          data-total={chip.total}
        >
          {chip.code.split('-')[0].toUpperCase()} {chip.approved}/{chip.total} approved
        </button>
      ))}
    </div>
  )
}

export const TRANSLATION_BAR_CSS = `
.ve-translation-bar { display: inline-flex; align-items: center; gap: 6px; margin-right: 8px; }
.ve-translation-bar__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.ve-translation-bar__select { font: inherit; font-size: 13px; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--theme-elevation-200, #d4d4d8); background: var(--theme-bg, #fff); color: inherit; }
.ve-translation-bar__chip { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--theme-elevation-200, #d4d4d8); color: inherit; text-decoration: none; white-space: nowrap; }
.ve-translation-bar__chip { background: transparent; cursor: pointer; font: inherit; }
.ve-translation-bar__chip:hover { border-color: var(--theme-success-500, #16a34a); }
.ve-translation-bar__chip--active { border-color: var(--theme-success-500, #16a34a); background: var(--theme-elevation-100, #f4f4f5); font-weight: 600; }
`
