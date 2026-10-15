'use client'

import { useState } from 'react'

import { STARTER_PRESETS } from '@/features/themeStyles/presets'
import { LIMITS, type ThemePreset, type ThemeStyles } from '@/features/themeStyles/types'

import { addPreset, applyPresetData, deletePreset, renamePreset, resolveColour, uniqueSlug } from './editorLogic'
import { TextField } from './fields'

type Props = { styles: ThemeStyles; onChange: (next: ThemeStyles) => void; onNotice: (text: string) => void }

const STRIP_IDS = ['primary', 'secondary', 'accent', 'background', 'surface', 'text'] as const

function ColourStrip({ preset }: { preset: ThemePreset }) {
  return (
    <div className="ts-strip" role="img" aria-label={`Colours in ${preset.name}`}>
      {STRIP_IDS.map((id) => (
        <span key={id} style={{ background: resolveColour(`@${id}`, preset.data.colours) || 'transparent' }} />
      ))}
    </div>
  )
}

/** Presets tab: starter presets plus the admin's saved snapshots. Applying only changes the editor until Save. */
export function PresetControls({ styles, onChange, onNotice }: Props) {
  const [name, setName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const saved = styles.presets ?? []
  const atLimit = saved.length >= LIMITS.presets
  const nextId = name.trim() ? uniqueSlug(name, saved.map((p) => p.id)) : ''

  const apply = (preset: ThemePreset) => {
    if (!window.confirm(`Apply "${preset.name}"? This replaces your current colours, text, buttons, tables, layout and forms. It is not saved until you choose Save changes.`)) return
    onChange(applyPresetData(styles, preset.data))
    onNotice(`"${preset.name}" applied to the editor. Review it, then choose Save changes.`)
  }

  return (
    <div className="ts-list">
      <section aria-label="Starter presets">
        <h3 className="ts-section">Starter presets</h3>
        <div className="ts-cards">
          {STARTER_PRESETS.map((preset) => (
            <div key={preset.id} className="ts-item">
              <h4 className="ts-item__title">{preset.name}</h4>
              <ColourStrip preset={preset} />
              <div><button type="button" className="ts-btn" aria-label={`Apply ${preset.name}`} onClick={() => apply(preset)}>Apply</button></div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Saved presets">
        <h3 className="ts-section">Saved presets</h3>
        <div className="ts-inline">
          <div style={{ minWidth: 220 }}>
            <TextField label="Preset name" value={name} maxLength={LIMITS.name} onChange={setName} />
          </div>
          <button
            type="button"
            className="ts-btn"
            style={{ alignSelf: 'flex-end' }}
            disabled={atLimit || !name.trim()}
            onClick={() => { onChange(addPreset(styles, name)); setName('') }}
          >
            Save current design as preset
          </button>
        </div>
        <p className="ts-help">{name.trim() ? `Id: ${nextId}. ` : ''}{saved.length} of {LIMITS.presets} saved.{atLimit ? ' Delete one to save another.' : ''} Presets are stored when you choose Save changes.</p>
        {saved.length === 0 ? (
          <p className="ts-help">No saved presets yet.</p>
        ) : (
          <div className="ts-cards">
            {saved.map((preset) => (
              <div key={preset.id} className="ts-item">
                {renamingId === preset.id ? (
                  <div className="ts-inline">
                    <div style={{ minWidth: 160 }}><TextField label="New name" value={draft} maxLength={LIMITS.name} onChange={setDraft} /></div>
                    <button type="button" className="ts-btn" style={{ alignSelf: 'flex-end' }} disabled={!draft.trim()} onClick={() => { onChange(renamePreset(styles, preset.id, draft)); setRenamingId(null) }}>Save name</button>
                    <button type="button" className="ts-btn" style={{ alignSelf: 'flex-end' }} onClick={() => setRenamingId(null)}>Cancel</button>
                  </div>
                ) : (
                  <h4 className="ts-item__title">{preset.name}</h4>
                )}
                <ColourStrip preset={preset} />
                <div className="ts-inline">
                  <button type="button" className="ts-btn" aria-label={`Apply ${preset.name}`} onClick={() => apply(preset)}>Apply</button>
                  <button type="button" className="ts-btn" aria-label={`Rename ${preset.name}`} onClick={() => { setRenamingId(preset.id); setDraft(preset.name) }}>Rename</button>
                  <button
                    type="button"
                    className="ts-btn ts-btn--danger"
                    aria-label={`Delete ${preset.name}`}
                    onClick={() => { if (window.confirm(`Delete the preset "${preset.name}"?`)) onChange(deletePreset(styles, preset.id)) }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
