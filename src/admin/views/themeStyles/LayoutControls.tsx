'use client'

import { useId } from 'react'

import { LIMITS, type ShadowLevel, type ThemeStyles } from '@/features/themeStyles/types'

import { ColourRefInput } from './ColourRefInput'
import { setGlobal, spaceScalePreview, validateBreakpoints } from './editorLogic'
import { NumberField, SelectField, WEIGHT_OPTIONS } from './fields'

type Props = { styles: ThemeStyles; onChange: (next: ThemeStyles) => void }

const SHADOW_OPTIONS: ReadonlyArray<{ value: ShadowLevel; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'soft', label: 'Soft' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
]

/** Layout and forms tab: forms, links, images, containers, scales, breakpoints and custom CSS. */
export function LayoutControls({ styles, onChange }: Props) {
  const g = styles.globals
  const colours = styles.colours
  const set = (path: string, value: unknown) => onChange(setGlobal(styles, path, value))
  const breakpointError = validateBreakpoints(g.breakpoints)
  const cssId = useId()
  const cssCount = g.customCss.length
  const overLimit = cssCount > LIMITS.customCss

  return (
    <div className="ts-list">
      <section className="ts-item" aria-label="Forms">
        <h3 className="ts-item__title">Forms</h3>
        <div className="ts-grid">
          <ColourRefInput label="Field background" value={g.forms.fieldBg} colours={colours} allowTransparent onChange={(v) => set('forms.fieldBg', v)} />
          <ColourRefInput label="Field text" value={g.forms.fieldText} colours={colours} onChange={(v) => set('forms.fieldText', v)} />
          <ColourRefInput label="Field border" value={g.forms.fieldBorder} colours={colours} onChange={(v) => set('forms.fieldBorder', v)} />
          <ColourRefInput label="Focus border" value={g.forms.focusBorder} colours={colours} onChange={(v) => set('forms.focusBorder', v)} />
          <ColourRefInput label="Label colour" value={g.forms.labelColour} colours={colours} onChange={(v) => set('forms.labelColour', v)} />
          <ColourRefInput label="Placeholder colour" value={g.forms.placeholderColour} colours={colours} onChange={(v) => set('forms.placeholderColour', v)} />
          <ColourRefInput label="Error colour" value={g.forms.errorColour} colours={colours} onChange={(v) => set('forms.errorColour', v)} />
          <NumberField label="Border width (px)" value={g.forms.fieldBorderWidth} min={0} max={6} onChange={(v) => set('forms.fieldBorderWidth', v)} />
          <NumberField label="Corner radius (px)" value={g.forms.fieldRadius} min={0} max={40} onChange={(v) => set('forms.fieldRadius', v)} />
          <NumberField label="Padding top/bottom (px)" value={g.forms.fieldPaddingY} min={4} max={30} onChange={(v) => set('forms.fieldPaddingY', v)} />
          <NumberField label="Padding left/right (px)" value={g.forms.fieldPaddingX} min={4} max={30} onChange={(v) => set('forms.fieldPaddingX', v)} />
          <NumberField label="Field font size (px)" value={g.forms.fieldFontSize} min={12} max={24} onChange={(v) => set('forms.fieldFontSize', v)} />
          <NumberField label="Label size (px)" value={g.forms.labelSize} min={11} max={20} onChange={(v) => set('forms.labelSize', v)} />
          <SelectField<number> label="Label weight" value={g.forms.labelWeight} options={WEIGHT_OPTIONS} onChange={(v) => set('forms.labelWeight', v)} />
        </div>
      </section>

      <section className="ts-item" aria-label="Links">
        <h3 className="ts-item__title">Links</h3>
        <div className="ts-grid">
          <ColourRefInput label="Hover colour" value={g.links.hoverColour} colours={colours} onChange={(v) => set('links.hoverColour', v)} />
          <SelectField<'always' | 'hover' | 'never'>
            label="Underline"
            value={g.links.underline}
            options={[{ value: 'always', label: 'Always' }, { value: 'hover', label: 'On hover' }, { value: 'never', label: 'Never' }]}
            onChange={(v) => set('links.underline', v)}
          />
        </div>
      </section>

      <section className="ts-item" aria-label="Images">
        <h3 className="ts-item__title">Images</h3>
        <div className="ts-grid">
          <NumberField label="Corner radius (px)" value={g.images.radius} min={0} max={999} onChange={(v) => set('images.radius', v)} />
          <SelectField<ShadowLevel> label="Shadow" value={g.images.shadow} options={SHADOW_OPTIONS} onChange={(v) => set('images.shadow', v)} />
          <NumberField label="Border width (px)" value={g.images.borderWidth} min={0} max={8} onChange={(v) => set('images.borderWidth', v)} />
          <ColourRefInput label="Border colour" value={g.images.borderColour} colours={colours} onChange={(v) => set('images.borderColour', v)} />
        </div>
      </section>

      <section className="ts-item" aria-label="Containers">
        <h3 className="ts-item__title">Containers</h3>
        <div className="ts-grid">
          <NumberField label="Maximum width (px)" value={g.containers.maxWidth} min={640} max={1920} step={10} onChange={(v) => set('containers.maxWidth', v)} />
        </div>
        <h4 className="ts-section">Gap between blocks (px)</h4>
        <div className="ts-grid">
          <NumberField label="Desktop" value={g.containers.gapDesktop} min={0} max={120} onChange={(v) => set('containers.gapDesktop', v)} />
          <NumberField label="Tablet" value={g.containers.gapTablet} min={0} max={120} onChange={(v) => set('containers.gapTablet', v)} />
          <NumberField label="Mobile" value={g.containers.gapMobile} min={0} max={120} onChange={(v) => set('containers.gapMobile', v)} />
        </div>
        <h4 className="ts-section">Section padding, top and bottom (px)</h4>
        <div className="ts-grid">
          <NumberField label="Desktop" value={g.containers.sectionPaddingDesktop} min={0} max={240} onChange={(v) => set('containers.sectionPaddingDesktop', v)} />
          <NumberField label="Tablet" value={g.containers.sectionPaddingTablet} min={0} max={240} onChange={(v) => set('containers.sectionPaddingTablet', v)} />
          <NumberField label="Mobile" value={g.containers.sectionPaddingMobile} min={0} max={240} onChange={(v) => set('containers.sectionPaddingMobile', v)} />
        </div>
      </section>

      <section className="ts-item" aria-label="Scales">
        <h3 className="ts-item__title">Scales</h3>
        <div className="ts-grid">
          <NumberField label="Small radius (px)" value={g.scales.radiusSm} min={0} max={999} onChange={(v) => set('scales.radiusSm', v)} />
          <NumberField label="Medium radius (px)" value={g.scales.radiusMd} min={0} max={999} onChange={(v) => set('scales.radiusMd', v)} />
          <NumberField label="Large radius (px)" value={g.scales.radiusLg} min={0} max={999} onChange={(v) => set('scales.radiusLg', v)} />
          <NumberField label="Spacing base (px)" value={g.scales.spaceBase} min={2} max={16} onChange={(v) => set('scales.spaceBase', v)} help="Spacing steps are this value times 1, 2, 3, 4, 6, 8, 12 and 16." />
        </div>
        <h4 className="ts-section">Resulting spacing scale</h4>
        <ul className="ts-scale" aria-label="Resulting spacing values">
          {spaceScalePreview(g.scales.spaceBase).map((step) => (
            <li key={step.name}><code>{step.name}</code> <span>{step.px}px</span></li>
          ))}
        </ul>
      </section>

      <section className="ts-item" aria-label="Breakpoints">
        <h3 className="ts-item__title">Breakpoints</h3>
        <div className="ts-grid">
          <NumberField label="Tablet, up to (px)" value={g.breakpoints.tablet} min={600} max={1280} onChange={(v) => set('breakpoints.tablet', v)} />
          <NumberField label="Mobile, up to (px)" value={g.breakpoints.mobile} min={320} max={900} onChange={(v) => set('breakpoints.mobile', v)} />
        </div>
        {breakpointError ? <p role="alert" className="ts-notice ts-notice--error">{breakpointError}</p> : <p className="ts-help">Screens up to the tablet width use tablet rules; up to the mobile width use mobile rules.</p>}
      </section>

      <section className="ts-item" aria-label="Custom CSS">
        <h3 className="ts-item__title">Custom CSS</h3>
        <div className="ts-field">
          <label htmlFor={cssId} className="ts-label">Custom CSS</label>
          <textarea
            id={cssId}
            className="ts-input ts-input--mono ts-textarea"
            rows={10}
            spellCheck={false}
            value={g.customCss}
            onChange={(event) => set('customCss', event.target.value)}
          />
          <p className={`ts-help${overLimit ? ' ts-help--over' : ''}`} aria-live="polite">{cssCount.toLocaleString('en-GB')} / {LIMITS.customCss.toLocaleString('en-GB')} characters{overLimit ? ' (too long, the extra is cut off when saved)' : ''}</p>
          <p className="ts-help">Added last; applies to the whole public site; script tags are removed.</p>
        </div>
      </section>
    </div>
  )
}
