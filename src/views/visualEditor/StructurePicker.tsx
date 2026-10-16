'use client'

import React, { useEffect, useRef } from 'react'

import { STRUCTURES, structureRects, type Structure } from './columnOps'

/** Small SVG of a structure: one rounded rectangle per column. */
export const StructureIcon: React.FC<{ widths: number[] }> = ({ widths }) => (
  <svg viewBox="0 0 60 36" width="60" height="36" aria-hidden="true" focusable="false" className="ve-structure__icon">
    {structureRects(widths).map((r, i) => (
      <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx="3" fill="currentColor" />
    ))}
  </svg>
)

/**
 * Elementor's "Select your structure" step: shown when a new section (or an inner section) is
 * added, so the columns start out the way you want instead of always two halves.
 */
export const StructurePicker: React.FC<{
  /** True when the section is going inside a column (an inner section). */
  inner?: boolean
  onPick: (structure: Structure) => void
  onCancel: () => void
}> = ({ inner, onPick, onCancel }) => {
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return (
    <div className="ve-structure__backdrop" role="presentation" onClick={onCancel}>
      <div
        className="ve-structure"
        role="dialog"
        aria-modal="true"
        aria-label="Select your structure"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="ve-structure__title">Select your structure</h3>
        <p className="ve-structure__help">
          {inner
            ? 'Choose how many columns the inner section has. You can change widths later.'
            : 'Choose how many columns the new section has. You can change widths later.'}
        </p>
        <div className="ve-structure__grid">
          {STRUCTURES.map((structure, i) => (
            <button
              key={structure.id}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              className="ve-structure__option"
              onClick={() => onPick(structure)}
              title={structure.label}
              aria-label={structure.label}
            >
              <StructureIcon widths={structure.widths} />
              <span className="ve-structure__label">{structure.label}</span>
            </button>
          ))}
        </div>
        <div className="ve-structure__footer">
          <button type="button" className="ve-btn ve-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
