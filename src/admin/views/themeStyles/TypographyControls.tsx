'use client'

import { useState } from 'react'

import { LIMITS, type ThemeColour, type TypeStyle, type TextTransform } from '@/features/themeStyles/types'

import { ColourRefInput } from './ColourRefInput'
import { addTypeStyle, removeTypeStyle } from './editorLogic'
import { NumberField, SelectField, TextField, TRANSFORM_OPTIONS, WEIGHT_OPTIONS } from './fields'

export type InstalledFontOption = { id: string; label: string }

type Props = {
  typography: TypeStyle[]
  colours: ThemeColour[]
  fonts: InstalledFontOption[]
  onChange: (typography: TypeStyle[]) => void
}

export function TypographyControls({ typography, colours, fonts, onChange }: Props) {
  const [newName, setNewName] = useState('')
  const set = (id: string, patch: Partial<TypeStyle>) => onChange(typography.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const fontOptions = [
    { value: '', label: 'Inherit' },
    { value: 'heading', label: 'Heading font' },
    { value: 'body', label: 'Body font' },
    ...fonts.map((f) => ({ value: f.id, label: f.label })),
  ]

  return (
    <div>
      <p className="ts-help">Text styles apply across the whole site. Tablet and mobile sizes of 0 use the main size.</p>
      <div className="ts-list" style={{ marginTop: 8 }}>
        {typography.map((t) => (
          <section key={t.id} className="ts-item" aria-label={t.name}>
            <div className="ts-item__head">
              <h3 className="ts-item__title">{t.name}</h3>
              {!t.system && <button type="button" className="ts-btn ts-btn--danger" aria-label={`Delete ${t.name}`} onClick={() => onChange(removeTypeStyle(typography, t.id))}>Delete</button>}
            </div>
            <div className="ts-grid">
              {!t.system && <TextField label="Name" value={t.name} maxLength={LIMITS.name} onChange={(name) => set(t.id, { name })} />}
              <SelectField label="Font" value={t.fontFamily} options={fontOptions} onChange={(fontFamily) => set(t.id, { fontFamily })} />
              <NumberField label="Size (px)" value={t.size} min={8} max={120} onChange={(size) => set(t.id, { size })} />
              <NumberField label="Tablet size (px)" value={t.sizeTablet} min={0} max={120} onChange={(sizeTablet) => set(t.id, { sizeTablet })} />
              <NumberField label="Mobile size (px)" value={t.sizeMobile} min={0} max={120} onChange={(sizeMobile) => set(t.id, { sizeMobile })} />
              <SelectField label="Weight" value={t.weight} options={WEIGHT_OPTIONS} onChange={(weight) => set(t.id, { weight })} />
              <NumberField label="Line height" value={t.lineHeight} min={0.8} max={3} step={0.05} onChange={(lineHeight) => set(t.id, { lineHeight })} />
              <NumberField label="Letter spacing (px)" value={t.letterSpacing} min={-5} max={20} step={0.1} onChange={(letterSpacing) => set(t.id, { letterSpacing })} />
              <SelectField<TextTransform> label="Transform" value={t.transform} options={TRANSFORM_OPTIONS} onChange={(transform) => set(t.id, { transform })} />
              <ColourRefInput label="Colour" value={t.colour} colours={colours} allowEmpty emptyLabel="Inherit" onChange={(colour) => set(t.id, { colour })} />
            </div>
          </section>
        ))}
      </div>
      <h3 className="ts-section">Add a text style</h3>
      <div className="ts-inline">
        <div style={{ minWidth: 200 }}>
          <TextField label="Name" value={newName} maxLength={LIMITS.name} onChange={setNewName} />
        </div>
        <button
          type="button"
          className="ts-btn"
          style={{ alignSelf: 'flex-end' }}
          disabled={typography.length >= LIMITS.typography}
          onClick={() => { onChange(addTypeStyle(typography, newName)); setNewName('') }}
        >
          Add text style
        </button>
      </div>
    </div>
  )
}