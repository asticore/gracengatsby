'use client'

import React, { useState } from 'react'

import { serializeStyle } from './editorClipboard'
import { addPreset, applyPresetDesign, loadPresets, removePreset, savePresets, type StylePreset } from './stylePresets'
import './navLibraryPresets.css'

/** Save the current block style under a name, then apply or delete saved presets. Apply is one onChange (one undo step). */
export const StylePresets: React.FC<{
  value: object
  onChange: (next: never) => void
  device: 'desktop' | 'tablet' | 'mobile'
}> = ({ value, onChange, device }) => {
  const [presets, setPresets] = useState<StylePreset[]>(() => loadPresets())
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)

  const save = () => {
    const ser = serializeStyle(value, device)
    if (!ser || !name.trim()) return
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const next = addPreset(presets, name, ser.text, id)
    setPresets(next)
    savePresets(next)
    setName('')
  }
  const apply = (p: StylePreset) => {
    const next = applyPresetDesign(value as Record<string, unknown>, p.text, device)
    if (next) (onChange as (v: Record<string, unknown>) => void)(next)
  }
  const del = (id: string) => {
    const next = removePreset(presets, id)
    setPresets(next)
    savePresets(next)
  }

  return (
    <div className="ve-presets">
      <button type="button" className="ve-presets__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Style presets{presets.length ? ` (${presets.length})` : ''}
      </button>
      {open && (
        <div className="ve-presets__body">
          <div className="ve-presets__save">
            <input
              className="ve-presets__input"
              aria-label="Preset name"
              placeholder="Preset name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
            />
            <button type="button" className="ve-presets__btn" disabled={!name.trim()} onClick={save}>
              Save style as preset
            </button>
          </div>
          {presets.length === 0 ? (
            <p className="ve-presets__empty">No saved presets yet.</p>
          ) : (
            <ul className="ve-presets__list">
              {presets.map((p) => (
                <li key={p.id} className="ve-presets__item">
                  <span className="ve-presets__name" title={p.name}>{p.name}</span>
                  <button type="button" className="ve-presets__btn" onClick={() => apply(p)} aria-label={`Apply preset ${p.name}`}>Apply</button>
                  <button type="button" className="ve-presets__btn" onClick={() => del(p.id)} aria-label={`Delete preset ${p.name}`}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
