'use client'

import React, { useState } from 'react'

import {
  BOX_SHADOW_OPTIONS,
  DIVIDER_OPTIONS,
  resolveDeviceOverride,
  type BlockStyle,
  type DeviceOverride,
  type DividerShape,
  type ResponsiveKey,
} from '@/lib/blockStyle'
import { BUILT_IN_FONTS } from '@/features/fonts/installed'

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
  /** The device being edited (the top bar's device toggle). Responsive controls read and write that device's value. */
  device?: EditDevice
  /** 'column' hides settings that only make sense for a block (position in column, shape dividers). */
  variant?: 'block' | 'column'
}> = ({ value, onChange, device = 'desktop', variant = 'block' }) => {
  const resp = makeResponsive(value, onChange, device)
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

      <Accordion title="Spacing" defaultOpen={device !== 'desktop'}>
        <RespNumber ctl={resp} k="paddingTop" label="Padding top (px)" min={0} />
        <RespNumber ctl={resp} k="paddingBottom" label="Padding bottom (px)" min={0} />
        <RespNumber ctl={resp} k="paddingLeft" label="Padding left (px)" min={0} />
        <RespNumber ctl={resp} k="paddingRight" label="Padding right (px)" min={0} />
        <HeightRows ctl={resp} />
        <RespNumber ctl={resp} k="marginTop" label="Margin top (px)" />
        <RespNumber ctl={resp} k="marginBottom" label="Margin bottom (px)" />
      </Accordion>

      <Accordion title="Border & shadow">
        <NumberRow
          label="Border width (px)"
          value={value.borderWidth}
          onChange={(v) => set('borderWidth', v)}
          min={0}
        />
        {Boolean(value.borderWidth) && (
          <>
            <SelectRow
              label="Border style"
              value={value.borderStyle || 'solid'}
              options={[
                { label: 'Solid', value: 'solid' },
                { label: 'Dashed', value: 'dashed' },
                { label: 'Dotted', value: 'dotted' },
              ]}
              onChange={(v) => set('borderStyle', v as BlockStyle['borderStyle'])}
            />
            <ColorRow label="Border colour" value={value.borderColor} onChange={(v) => set('borderColor', v)} />
          </>
        )}
        <NumberRow label="Corner radius (px)" value={value.borderRadius} onChange={(v) => set('borderRadius', v)} min={0} />
        <SelectRow
          label="Shadow"
          value={value.boxShadow || 'none'}
          options={BOX_SHADOW_OPTIONS}
          onChange={(v) => set('boxShadow', v === 'none' ? undefined : (v as BlockStyle['boxShadow']))}
        />
      </Accordion>

      <Accordion title="Layout & text">
        {variant === 'block' && (
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
        )}
        <RespSelect
          ctl={resp}
          k="textAlign"
          label="Text alignment"
          options={[
            { label: 'Left', value: 'left' },
            { label: 'Centre', value: 'center' },
            { label: 'Right', value: 'right' },
          ]}
          defaultLabel="Default"
        />
        <SelectRow
          label="Font"
          value={value.fontFamily || ''}
          options={[
            { label: 'Site default', value: '' },
            ...BUILT_IN_FONTS.map((font) => ({ label: font.label, value: font.value })),
          ]}
          onChange={(v) => set('fontFamily', v || undefined)}
        />
        <ColorRow label="Text colour" value={value.textColor} onChange={(v) => set('textColor', v)} />
      </Accordion>

      {variant === 'block' && (
        <Accordion title="Position in column">
          <RespSelect
            ctl={resp}
            k="selfAlign"
            label="Align self"
            options={[
              { label: 'Stretch (fill the column)', value: 'stretch' },
              { label: 'Left / start', value: 'start' },
              { label: 'Centre', value: 'center' },
              { label: 'Right / end', value: 'end' },
            ]}
            defaultLabel="Default"
          />
          <RespSelect
            ctl={resp}
            k="selfWidth"
            label="Width"
            options={[
              { label: 'Full width', value: 'full' },
              { label: 'Custom %', value: 'custom' },
            ]}
            defaultLabel="Automatic"
          />
          {resp.effective('selfWidth') === 'custom' && <RespNumber ctl={resp} k="selfWidthPercent" label="Width (%)" min={1} max={100} />}
          <NumberRow label="Margin left (px)" value={value.marginLeft} onChange={(v) => set('marginLeft', v)} />
          <NumberRow label="Margin right (px)" value={value.marginRight} onChange={(v) => set('marginRight', v)} />
        </Accordion>
      )}

      {variant === 'block' && (
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
      )}

      <Accordion title="Visibility & advanced">
        <CheckRow
          label={`Hide on ${device}`}
          checked={Boolean(resp.own('hide'))}
          onChange={(v) => resp.set('hide', v || undefined)}
          resp={{ device, overridden: false }}
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

export const Accordion: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({
  title,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`ve-acc ${open ? 've-acc--open' : ''}`}>
      <button type="button" className="ve-acc__head" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="ve-acc__chev">{open ? String.fromCodePoint(0x25be) : String.fromCodePoint(0x25b8)}</span>
      </button>
      {open && <div className="ve-acc__body">{children}</div>}
    </div>
  )
}

