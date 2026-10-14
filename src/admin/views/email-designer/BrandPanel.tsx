'use client'

import React from 'react'
import { EMAIL_FONT_OPTIONS, type EmailBrand } from '@/features/email/design/brand'
import { ColorField, LongTextField, NumberField, SelectField } from './fieldControls'
import { LogoPicker, type LogoChoice } from './LogoPicker'

type Props = {
  brand: EmailBrand
  logo: LogoChoice | null
  onChange: (brand: EmailBrand) => void
  onLogo: (logo: LogoChoice | null) => void
  onSave: () => void
  saving: boolean
  dirty: boolean
}

const FONTS = EMAIL_FONT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))

/** Brand settings every designed email is wrapped in. */
export function BrandPanel({ brand, logo, onChange, onLogo, onSave, saving, dirty }: Props) {
  const set = <K extends keyof EmailBrand>(key: K, value: EmailBrand[K]) => onChange({ ...brand, [key]: value })
  return (
    <div className="ed-brand">
      <label className="ed-check">
        <input type="checkbox" checked={brand.enabled} onChange={(event) => set('enabled', event.target.checked)} />
        <span>Use this design for emails that have one (emails without a design keep their plain layout)</span>
      </label>
      <LogoPicker logo={logo} onChange={onLogo} />
      <NumberField label="Logo width" value={brand.logoWidth} min={40} max={400} title="Logo width in pixels, 40 to 400" hint="Pixels, 40 to 400." onChange={(value) => set('logoWidth', value)} />
      <ColorField label="Button and link colour" value={brand.accent} hint="A colour code such as #1a5c4f." onChange={(value) => set('accent', value)} />
      <ColorField label="Text colour" value={brand.textColor} onChange={(value) => set('textColor', value)} />
      <ColorField label="Background behind the email" value={brand.background} onChange={(value) => set('background', value)} />
      <ColorField label="Email panel colour" value={brand.contentBackground} onChange={(value) => set('contentBackground', value)} />
      <SelectField label="Font" value={brand.fontStack} options={FONTS} hint="Only fonts that every email app has." onChange={(value) => set('fontStack', value)} />
      <NumberField
        label="Button corner rounding"
        value={brand.buttonRadius}
        min={0}
        max={30}
        title="Corner rounding in pixels, 0 to 30"
        hint="Pixels. 0 gives square corners."
        onChange={(value) => set('buttonRadius', value)}
      />
      <LongTextField label="Footer text" value={brand.footerText} maxLength={500} hint="Shown at the foot of every designed email." onChange={(value) => set('footerText', value)} />
      <LongTextField label="Postal address" value={brand.address} maxLength={300} hint="Useful for marketing email, which needs a real address." onChange={(value) => set('address', value)} />
      <div className="ed-actions">
        <button type="button" className="ed-button" disabled={saving || !dirty} onClick={onSave}>
          {saving ? 'Saving...' : 'Save brand look'}
        </button>
      </div>
    </div>
  )
}
