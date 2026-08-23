'use client'

import React, { useState } from 'react'

import { DIVIDER_OPTIONS, type BlockStyle, type DividerShape } from '@/lib/blockStyle'

import { MediaPicker } from './MediaPicker'

/**
 * The "Design" tab of the visual editor's right-hand panel.
 *
 * Edits the same BlockStyle object the live site renders from
 * (src/lib/blockStyle.ts), so anything set here previews accurately on the
 * canvas and ships identically.
 */
export const DesignPanel: React.FC<{
  value: BlockStyle
  onChange: (next: BlockStyle) => void
}> = ({ value, onChange }) => {
  const set = <K extends keyof BlockStyle>(key: K, next: BlockStyle[K]) => {
    const updated = { ...value }
    if (next === undefined || next === '' || next === null) {
      delete updated[key]
    } else {
      updated[key] = next
    }
    onChange(updated)
  }

  return (
    <div className="ve-design">
      <Accordion title="Background" defaultOpen>
        <SelectRow
          label="Type"
          value={value.bgType || 'none'}
          options={[
            { label: 'None', value: 'none' },
            { label: 'Solid colour', value: 'color' },
            { label: 'Gradient', value: 'gradient' },
            { label: 'Image', value: 'image' },
          ]}
          onChange={(v) => set('bgType', v === 'none' ? undefined : (v as BlockStyle['bgType']))}
        />

        {value.bgType === 'color' && (
          <ColorRow label="Colour" value={value.bgColor} onChange={(v) => set('bgColor', v)} />
        )}

        {value.bgType === 'gradient' && (
          <>
            <ColorRow label="From" value={value.bgGradientFrom} onChange={(v) => set('bgGradientFrom', v)} />
            <ColorRow label="To" value={value.bgGradientTo} onChange={(v) => set('bgGradientTo', v)} />
            <NumberRow
              label="Angle (deg)"
              value={value.bgGradientAngle}
              onChange={(v) => set('bgGradientAngle', v)}
              min={0}
              max={360}
            />
          </>
        )}

        {value.bgType === 'image' && (
          <>
            <ImageRow
              label="Image"
              url={value.bgImageUrl}
              onPick={(id, url) => onChange({ ...value, bgImage: id, bgImageUrl: url })}
              onClear={() => onChange({ ...value, bgImage: null, bgImageUrl: null })}
            />
            <NumberRow
              label="Dark overlay (%)"
              value={value.bgOverlay}
              onChange={(v) => set('bgOverlay', v)}
              min={0}
              max={100}
            />
          </>
        )}
      </Accordion>

      <Accordion title="Spacing">
        <NumberRow label="Padding top (px)" value={value.paddingTop} onChange={(v) => set('paddingTop', v)} min={0} />
        <NumberRow
          label="Padding bottom (px)"
          value={value.paddingBottom}
          onChange={(v) => set('paddingBottom', v)}
          min={0}
        />
        <NumberRow
          label="Padding top on mobile"
          value={value.paddingTopMobile}
          onChange={(v) => set('paddingTopMobile', v)}
          min={0}
        />
        <NumberRow
          label="Padding bottom on mobile"
          value={value.paddingBottomMobile}
          onChange={(v) => set('paddingBottomMobile', v)}
          min={0}
        />
        <NumberRow label="Minimum height (px)" value={value.minHeight} onChange={(v) => set('minHeight', v)} min={0} />
      </Accordion>

      <Accordion title="Layout & text">
        <SelectRow
          label="Width"
          value={value.width || 'contained'}
          options={[
            { label: 'Contained', value: 'contained' },
            { label: 'Wide', value: 'wide' },
            { label: 'Full width', value: 'full' },
          ]}
          onChange={(v) => set('width', v as BlockStyle['width'])}
        />
        <SelectRow
          label="Text alignment"
          value={value.textAlign || ''}
          options={[
            { label: 'Default', value: '' },
            { label: 'Left', value: 'left' },
            { label: 'Centre', value: 'center' },
            { label: 'Right', value: 'right' },
          ]}
          onChange={(v) => set('textAlign', (v || undefined) as BlockStyle['textAlign'])}
        />
        <ColorRow label="Text colour" value={value.textColor} onChange={(v) => set('textColor', v)} />
      </Accordion>

      <Accordion title="Shape dividers">
        <DividerControls
          label="Top"
          shape={value.dividerTop}
          color={value.dividerTopColor}
          height={value.dividerTopHeight}
          flip={value.dividerTopFlip}
          onShape={(v) => set('dividerTop', v)}
          onColor={(v) => set('dividerTopColor', v)}
          onHeight={(v) => set('dividerTopHeight', v)}
          onFlip={(v) => set('dividerTopFlip', v)}
        />
        <DividerControls
          label="Bottom"
          shape={value.dividerBottom}
          color={value.dividerBottomColor}
          height={value.dividerBottomHeight}
          flip={value.dividerBottomFlip}
          onShape={(v) => set('dividerBottom', v)}
          onColor={(v) => set('dividerBottomColor', v)}
          onHeight={(v) => set('dividerBottomHeight', v)}
          onFlip={(v) => set('dividerBottomFlip', v)}
        />
      </Accordion>

      <Accordion title="Visibility & advanced">
        <CheckRow
          label="Hide on mobile"
          checked={Boolean(value.hideOnMobile)}
          onChange={(v) => set('hideOnMobile', v || undefined)}
        />
        <CheckRow
          label="Hide on desktop"
          checked={Boolean(value.hideOnDesktop)}
          onChange={(v) => set('hideOnDesktop', v || undefined)}
        />
        <TextRow
          label="Anchor ID"
          value={value.anchorId}
          placeholder="e.g. pricing"
          help="Link straight to this section with #your-id"
          onChange={(v) => set('anchorId', v)}
        />
        <TextRow
          label="Extra CSS class"
          value={value.customClass}
          onChange={(v) => set('customClass', v)}
        />
      </Accordion>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Small control primitives                                                   */
/* -------------------------------------------------------------------------- */

const Accordion: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({
  title,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`ve-acc ${open ? 've-acc--open' : ''}`}>
      <button type="button" className="ve-acc__head" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="ve-acc__chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="ve-acc__body">{children}</div>}
    </div>
  )
}

const Row: React.FC<{ label: string; help?: string; children: React.ReactNode }> = ({ label, help, children }) => (
  <label className="ve-row">
    <span className="ve-row__label">{label}</span>
    {children}
    {help && <span className="ve-row__help">{help}</span>}
  </label>
)

const TextRow: React.FC<{
  label: string
  value?: string
  placeholder?: string
  help?: string
  onChange: (v: string | undefined) => void
}> = ({ label, value, placeholder, help, onChange }) => (
  <Row label={label} help={help}>
    <input
      type="text"
      value={value || ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  </Row>
)

const NumberRow: React.FC<{
  label: string
  value?: number
  min?: number
  max?: number
  onChange: (v: number | undefined) => void
}> = ({ label, value, min, max, onChange }) => (
  <Row label={label}>
    <input
      type="number"
      min={min}
      max={max}
      value={typeof value === 'number' ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  </Row>
)

const SelectRow: React.FC<{
  label: string
  value: string
  options: { label: string; value: string }[]
  onChange: (v: string) => void
}> = ({ label, value, options, onChange }) => (
  <Row label={label}>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </Row>
)

const CheckRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({
  label,
  checked,
  onChange,
}) => (
  <label className="ve-row ve-row--check">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="ve-row__label">{label}</span>
  </label>
)

const ColorRow: React.FC<{ label: string; value?: string; onChange: (v: string | undefined) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <Row label={label}>
    <div className="ve-color">
      <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} />
      <input
        type="text"
        placeholder="#000000 / transparent"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {value && (
        <button type="button" className="ve-color__clear" onClick={() => onChange(undefined)} aria-label="Clear colour">
          ✕
        </button>
      )}
    </div>
  </Row>
)

const ImageRow: React.FC<{
  label: string
  url?: string | null
  onPick: (id: number, url: string | null) => void
  onClear: () => void
}> = ({ label, url, onPick, onClear }) => {
  const [open, setOpen] = useState(false)
  return (
    <Row label={label}>
      <div className="ve-media-field">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="ve-media-field__thumb" />
        ) : (
          <div className="ve-media-field__empty">No image</div>
        )}
        <div className="ve-media-field__actions">
          <button type="button" className="ve-btn ve-btn--ghost" onClick={() => setOpen(true)}>
            {url ? 'Change' : 'Choose'}
          </button>
          {url && (
            <button type="button" className="ve-btn ve-btn--ghost" onClick={onClear}>
              Remove
            </button>
          )}
        </div>
      </div>
      {open && (
        <MediaPicker
          onClose={() => setOpen(false)}
          onSelect={(id, doc) => {
            onPick(id, doc?.url || null)
            setOpen(false)
          }}
        />
      )}
    </Row>
  )
}

const DividerControls: React.FC<{
  label: string
  shape?: DividerShape
  color?: string
  height?: number
  flip?: boolean
  onShape: (v: DividerShape | undefined) => void
  onColor: (v: string | undefined) => void
  onHeight: (v: number | undefined) => void
  onFlip: (v: boolean | undefined) => void
}> = ({ label, shape, color, height, flip, onShape, onColor, onHeight, onFlip }) => (
  <div className="ve-divider-group">
    <SelectRow
      label={`${label} shape`}
      value={shape || 'none'}
      options={DIVIDER_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
      onChange={(v) => onShape(v === 'none' ? undefined : (v as DividerShape))}
    />
    {shape && shape !== 'none' && (
      <>
        <ColorRow label={`${label} colour`} value={color} onChange={onColor} />
        <NumberRow label={`${label} height (px)`} value={height} onChange={onHeight} min={10} max={400} />
        <CheckRow label={`Flip ${label.toLowerCase()}`} checked={Boolean(flip)} onChange={(v) => onFlip(v || undefined)} />
      </>
    )}
  </div>
)
