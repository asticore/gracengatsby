'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
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
  const tt = useAdminT()
  const [newName, setNewName] = useState('')
  const set = (id: string, patch: Partial<TypeStyle>) => onChange(typography.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const fontOptions = [
    { value: '', label: tt('ty.lit.inherit') },
    { value: 'heading', label: tt('ty.lit.heading_font') },
    { value: 'body', label: tt('ty.lit.body_font') },
    ...fonts.map((f) => ({ value: f.id, label: f.label })),
  ]

  return (
    <div>
      <p className="ts-help">{tt('ty.lit.text_styles_apply_across_the_whole_site')}</p>
      <div className="ts-list" style={{ marginTop: 8 }}>
        {typography.map((t) => (
          <section key={t.id} className="ts-item" aria-label={t.name}>
            <div className="ts-item__head">
              <h3 className="ts-item__title">{t.name}</h3>
              {!t.system && <button type="button" className="ts-btn ts-btn--danger" aria-label={`Delete ${t.name}`} onClick={() => onChange(removeTypeStyle(typography, t.id))}>{tt('ty.lit.delete')}</button>}
            </div>
            <div className="ts-grid">
              {!t.system && <TextField label={tt('ty.lit.name')} value={t.name} maxLength={LIMITS.name} onChange={(name) => set(t.id, { name })} />}
              <SelectField label={tt('ty.lit.font')} value={t.fontFamily} options={fontOptions} onChange={(fontFamily) => set(t.id, { fontFamily })} />
              <NumberField label={tt('ty.lit.size_px')} value={t.size} min={8} max={120} onChange={(size) => set(t.id, { size })} />
              <NumberField label={tt('ty.lit.tablet_size_px')} value={t.sizeTablet} min={0} max={120} onChange={(sizeTablet) => set(t.id, { sizeTablet })} />
              <NumberField label={tt('ty.lit.mobile_size_px')} value={t.sizeMobile} min={0} max={120} onChange={(sizeMobile) => set(t.id, { sizeMobile })} />
              <SelectField label={tt('ty.lit.weight')} value={t.weight} options={WEIGHT_OPTIONS} onChange={(weight) => set(t.id, { weight })} />
              <NumberField label={tt('ty.lit.line_height')} value={t.lineHeight} min={0.8} max={3} step={0.05} onChange={(lineHeight) => set(t.id, { lineHeight })} />
              <NumberField label={tt('ty.lit.letter_spacing_px')} value={t.letterSpacing} min={-5} max={20} step={0.1} onChange={(letterSpacing) => set(t.id, { letterSpacing })} />
              <SelectField<TextTransform> label={tt('ty.lit.transform')} value={t.transform} options={TRANSFORM_OPTIONS} onChange={(transform) => set(t.id, { transform })} />
              <ColourRefInput label={tt('ty.lit.colour')} value={t.colour} colours={colours} allowEmpty emptyLabel={tt('ty.lit.inherit')} onChange={(colour) => set(t.id, { colour })} />
            </div>
          </section>
        ))}
      </div>
      <h3 className="ts-section">{tt('ty.lit.add_a_text_style')}</h3>
      <div className="ts-inline">
        <div style={{ minWidth: 200 }}>
          <TextField label={tt('ty.lit.name')} value={newName} maxLength={LIMITS.name} onChange={setNewName} />
        </div>
        <button
          type="button"
          className="ts-btn"
          style={{ alignSelf: 'flex-end' }}
          disabled={typography.length >= LIMITS.typography}
          onClick={() => { onChange(addTypeStyle(typography, newName)); setNewName('') }}
        >
          {tt('ty.lit.add_text_style')}
        </button>
      </div>
    </div>
  )
}