/** What a responsive control needs to show: which device it edits and whether that device overrides the one above. */
export type RowResp = { device: EditDevice; overridden: boolean; onReset?: () => void }

const DEVICE_LABEL: Record<EditDevice, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' }

/** A small monitor / tablet / phone glyph (inline SVG, no icon dependency). */
export const DeviceIcon: React.FC<{ device: EditDevice }> = ({ device }) => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {device === 'desktop' && (
      <>
        <rect x="3" y="4" width="18" height="12" rx="1.5" />
        <path d="M9 20h6M12 16v4" />
      </>
    )}
    {device === 'tablet' && (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M11 18h2" />
      </>
    )}
    {device === 'mobile' && (
      <>
        <rect x="8" y="3" width="8" height="18" rx="2" />
        <path d="M11 18h2" />
      </>
    )}
  </svg>
)

const Row: React.FC<{ label: string; help?: string; resp?: RowResp; children: React.ReactNode }> = ({ label, help, resp, children }) => (
  <label className="ve-row">
    <span className="ve-row__label">
      {label}
      {resp && (
        <span className={`ve-dev ${resp.device !== 'desktop' ? 've-dev--on' : ''}`} title={`Applies to ${DEVICE_LABEL[resp.device].toLowerCase()}`}>
          <DeviceIcon device={resp.device} />
          <span className="ve-sr">{DEVICE_LABEL[resp.device]}</span>
        </span>
      )}
      {resp?.overridden && resp.onReset && (
        <button
          type="button"
          className="ve-dev__reset"
          onClick={(e) => {
            e.preventDefault()
            resp.onReset?.()
          }}
          title="Reset to the inherited value"
          aria-label={`Reset ${label} to inherited`}
        >
          Reset
        </button>
      )}
    </span>
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

export const NumberRow: React.FC<{
  label: string
  value?: number
  min?: number
  max?: number
  help?: string
  /** Shown while empty - the inherited value on tablet / mobile. */
  placeholder?: string
  resp?: RowResp
  onChange: (v: number | undefined) => void
}> = ({ label, value, min, max, help, placeholder, resp, onChange }) => (
  <Row label={label} help={help} resp={resp}>
    <input
      type="number"
      min={min}
      max={max}
      placeholder={placeholder}
      value={typeof value === 'number' ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  </Row>
)

export const SelectRow: React.FC<{
  label: string
  value: string
  options: { label: string; value: string }[]
  help?: string
  resp?: RowResp
  onChange: (v: string) => void
}> = ({ label, value, options, help, resp, onChange }) => (
  <Row label={label} help={help} resp={resp}>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </Row>
)

export const CheckRow: React.FC<{
  label: string
  checked: boolean
  help?: string
  resp?: RowResp
  onChange: (v: boolean) => void
}> = ({ label, checked, help, resp, onChange }) => (
  <label className="ve-row ve-row--check">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="ve-row__label">
      {label}
      {resp && (
        <span className={`ve-dev ${resp.device !== 'desktop' ? 've-dev--on' : ''}`} title={`Applies to ${DEVICE_LABEL[resp.device].toLowerCase()}`}>
          <DeviceIcon device={resp.device} />
        </span>
      )}
    </span>
    {help && <span className="ve-row__help">{help}</span>}
  </label>
)

/* -------------------------------------------------------------------------- */
/* Responsive editing: the top bar's device decides which value a control edits */
/* -------------------------------------------------------------------------- */

export type EditDevice = 'desktop' | 'tablet' | 'mobile'
type RespKey = ResponsiveKey | 'hide'
const LEGACY_MOBILE_KEY: Partial<Record<RespKey, keyof BlockStyle>> = {
  paddingTop: 'paddingTopMobile',
  paddingBottom: 'paddingBottomMobile',
  hide: 'hideOnMobile',
}

export type ResponsiveCtl = {
  device: EditDevice
  /** This device's own value (desktop = the base style). */
  own: (key: RespKey) => unknown
  /** What this device falls back to when it has no value of its own (undefined on desktop). */
  inherited: (key: RespKey) => unknown
  /** The value in force on this device: own, else inherited. */
  effective: (key: RespKey) => unknown
  set: (key: RespKey, next: unknown) => void
  /** Several settings in one update (separate set() calls would each start from the same old value). */
  setMany: (patch: Partial<Record<RespKey, unknown>>) => void
  /** Drops this device's value so it inherits again. */
  reset: (key: RespKey) => void
  overridden: (key: RespKey) => boolean
  resp: (key: RespKey) => RowResp
}

/**
 * Reads and writes the value of a responsive setting for one device. Desktop is the base style;
 * tablet and mobile write into `style.tablet` / `style.mobile` (and drop the older mobile-only
 * key for the same setting, so resetting really returns to the inherited value).
 */
export function makeResponsive(value: BlockStyle, onChange: (next: BlockStyle) => void, device: EditDevice): ResponsiveCtl {
  const desktop = device === 'desktop'
  const override = (d: 'tablet' | 'mobile'): DeviceOverride => resolveDeviceOverride(value, d)
  const base = (key: RespKey): unknown => (key === 'hide' ? value.hideOnDesktop : value[key])

  const own = (key: RespKey): unknown => (desktop ? base(key) : override(device)[key])
  const inherited = (key: RespKey): unknown => {
    if (desktop || key === 'hide') return undefined
    if (device === 'tablet') return base(key)
    return override('tablet')[key] ?? base(key)
  }
  const setMany = (patch: Partial<Record<RespKey, unknown>>) => {
    const updated: Record<string, unknown> = { ...value }
    const current: Record<string, unknown> = { ...((desktop ? undefined : (value[device] as Record<string, unknown> | undefined)) ?? {}) }
    for (const [name, next] of Object.entries(patch) as [RespKey, unknown][]) {
      const clear = next === undefined || next === null || next === '' || next === false
      if (desktop) {
        const target = name === 'hide' ? 'hideOnDesktop' : name
        if (clear) delete updated[target]
        else updated[target] = next
        continue
      }
      if (clear) delete current[name]
      else current[name] = next
      if (device === 'mobile') {
        const legacy = LEGACY_MOBILE_KEY[name]
        if (legacy) delete updated[legacy]
      }
    }
    if (!desktop) {
      if (Object.keys(current).length > 0) updated[device] = current
      else delete updated[device]
    }
    onChange(updated as BlockStyle)
  }
  const set = (key: RespKey, next: unknown) => setMany({ [key]: next })
  const overridden = (key: RespKey) => !desktop && own(key) !== undefined
  const reset = (key: RespKey) => set(key, undefined)
  return {
    device,
    own,
    inherited,
    effective: (key) => own(key) ?? inherited(key),
    set,
    setMany,
    reset,
    overridden,
    resp: (key) => ({ device, overridden: overridden(key), onReset: () => reset(key) }),
  }
}

const inheritNote = (device: EditDevice) => (device === 'mobile' ? 'tablet' : 'desktop')

/** A number setting that follows the device toggle, with the inherited value as its placeholder. */
export const RespNumber: React.FC<{ ctl: ResponsiveCtl; k: RespKey; label: string; min?: number; max?: number; help?: string }> = ({
  ctl,
  k,
  label,
  min,
  max,
  help,
}) => {
  const own = ctl.own(k)
  const inherited = ctl.inherited(k)
  return (
    <NumberRow
      label={label}
      value={typeof own === 'number' ? own : undefined}
      placeholder={typeof inherited === 'number' ? `${inherited} (from ${inheritNote(ctl.device)})` : undefined}
      min={min}
      max={max}
      help={help}
      resp={ctl.resp(k)}
      onChange={(v) => ctl.set(k, v)}
    />
  )
}

/** A choice setting that follows the device toggle; tablet / mobile get an "inherited" first option. */
export const RespSelect: React.FC<{
  ctl: ResponsiveCtl
  k: RespKey
  label: string
  options: { label: string; value: string }[]
  /** Label of the unset option on desktop. */
  defaultLabel: string
  help?: string
}> = ({ ctl, k, label, options, defaultLabel, help }) => {
  const own = ctl.own(k)
  const inherited = ctl.inherited(k)
  const inheritedLabel = options.find((o) => o.value === inherited)?.label ?? defaultLabel
  const first = ctl.device === 'desktop' ? defaultLabel : `Inherited from ${inheritNote(ctl.device)} (${inheritedLabel})`
  return (
    <SelectRow
      label={label}
      value={typeof own === 'string' ? own : ''}
      options={[{ label: first, value: '' }, ...options]}
      help={help}
      resp={ctl.resp(k)}
      onChange={(v) => ctl.set(k, v || undefined)}
    />
  )
}

/** Height: default, a minimum height, or "fit the screen" (100vh). Responsive. */
export const HeightRows: React.FC<{ ctl: ResponsiveCtl }> = ({ ctl }) => {
  const minHeight = ctl.own('minHeight')
  const unit = ctl.own('minHeightUnit')
  const inheritedHeight = ctl.inherited('minHeight')
  const effectiveHeight = ctl.effective('minHeight')
  const effectiveUnit = ctl.effective('minHeightUnit')
  const mode = (h: unknown, u: unknown) => (typeof h !== 'number' || h <= 0 ? 'default' : u === 'vh' && h === 100 ? 'screen' : 'min')
  const current = ctl.device === 'desktop' ? mode(minHeight, unit) : typeof minHeight === 'number' ? mode(minHeight, unit) : 'inherit'
  const label = (m: string) => (m === 'screen' ? 'Fit to screen' : m === 'min' ? 'Minimum height' : 'Default')
  const options = [
    ...(ctl.device === 'desktop'
      ? []
      : [{ label: `Inherited from ${inheritNote(ctl.device)} (${label(mode(inheritedHeight, ctl.inherited('minHeightUnit')))})`, value: 'inherit' }]),
    { label: 'Default', value: 'default' },
    { label: 'Minimum height', value: 'min' },
    { label: 'Fit to screen', value: 'screen' },
  ]
  return (
    <>
      <SelectRow
        label="Height"
        value={current}
        options={options}
        help="Fit to screen makes the section at least as tall as the window."
        resp={{ device: ctl.device, overridden: ctl.overridden('minHeight'), onReset: () => { ctl.reset('minHeight'); ctl.reset('minHeightUnit') } }}
        onChange={(v) => {
          if (v === 'inherit' || (v === 'default' && ctl.device === 'desktop')) {
            ctl.setMany({ minHeight: undefined, minHeightUnit: undefined })
          } else if (v === 'default') {
            // An explicit 0 switches the inherited minimum off for this device.
            ctl.setMany({ minHeight: 0, minHeightUnit: undefined })
          } else if (v === 'screen') {
            ctl.setMany({ minHeight: 100, minHeightUnit: 'vh' })
          } else {
            ctl.setMany({
              minHeight: typeof effectiveHeight === 'number' && effectiveUnit !== 'vh' && effectiveHeight > 0 ? effectiveHeight : 400,
              minHeightUnit: undefined,
            })
          }
        }}
      />
      {current === 'min' && (
        <RespNumber ctl={ctl} k="minHeight" label="Minimum height (px)" min={0} />
      )}
    </>
  )
}

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
          &#10005;
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
