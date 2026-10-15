'use client'

import { useState } from 'react'

import { LIMITS, type ButtonStyle, type ShadowLevel, type TextTransform, type ThemeColour } from '@/features/themeStyles/types'

import { ColourRefInput } from './ColourRefInput'
import { addButton, removeButton } from './editorLogic'
import { NumberField, SelectField, TextField, TRANSFORM_OPTIONS, WEIGHT_OPTIONS } from './fields'

type Props = { buttons: ButtonStyle[]; colours: ThemeColour[]; onChange: (buttons: ButtonStyle[]) => void }

const SHADOWS: ReadonlyArray<{ value: ShadowLevel; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'soft', label: 'Soft' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
]

function ButtonCard({ button, colours, onSet, onDelete }: { button: ButtonStyle; colours: ThemeColour[]; onSet: (patch: Partial<ButtonStyle>) => void; onDelete?: () => void }) {
  const [state, setState] = useState<'normal' | 'hover'>('normal')
  const setHover = (patch: Partial<ButtonStyle['hover']>) => onSet({ hover: { ...button.hover, ...patch } })
  return (
    <section className="ts-item" aria-label={button.name}>
      <div className="ts-item__head">
        <h3 className="ts-item__title">{button.name}</h3>
        {onDelete && <button type="button" className="ts-btn ts-btn--danger" aria-label={`Delete ${button.name}`} onClick={onDelete}>Delete</button>}
      </div>
      <div className="ts-subtabs" role="tablist" aria-label={`${button.name} state`}>
        {(['normal', 'hover'] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={state === s} className="ts-tab" onClick={() => setState(s)}>{s === 'normal' ? 'Normal' : 'Hover'}</button>
        ))}
      </div>
      <div className="ts-grid">
        {state === 'normal' ? (
          <>
            <ColourRefInput label="Background" value={button.bg} colours={colours} allowTransparent onChange={(bg) => onSet({ bg })} />
            <ColourRefInput label="Text colour" value={button.text} colours={colours} onChange={(text) => onSet({ text })} />
            <ColourRefInput label="Border colour" value={button.borderColour} colours={colours} allowTransparent onChange={(borderColour) => onSet({ borderColour })} />
          </>
        ) : (
          <>
            <ColourRefInput label="Hover background" value={button.hover.bg} colours={colours} allowTransparent onChange={(bg) => setHover({ bg })} />
            <ColourRefInput label="Hover text colour" value={button.hover.text} colours={colours} onChange={(text) => setHover({ text })} />
            <ColourRefInput label="Hover border colour" value={button.hover.borderColour} colours={colours} allowTransparent onChange={(borderColour) => setHover({ borderColour })} />
            <div className="ts-field">
              <span className="ts-label">Lift on hover</span>
              <label className="ts-radio">
                <input type="checkbox" checked={button.hover.lift} onChange={(event) => setHover({ lift: event.target.checked })} />
                Raise the button slightly
              </label>
            </div>
          </>
        )}
      </div>
      <div className="ts-grid">
        <NumberField label="Border width (px)" value={button.borderWidth} min={0} max={8} onChange={(borderWidth) => onSet({ borderWidth })} />
        <NumberField label="Radius (px)" value={button.radius} min={0} max={999} onChange={(radius) => onSet({ radius })} />
        <SelectField<ShadowLevel> label="Shadow" value={button.shadow} options={SHADOWS} onChange={(shadow) => onSet({ shadow })} />
        <NumberField label="Padding top/bottom (px)" value={button.paddingY} min={0} max={80} onChange={(paddingY) => onSet({ paddingY })} />
        <NumberField label="Padding left/right (px)" value={button.paddingX} min={0} max={80} onChange={(paddingX) => onSet({ paddingX })} />
        <NumberField label="Font size (px)" value={button.fontSize} min={10} max={40} onChange={(fontSize) => onSet({ fontSize })} />
        <SelectField label="Weight" value={button.weight} options={WEIGHT_OPTIONS} onChange={(weight) => onSet({ weight })} />
        <NumberField label="Letter spacing (px)" value={button.letterSpacing} min={-5} max={20} step={0.1} onChange={(letterSpacing) => onSet({ letterSpacing })} />
        <SelectField<TextTransform> label="Transform" value={button.transform} options={TRANSFORM_OPTIONS} onChange={(transform) => onSet({ transform })} />
        <NumberField label="Transition (ms)" value={button.transition} min={0} max={1000} step={10} onChange={(transition) => onSet({ transition })} />
      </div>
    </section>
  )
}

export function ButtonControls({ buttons, colours, onChange }: Props) {
  const [newName, setNewName] = useState('')
  const set = (id: string, patch: Partial<ButtonStyle>) => onChange(buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  return (
    <div>
      <div className="ts-list">
        {buttons.map((b) => (
          <ButtonCard key={b.id} button={b} colours={colours} onSet={(patch) => set(b.id, patch)} onDelete={b.system ? undefined : () => onChange(removeButton(buttons, b.id))} />
        ))}
      </div>
      <h3 className="ts-section">Add button style</h3>
      <div className="ts-inline">
        <div style={{ minWidth: 200 }}>
          <TextField label="Name" value={newName} maxLength={LIMITS.name} onChange={setNewName} />
        </div>
        <button
          type="button"
          className="ts-btn"
          style={{ alignSelf: 'flex-end' }}
          disabled={buttons.length >= LIMITS.buttons || !newName.trim()}
          onClick={() => { onChange(addButton(buttons, newName)); setNewName('') }}
        >
          Add button style
        </button>
      </div>
    </div>
  )
}