'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings'
import { useState } from 'react'

import { LIMITS, type ButtonStyle, type ShadowLevel, type TextTransform, type ThemeColour } from '@/features/themeStyles/types'

import { ColourRefInput } from './ColourRefInput'
import { addButton, removeButton } from './editorLogic'
import { NumberField, SelectField, TextField, TRANSFORM_OPTIONS, WEIGHT_OPTIONS } from './fields'

type Props = { buttons: ButtonStyle[]; colours: ThemeColour[]; onChange: (buttons: ButtonStyle[]) => void }

const SHADOWS: ReadonlyArray<{ value: ShadowLevel; labelKey: UiStringKey }> = [
  { value: 'none', labelKey: 'bt.lit.none' },
  { value: 'soft', labelKey: 'bt.lit.soft' },
  { value: 'medium', labelKey: 'bt.lit.medium' },
  { value: 'strong', labelKey: 'bt.lit.strong' },
]

function ButtonCard({ button, colours, onSet, onDelete }: { button: ButtonStyle; colours: ThemeColour[]; onSet: (patch: Partial<ButtonStyle>) => void; onDelete?: () => void }) {
  const t = useAdminT()
  const [state, setState] = useState<'normal' | 'hover'>('normal')
  const setHover = (patch: Partial<ButtonStyle['hover']>) => onSet({ hover: { ...button.hover, ...patch } })
  return (
    <section className="ts-item" aria-label={button.name}>
      <div className="ts-item__head">
        <h3 className="ts-item__title">{button.name}</h3>
        {onDelete && <button type="button" className="ts-btn ts-btn--danger" aria-label={`Delete ${button.name}`} onClick={onDelete}>{t('bt.lit.delete')}</button>}
      </div>
      <div className="ts-subtabs" role="tablist" aria-label={`${button.name} state`}>
        {(['normal', 'hover'] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={state === s} className="ts-tab" onClick={() => setState(s)}>{s === 'normal' ? t('bt.lit.normal') : t('bt.lit.hover')}</button>
        ))}
      </div>
      <div className="ts-grid">
        {state === 'normal' ? (
          <>
            <ColourRefInput label={t('bt.lit.background')} value={button.bg} colours={colours} allowTransparent onChange={(bg) => onSet({ bg })} />
            <ColourRefInput label={t('bt.lit.text_colour')} value={button.text} colours={colours} onChange={(text) => onSet({ text })} />
            <ColourRefInput label={t('bt.lit.border_colour')} value={button.borderColour} colours={colours} allowTransparent onChange={(borderColour) => onSet({ borderColour })} />
          </>
        ) : (
          <>
            <ColourRefInput label={t('bt.lit.hover_background')} value={button.hover.bg} colours={colours} allowTransparent onChange={(bg) => setHover({ bg })} />
            <ColourRefInput label={t('bt.lit.hover_text_colour')} value={button.hover.text} colours={colours} onChange={(text) => setHover({ text })} />
            <ColourRefInput label={t('bt.lit.hover_border_colour')} value={button.hover.borderColour} colours={colours} allowTransparent onChange={(borderColour) => setHover({ borderColour })} />
            <div className="ts-field">
              <span className="ts-label">{t('bt.lit.lift_on_hover')}</span>
              <label className="ts-radio">
                <input type="checkbox" checked={button.hover.lift} onChange={(event) => setHover({ lift: event.target.checked })} />
                {t('bt.lit.raise_the_button_slightly')}
              </label>
            </div>
          </>
        )}
      </div>
      <div className="ts-grid">
        <NumberField label={t('bt.lit.border_width_px')} value={button.borderWidth} min={0} max={8} onChange={(borderWidth) => onSet({ borderWidth })} />
        <NumberField label={t('bt.lit.radius_px')} value={button.radius} min={0} max={999} onChange={(radius) => onSet({ radius })} />
        <SelectField<ShadowLevel> label={t('bt.lit.shadow')} value={button.shadow} options={SHADOWS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} onChange={(shadow) => onSet({ shadow })} />
        <NumberField label={t('bt.lit.padding_top_bottom_px')} value={button.paddingY} min={0} max={80} onChange={(paddingY) => onSet({ paddingY })} />
        <NumberField label={t('bt.lit.padding_left_right_px')} value={button.paddingX} min={0} max={80} onChange={(paddingX) => onSet({ paddingX })} />
        <NumberField label={t('bt.lit.font_size_px')} value={button.fontSize} min={10} max={40} onChange={(fontSize) => onSet({ fontSize })} />
        <SelectField label={t('bt.lit.weight')} value={button.weight} options={WEIGHT_OPTIONS} onChange={(weight) => onSet({ weight })} />
        <NumberField label={t('bt.lit.letter_spacing_px')} value={button.letterSpacing} min={-5} max={20} step={0.1} onChange={(letterSpacing) => onSet({ letterSpacing })} />
        <SelectField<TextTransform> label={t('bt.lit.transform')} value={button.transform} options={TRANSFORM_OPTIONS} onChange={(transform) => onSet({ transform })} />
        <NumberField label={t('bt.lit.transition_ms')} value={button.transition} min={0} max={1000} step={10} onChange={(transition) => onSet({ transition })} />
      </div>
    </section>
  )
}

export function ButtonControls({ buttons, colours, onChange }: Props) {
  const t = useAdminT()
  const [newName, setNewName] = useState('')
  const set = (id: string, patch: Partial<ButtonStyle>) => onChange(buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  return (
    <div>
      <div className="ts-list">
        {buttons.map((b) => (
          <ButtonCard key={b.id} button={b} colours={colours} onSet={(patch) => set(b.id, patch)} onDelete={b.system ? undefined : () => onChange(removeButton(buttons, b.id))} />
        ))}
      </div>
      <h3 className="ts-section">{t('bt.lit.add_button_style')}</h3>
      <div className="ts-inline">
        <div style={{ minWidth: 200 }}>
          <TextField label={t('bt.lit.name')} value={newName} maxLength={LIMITS.name} onChange={setNewName} />
        </div>
        <button
          type="button"
          className="ts-btn"
          style={{ alignSelf: 'flex-end' }}
          disabled={buttons.length >= LIMITS.buttons || !newName.trim()}
          onClick={() => { onChange(addButton(buttons, newName)); setNewName('') }}
        >
          {t('bt.lit.add_button_style')}
        </button>
      </div>
    </div>
  )
}