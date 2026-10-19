'use client'

import React, { createContext, useContext, useState } from 'react'

import {
  BLEND_MODE_OPTIONS,
  BOX_SHADOW_OPTIONS,
  BG_EFFECT_OPTIONS,
  BORDER_FX_OPTIONS,
  KEN_BURNS_OPTIONS,
  POINTER_FX_OPTIONS,
  DIVIDER_ANIM_OPTIONS,
  DIVIDER_OPTIONS,
  HOVER_OPTIONS,
  BLOB_SPEED_OPTIONS,
  MASK_SHAPE_OPTIONS,
  MAX_SLIDES,
  SLIDE_TRANSITION_OPTIONS,
  PARTICLE_INTERACT_OPTIONS,
  POSITION_OPTIONS,
  REVEAL_EASING_OPTIONS,
  REVEAL_OPTIONS,
  resolveDeviceOverride,
  TEXT_FX_OPTIONS,
  type BlendMode,
  type BlockPosition,
  type BlockStyle,
  type DeviceOverride,
  type DividerAnim,
  type DividerShape,
  type MaskShape,
  type ResponsiveKey,
  isSafeMediaUrl,
} from '@/lib/blockStyle'
import { BUILT_IN_FONTS } from '@/features/fonts/installed'

import { MediaPicker } from './MediaPicker'
import {
  GROUP_KEYS,
  GROUP_SEARCH,
  groupModified,
  linkedPatch,
  linkedValue,
  matchesQuery,
  MARGIN_SIDE_KEYS,
  PADDING_SIDE_KEYS,
  readColourTokens,
  resetGroup,
  type ColourToken,
} from './designHelpers'
import './designPanel51.css'
import { StylePresets } from './StylePresets'

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
  const [query, setQuery] = useState('')
  const [only, setOnly] = useState(false)
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
    <DesignCtx.Provider value={{ value, onChange, query, only }}>
    <div className="ve-design">
      <StylePresets value={value} onChange={onChange} device={device} />
      <div className="ve-d51-top">
        <input
          type="search"
          className="ve-d51-search"
          placeholder="Search settings"
          aria-label="Search settings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="ve-d51-only">
          <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
          <span>Only changed</span>
        </label>
      </div>
      <Acc g="background" title="Background" defaultOpen>
        <SelectRow
          label="Type"
          value={value.bgType || 'none'}
          options={[
            { label: 'None', value: 'none' },
            { label: 'Solid colour', value: 'color' },
            { label: 'Gradient', value: 'gradient' },
            { label: 'Image', value: 'image' },
            { label: 'Video', value: 'video' },
            { label: 'Slideshow', value: 'slideshow' },
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
            <ParallaxBgControls value={value} onChange={onChange} />
          </>
        )}

        {value.bgType === 'slideshow' && <SlideshowControls value={value} onChange={onChange} />}

        {value.bgType === 'video' && (
          <>
            <TextRow
              label="Video URL"
              value={value.bgVideoUrl || undefined}
              placeholder="https://... or /media/clip.mp4"
              help={
                value.bgVideoUrl && !isSafeMediaUrl(value.bgVideoUrl, 'video')
                  ? 'Not a usable link. Use an https or site path ending in .mp4 or .webm.'
                  : 'MP4 or WebM. Keep it short and compressed; it autoplays muted and loops.'
              }
              onChange={(v) => set('bgVideoUrl', v)}
            />
            <ImageRow
              label="Poster image"
              url={value.bgVideoPoster}
              onPick={(_id, url) => set('bgVideoPoster', url)}
              onClear={() => set('bgVideoPoster', undefined)}
            />
            <CheckRow
              label="Loop"
              checked={value.bgVideoLoop !== false}
              help="Turn off to play once and hold the last frame."
              onChange={(v) => set('bgVideoLoop', v ? undefined : false)}
            />
          </>
        )}

        {value.bgType !== 'image' && value.parallax === 'background' && (
          <p className="ve-row__help">Parallax needs the background type set to Image.</p>
        )}

        <p className="ve-row__label">Overlay</p>
        <SelectRow
          label="Type"
          value={value.overlayType || 'none'}
          options={[
            { label: 'None', value: 'none' },
            { label: 'Colour', value: 'color' },
            { label: 'Gradient', value: 'gradient' },
          ]}
          onChange={(v) => set('overlayType', v === 'none' ? undefined : (v as BlockStyle['overlayType']))}
        />
        {value.overlayType === 'color' && (
          <ColorRow label="Colour" value={value.overlayColor} onChange={(v) => set('overlayColor', v)} />
        )}
        {value.overlayType === 'gradient' && (
          <>
            <ColorRow label="From" value={value.overlayColor} onChange={(v) => set('overlayColor', v)} />
            <ColorRow label="To" value={value.overlayColor2} onChange={(v) => set('overlayColor2', v)} />
            <NumberRow
              label="Angle (deg)"
              value={value.overlayAngle}
              onChange={(v) => set('overlayAngle', v)}
              min={0}
              max={360}
            />
          </>
        )}
        {value.overlayType && value.overlayType !== 'none' && (
          <>
            <FxRange k="overlayOpacity" label="Opacity" unit="%" value={value} onChange={onChange} def={50} min={0} max={100} />
            <SelectRow
              label="Blend mode"
              value={value.overlayBlend || 'normal'}
              options={[
                { label: 'Normal', value: 'normal' },
                { label: 'Multiply', value: 'multiply' },
                { label: 'Screen', value: 'screen' },
                { label: 'Overlay', value: 'overlay' },
                { label: 'Soft light', value: 'soft-light' },
                { label: 'Colour', value: 'color' },
                { label: 'Luminosity', value: 'luminosity' },
              ]}
              onChange={(v) => set('overlayBlend', v === 'normal' ? undefined : (v as BlockStyle['overlayBlend']))}
            />
          </>
        )}

        <FxRange k="noise" label="Noise" unit="%" value={value} onChange={onChange} def={0} min={0} max={100} help="Film grain over the background and gradient. Pure SVG, no image file." />

        {variant === 'block' && (
          <>
            <p className="ve-row__label">Animated background</p>
            <BackgroundEffectControls value={value} onChange={onChange} />
          </>
        )}
      </Acc>

      <Acc g="hover" title="Hover state">
        <p className="ve-row__help">Applies on hover with a mouse or trackpad. Unset values stay the same as normal.</p>
        <ColorRow label="Background" value={value.hoverBgColor} onChange={(v) => set('hoverBgColor', v)} />
        <ColorRow label="Text colour" value={value.hoverTextColor} onChange={(v) => set('hoverTextColor', v)} />
        <ColorRow label="Border colour" value={value.hoverBorderColor} onChange={(v) => set('hoverBorderColor', v)} />
        <SelectRow
          label="Shadow"
          value={value.hoverBoxShadow || ''}
          options={[{ label: 'Same as normal', value: '' }, ...BOX_SHADOW_OPTIONS]}
          onChange={(v) => set('hoverBoxShadow', (v || undefined) as BlockStyle['hoverBoxShadow'])}
        />
        <FxRange k="hoverBorderRadius" label="Corner radius" unit="px" value={value} onChange={onChange} def={0} min={0} max={200} />
        <FxRange k="hoverTransitionMs" label="Transition" unit="ms" value={value} onChange={onChange} def={250} min={0} max={2000} step={10} />
        {makeFxEditing(value, onChange).resetBtn([
          'hoverBgColor', 'hoverTextColor', 'hoverBorderColor', 'hoverBoxShadow', 'hoverBorderRadius', 'hoverTransitionMs',
        ])}
      </Acc>

      <Acc g="spacing" title="Spacing" defaultOpen={device !== 'desktop'}>
        <UnitRow ctl={resp} k="paddingUnit" label="Padding unit" />
        <LinkedSides ctl={resp} keys={PADDING_SIDE_KEYS} noun="Padding" min={0} />
        <HeightRows ctl={resp} />
        <UnitRow ctl={resp} k="marginUnit" label="Margin unit" />
        <LinkedSides ctl={resp} keys={MARGIN_SIDE_KEYS} noun="Margin" />
      </Acc>

      <Acc g="border" title="Border & shadow">
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
      </Acc>

      <Acc g="layout" title="Layout & text">
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
        <ColorRow label="Text colour" value={value.textColor} onChange={(v) => set('textColor', v)} />
      </Acc>

      <Acc g="typography" title="Typography">
        <TypographyControls value={value} onChange={onChange} ctl={resp} />
      </Acc>

      {variant === 'block' && (
        <Acc g="position" title="Position in column">
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
          {resp.effective('selfWidth') === 'custom' && (
            <>
              <RespNumber ctl={resp} k="selfWidthPercent" label="Custom width" min={1} />
              <UnitRow ctl={resp} k="selfWidthPercentUnit" label="Width unit" def="%" />
            </>
          )}
        </Acc>
      )}

      {variant === 'block' && (
      <Acc g="dividers" title="Shape dividers">
        <DividerControls
          label="Top"
          shape={value.dividerTop}
          color={value.dividerTopColor}
          height={value.dividerTopHeight}
          flip={value.dividerTopFlip}
          anim={value.dividerTopAnim}
          speed={value.dividerTopSpeed}
          onAnim={(v) => set('dividerTopAnim', v)}
          onSpeed={(v) => set('dividerTopSpeed', v)}
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
          anim={value.dividerBottomAnim}
          speed={value.dividerBottomSpeed}
          onAnim={(v) => set('dividerBottomAnim', v)}
          onSpeed={(v) => set('dividerBottomSpeed', v)}
          onShape={(v) => set('dividerBottom', v)}
          onColor={(v) => set('dividerBottomColor', v)}
          onHeight={(v) => set('dividerBottomHeight', v)}
          onFlip={(v) => set('dividerBottomFlip', v)}
        />
      </Acc>
      )}

      {variant === 'block' && (
        <Acc g="effects" title="Effects">
          <EffectsControls value={value} onChange={onChange} />
        </Acc>
      )}

      <Acc g="advanced" title="Advanced">
        <AdvancedControls value={value} onChange={onChange} />
      </Acc>

      <Acc g="visibility" title="Visibility & advanced">
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
          onChange={(v) => set('anchorId', v.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^[^A-Za-z]+/, '').slice(0, 64) || undefined)}
        />
        <TextRow
          label="Extra CSS class"
          value={value.customClass}
          onChange={(v) => set('customClass', v)}
        />
      </Acc>
    </div>
    </DesignCtx.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/* Small control primitives                                                   */
/* -------------------------------------------------------------------------- */

type DesignCtxValue = { value: BlockStyle; onChange: (next: BlockStyle) => void; query: string; only: boolean }
const DesignCtx = createContext<DesignCtxValue | null>(null)

/** A top-level Design accordion: modified dot, group Reset, and search / "Only changed" filtering. */
const Acc: React.FC<{ g: string; title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ g, title, defaultOpen, children }) => {
  const ctx = useContext(DesignCtx)
  const keys = GROUP_KEYS[g] ?? []
  const modified = ctx ? groupModified(ctx.value, keys) : false
  if (ctx) {
    if (!matchesQuery(ctx.query, title, GROUP_SEARCH[g] ?? '')) return null
    if (ctx.only && !modified) return null
  }
  const searching = Boolean(ctx && ctx.query.trim())
  return (
    <Accordion
      title={title}
      defaultOpen={defaultOpen || searching}
      modified={modified}
      onReset={ctx ? () => ctx.onChange(resetGroup(ctx.value, keys)) : undefined}
    >
      {children}
    </Accordion>
  )
}

export const Accordion: React.FC<{
  title: string
  defaultOpen?: boolean
  modified?: boolean
  onReset?: () => void
  children: React.ReactNode
}> = ({
  title,
  defaultOpen = false,
  modified = false,
  onReset,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`ve-acc ${open ? 've-acc--open' : ''}`}>
      <button type="button" className="ve-acc__head" onClick={() => setOpen(!open)}>
        <span>
          {title}
          {modified && <span className="ve-d51-dot" title="Changed" aria-label="Changed" />}
        </span>
        <span className="ve-acc__chev">{open ? String.fromCodePoint(0x25be) : String.fromCodePoint(0x25b8)}</span>
      </button>
      {modified && onReset && (
        <button type="button" className="ve-d51-reset" onClick={onReset} aria-label={`Reset ${title}`}>
          Reset
        </button>
      )}
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

const UNIT_OPTIONS = ['px', '%', 'em', 'rem', 'vw', 'vh'].map((u) => ({ label: u, value: u }))

/** Unit picker for a spacing / size value. Unset means the default unit (px, or % for custom width). */
const UnitRow: React.FC<{ ctl: ResponsiveCtl; k: RespKey; label: string; def?: string }> = ({ ctl, k, label, def = 'px' }) => {
  const own = ctl.own(k)
  const inherited = ctl.inherited(k)
  const shown = typeof own === 'string' ? own : typeof inherited === 'string' ? inherited : def
  return (
    <SelectRow
      label={label}
      value={shown}
      options={UNIT_OPTIONS}
      resp={ctl.resp(k)}
      onChange={(v) => {
        const base = typeof inherited === 'string' ? inherited : def
        ctl.set(k, v === base ? undefined : v)
      }}
    />
  )
}

/** Four sides with an optional "link all sides" mode: one value writes every side in a single update (one undo step). */
const LinkedSides: React.FC<{
  ctl: ResponsiveCtl
  keys: readonly ('paddingTop' | 'paddingBottom' | 'paddingLeft' | 'paddingRight' | 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight')[]
  noun: string
  min?: number
}> = ({ ctl, keys, noun, min }) => {
  const [linked, setLinked] = useState(false)
  const { same, value } = linkedValue(keys.map((k) => ctl.own(k)))
  const sides = ['top', 'bottom', 'left', 'right']
  return (
    <>
      <CheckRow label={`Link all sides (${noun.toLowerCase()})`} checked={linked} onChange={setLinked} />
      {linked ? (
        <NumberRow
          label={`${noun}, all sides`}
          value={value}
          placeholder={same ? undefined : 'mixed'}
          min={min}
          resp={ctl.resp(keys[0])}
          onChange={(v) => ctl.setMany(linkedPatch(keys, v))}
        />
      ) : (
        keys.map((k, i) => <RespNumber key={k} ctl={ctl} k={k} label={`${noun} ${sides[i]}`} min={min} />)
      )}
    </>
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
        <>
          <RespNumber ctl={ctl} k="minHeight" label="Minimum height" min={0} />
          <UnitRow ctl={ctl} k="minHeightUnit" label="Height unit" />
        </>
      )}
    </>
  )
}

const ColorRow: React.FC<{ label: string; value?: string; onChange: (v: string | undefined) => void }> = ({
  label,
  value,
  onChange,
}) => {
  // Tokens are read when the button is clicked, never during render.
  const [tokens, setTokens] = useState<ColourToken[] | null>(null)
  const hex = value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'
  return (
    <Row label={label}>
      <div className="ve-color">
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} />
        <input
          type="text"
          placeholder="#000000 / transparent"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
        <button
          type="button"
          className="ve-d51-tokbtn"
          title="Pick a theme colour"
          aria-label="Theme colours"
          onClick={(e) => {
            e.preventDefault()
            setTokens((cur) => (cur ? null : readColourTokens(document)))
          }}
        >
          Theme
        </button>
        {value && (
          <button type="button" className="ve-color__clear" onClick={() => onChange(undefined)} aria-label="Clear colour">
            &#10005;
          </button>
        )}
      </div>
      {tokens && (
        <div className="ve-d51-tokens">
          {tokens.length === 0 && <span className="ve-row__help">No theme colours found.</span>}
          {tokens.map((t) => (
            <button
              key={t.name}
              type="button"
              className={`ve-d51-swatch ${value === t.css ? 've-d51-swatch--on' : ''}`}
              style={{ background: t.value || undefined }}
              title={t.name}
              aria-label={t.name}
              onClick={(e) => {
                e.preventDefault()
                onChange(t.css)
              }}
            />
          ))}
        </div>
      )}
    </Row>
  )
}

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
  anim?: DividerAnim
  speed?: number
  onAnim: (v: DividerAnim | undefined) => void
  onSpeed: (v: number | undefined) => void
  onShape: (v: DividerShape | undefined) => void
  onColor: (v: string | undefined) => void
  onHeight: (v: number | undefined) => void
  onFlip: (v: boolean | undefined) => void
}> = ({ label, shape, color, height, flip, anim, speed, onAnim, onSpeed, onShape, onColor, onHeight, onFlip }) => (
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
        <SelectRow
          label={`${label} animation`}
          value={anim || 'none'}
          options={DIVIDER_ANIM_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          help="Gently moves the divider. Pure CSS."
          onChange={(v) => onAnim(v === 'none' ? undefined : (v as DividerAnim))}
        />
        {anim && anim !== 'none' && (
          <RangeRow label="Speed (seconds)" value={speed ?? 20} min={4} max={60} help="Time for one full cycle. Higher is slower." onChange={(v) => onSpeed(v)} />
        )}
      </>
    )}
  </div>
)

/* -------------------------------------------------------------------------- */
/* Typography (Elementor-style)                                               */
/* -------------------------------------------------------------------------- */

type ToggleOption = { label: string; value: string; title?: string }

/** A row of toggle buttons for one BlockStyle key; clicking the active one clears it. */
const ToggleRow: React.FC<{
  label: string
  options: ToggleOption[]
  current: string | undefined
  onPick: (v: string | undefined) => void
}> = ({ label, options, current, onPick }) => (
  <Row label={label}>
    <div className="ve-color">
      {options.map((o) => {
        const on = current === o.value
        return (
          <button
            key={o.value}
            type="button"
            className="ve-btn ve-btn--ghost"
            aria-pressed={on}
            title={o.title ?? o.label}
            style={on ? { outline: '2px solid currentColor', fontWeight: 700 } : undefined}
            onClick={(e) => {
              e.preventDefault()
              onPick(on ? undefined : o.value)
            }}
          >
            {o.label}
          </button>
        )
      })}
      {current !== undefined && (
        <button type="button" className="ve-btn ve-btn--ghost" title="Reset" aria-label={`Reset ${label}`} onClick={(e) => { e.preventDefault(); onPick(undefined) }}>
          {String.fromCharCode(0x21BA)}
        </button>
      )}
    </div>
  </Row>
)

/** Slider + number + reset for a responsive numeric key (follows the device toggle). */
const TypoRange: React.FC<{
  ctl: ResponsiveCtl
  k: RespKey
  label: string
  def: number
  min: number
  max: number
  step: number
  unit?: React.ReactNode
  /** Extra keys cleared by this control's reset. */
  alsoReset?: RespKey[]
}> = ({ ctl, k, label, def, min, max, step, unit, alsoReset }) => {
  const own = ctl.own(k)
  const inherited = ctl.inherited(k)
  const current = typeof own === 'number' ? own : typeof inherited === 'number' ? inherited : def
  const write = (n: number | undefined) => ctl.set(k, n === undefined || !Number.isFinite(n) ? undefined : n)
  return (
    <Row label={label} resp={{ device: ctl.device, overridden: ctl.overridden(k), onReset: () => ctl.reset(k) }}>
      <div className="ve-color">
        <input type="range" min={min} max={max} step={step} value={current} onChange={(e) => write(Number(e.target.value))} />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={typeof own === 'number' ? own : ''}
          placeholder={String(current)}
          onChange={(e) => write(e.target.value === '' ? undefined : Number(e.target.value))}
        />
        {unit}
        {typeof own === 'number' && ctl.device === 'desktop' && (
          <button
            type="button"
            className="ve-btn ve-btn--ghost"
            title="Reset to default"
            aria-label={`Reset ${label}`}
            onClick={(e) => {
              e.preventDefault()
              const clear: Partial<Record<RespKey, unknown>> = { [k]: undefined }
              for (const r of alsoReset ?? []) clear[r] = undefined
              ctl.setMany(clear)
            }}
          >
            {String.fromCharCode(0x21BA)}
          </button>
        )}
      </div>
    </Row>
  )
}

const FONT_SIZE_RANGE: Record<string, { min: number; max: number; step: number; def: number }> = {
  px: { min: 8, max: 160, step: 1, def: 16 },
  em: { min: 0.5, max: 10, step: 0.1, def: 1 },
  rem: { min: 0.5, max: 10, step: 0.1, def: 1 },
  vw: { min: 0.5, max: 20, step: 0.1, def: 4 },
}
const LETTER_SPACING_RANGE: Record<string, { min: number; max: number; step: number }> = {
  px: { min: -5, max: 30, step: 0.5 },
  em: { min: -0.2, max: 1, step: 0.01 },
}

const WEIGHT_OPTIONS = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
  value: String(w),
  label: `${w}${w === 400 ? ' (Normal)' : w === 700 ? ' (Bold)' : ''}`,
}))

const TypographyControls: React.FC<{ value: BlockStyle; onChange: (next: BlockStyle) => void; ctl: ResponsiveCtl }> = ({
  value,
  onChange,
  ctl,
}) => {
  const patch = (changes: Partial<Record<keyof BlockStyle, unknown>>) => {
    const updated: Record<string, unknown> = { ...value }
    for (const [name, next] of Object.entries(changes)) {
      if (next === undefined || next === '') delete updated[name]
      else updated[name] = next
    }
    onChange(updated as BlockStyle)
  }
  const sizeUnit = (ctl.effective('fontSizeUnit') as string | undefined) ?? 'px'
  const sizeRange = FONT_SIZE_RANGE[sizeUnit] ?? FONT_SIZE_RANGE.px
  const lsUnit = value.letterSpacingUnit === 'em' ? 'em' : 'px'
  const lsRange = LETTER_SPACING_RANGE[lsUnit]
  const touched = (['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'fontStyle', 'textDecoration', 'wordSpacing', 'textShadow', 'textFx'] as const).some(
    (k) => value[k] !== undefined,
  )
  return (
    <>
      <SelectRow
        label="Family"
        value={value.fontFamily || ''}
        options={[{ label: 'Site default', value: '' }, ...BUILT_IN_FONTS.map((font) => ({ label: font.label, value: font.value }))]}
        onChange={(v) => patch({ fontFamily: v || undefined })}
      />
      <TypoRange
        ctl={ctl}
        k="fontSize"
        label="Size"
        def={sizeRange.def}
        min={sizeRange.min}
        max={sizeRange.max}
        step={sizeRange.step}
        alsoReset={['fontSizeUnit']}
        unit={
          <select
            aria-label="Size unit"
            value={sizeUnit}
            onChange={(e) => ctl.set('fontSizeUnit', e.target.value === 'px' && ctl.device === 'desktop' ? undefined : e.target.value)}
          >
            {['px', 'em', 'rem', 'vw'].map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        }
      />
      <SelectRow
        label="Weight"
        value={value.fontWeight !== undefined ? String(value.fontWeight) : ''}
        options={[{ label: 'Default', value: '' }, ...WEIGHT_OPTIONS]}
        onChange={(v) => patch({ fontWeight: v ? Number(v) : undefined })}
      />
      <ToggleRow
        label="Transform"
        current={value.textTransform}
        options={[
          { label: 'None', value: 'none' },
          { label: 'AA', value: 'uppercase', title: 'Uppercase' },
          { label: 'aa', value: 'lowercase', title: 'Lowercase' },
          { label: 'Aa', value: 'capitalize', title: 'Capitalize' },
        ]}
        onPick={(v) => patch({ textTransform: v })}
      />
      <ToggleRow
        label="Style"
        current={value.fontStyle}
        options={[
          { label: 'Normal', value: 'normal' },
          { label: 'Italic', value: 'italic' },
        ]}
        onPick={(v) => patch({ fontStyle: v })}
      />
      <ToggleRow
        label="Decoration"
        current={value.textDecoration}
        options={[
          { label: 'None', value: 'none' },
          { label: 'Underline', value: 'underline' },
          { label: 'Strike', value: 'line-through', title: 'Line through' },
        ]}
        onPick={(v) => patch({ textDecoration: v })}
      />
      <TypoRange ctl={ctl} k="lineHeight" label="Line height" def={1.5} min={0.8} max={3} step={0.05} />
      <TypoRange
        ctl={ctl}
        k="letterSpacing"
        label="Letter spacing"
        def={0}
        min={lsRange.min}
        max={lsRange.max}
        step={lsRange.step}
        unit={
          <select
            aria-label="Letter spacing unit"
            value={lsUnit}
            onChange={(e) => patch({ letterSpacingUnit: e.target.value === 'em' ? 'em' : undefined })}
          >
            <option value="px">px</option>
            <option value="em">em</option>
          </select>
        }
      />
      <FxRange k="wordSpacing" label="Word spacing" unit="px" value={value} onChange={onChange} def={0} min={-10} max={50} />
      <SelectRow
        label="Text shadow"
        value={value.textShadow || 'none'}
        options={[
          { label: 'None', value: 'none' },
          { label: 'Small', value: 'sm' },
          { label: 'Medium', value: 'md' },
          { label: 'Large', value: 'lg' },
        ]}
        onChange={(v) => patch({ textShadow: v === 'none' ? undefined : v })}
      />
      <SelectRow
        label="Text effect"
        help="Applies to the text inside this block"
        value={value.textFx || 'none'}
        options={TEXT_FX_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        onChange={(v) => patch({ textFx: v === 'none' ? undefined : v })}
      />
      {value.textFx === 'gradient' && (
        <>
          <ColorRow label="Colour 1" value={value.textFxColor} onChange={(v) => patch({ textFxColor: v })} />
          <ColorRow label="Colour 2" value={value.textFxColor2} onChange={(v) => patch({ textFxColor2: v })} />
          <FxRange k="textFxAngle" label="Gradient angle" unit="deg" value={value} onChange={onChange} def={90} min={0} max={360} />
          <CheckRow label="Animate gradient" checked={value.textFxAnimated === true} onChange={(v) => patch({ textFxAnimated: v ? true : undefined })} />
        </>
      )}
      {value.textFx === 'outline' && (
        <>
          <ColorRow label="Outline colour" value={value.textFxColor} onChange={(v) => patch({ textFxColor: v })} />
          <FxRange k="textFxStroke" label="Outline width" unit="px" value={value} onChange={onChange} def={2} min={1} max={6} step={0.5} />
        </>
      )}
      {value.textFx === 'shadow-glow' && (
        <ColorRow label="Glow colour" value={value.textFxColor} onChange={(v) => patch({ textFxColor: v })} />
      )}
      {touched && (
        <button
          type="button"
          className="ve-btn ve-btn--ghost"
          onClick={() =>
            patch({
              fontFamily: undefined, fontSize: undefined, fontSizeUnit: undefined, fontWeight: undefined, lineHeight: undefined,
              letterSpacing: undefined, letterSpacingUnit: undefined, textTransform: undefined, fontStyle: undefined,
              textDecoration: undefined, wordSpacing: undefined, textShadow: undefined,
              textFx: undefined, textFxColor: undefined, textFxColor2: undefined, textFxAngle: undefined,
              textFxStroke: undefined, textFxAnimated: undefined,
              tablet: stripTypo(value.tablet), mobile: stripTypo(value.mobile),
            })
          }
        >
          Reset all typography
        </button>
      )}
    </>
  )
}

/** A device override without its typography keys (undefined when nothing else is left). */
function stripTypo(o: DeviceOverride | undefined): DeviceOverride | undefined {
  if (!o) return undefined
  const { fontSize: _a, fontSizeUnit: _b, lineHeight: _c, letterSpacing: _d, ...rest } = o
  return Object.keys(rest).length > 0 ? rest : undefined
}

const RangeRow: React.FC<{
  label: string
  value: number
  min: number
  max: number
  help?: string
  onChange: (v: number | undefined) => void
}> = ({ label, value, min, max, help, onChange }) => (
  <Row label={label} help={help}>
    <div className="ve-color">
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </div>
  </Row>
)

/** Elementor-style numeric control: label, slider, number box, unit, and a per-control reset. */
const FxRange: React.FC<{
  k: keyof BlockStyle
  label: string
  value: BlockStyle
  onChange: (next: BlockStyle) => void
  def: number
  min: number
  max: number
  step?: number
  unit?: string
  help?: string
}> = ({ k, label, value, onChange, def, min, max, step = 1, unit, help }) => {
  const raw = value[k]
  const current = typeof raw === 'number' ? raw : def
  const write = (n: number | undefined) => {
    const updated = { ...value } as Record<string, unknown>
    if (n === undefined || !Number.isFinite(n)) delete updated[k]
    else updated[k] = n
    onChange(updated as BlockStyle)
  }
  return (
    <Row label={unit ? `${label} (${unit})` : label} help={help}>
      <div className="ve-color">
        <input type="range" min={min} max={max} step={step} value={current} onChange={(e) => write(Number(e.target.value))} />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(e) => write(e.target.value === '' ? undefined : Number(e.target.value))}
        />
        {typeof raw === 'number' && (
          <button type="button" className="ve-btn ve-btn--ghost" title="Reset to default" aria-label={`Reset ${label}`} onClick={() => write(undefined)}>
            {String.fromCharCode(0x21BA)}
          </button>
        )}
      </div>
    </Row>
  )
}

/** Effects are not responsive: they always write the base (desktop) value, whatever device is being edited. */
function makeFxEditing(value: BlockStyle, onChange: (next: BlockStyle) => void) {
  const set = <K extends keyof BlockStyle>(key: K, next: BlockStyle[K]) => {
    const updated = { ...value }
    if (next === undefined || (next as unknown) === '' || next === null) delete updated[key]
    else updated[key] = next
    onChange(updated)
  }
  const resetBtn = (keys: (keyof BlockStyle)[]) =>
    keys.some((k) => value[k] !== undefined) ? (
      <button
        type="button"
        className="ve-btn ve-btn--ghost"
        onClick={() => {
          const updated = { ...value }
          for (const k of keys) delete updated[k]
          onChange(updated)
        }}
      >
        Reset
      </button>
    ) : null
  return { set, resetBtn }
}

/** Background parallax: lives with the Image controls because it only works on a background image. */
/** Slideshow background: up to 6 images (picked like the single background image), timing and transition. */
const SlideshowControls: React.FC<{ value: BlockStyle; onChange: (next: BlockStyle) => void }> = ({ value, onChange }) => {
  const { set, resetBtn } = makeFxEditing(value, onChange)
  const urls = value.bgSlides ?? []
  const ids = value.bgSlideIds ?? []
  const write = (nextUrls: string[], nextIds: number[]) => {
    const updated = { ...value } as Record<string, unknown>
    if (nextUrls.length > 0) updated.bgSlides = nextUrls
    else delete updated.bgSlides
    if (nextIds.length > 0) updated.bgSlideIds = nextIds
    else delete updated.bgSlideIds
    onChange(updated as BlockStyle)
  }
  return (
    <>
      {urls.map((u, i) => (
        <ImageRow
          key={`${i}-${u}`}
          label={`Slide ${i + 1}`}
          url={u}
          onPick={(id, url) => {
            if (!url) return
            const nu = urls.slice()
            const ni = ids.slice()
            nu[i] = url
            ni[i] = id
            write(nu, ni)
          }}
          onClear={() => write(urls.filter((_, j) => j !== i), ids.filter((_, j) => j !== i))}
        />
      ))}
      {urls.length < MAX_SLIDES && (
        <ImageRow
          label={urls.length === 0 ? 'First slide' : 'Add a slide'}
          url={undefined}
          onPick={(id, url) => {
            if (url) write([...urls, url], [...ids.slice(0, urls.length), id])
          }}
          onClear={() => undefined}
        />
      )}
      <p className="ve-row__help">Up to {MAX_SLIDES} images. The first image is the still picture for visitors who ask for reduced motion. Live page only: the editor shows the first image.</p>
      <FxRange k="slideInterval" label="Time per slide" unit="s" value={value} onChange={onChange} def={5} min={2} max={30} />
      <SelectRow
        label="Transition"
        value={value.slideTransition || 'fade'}
        options={SLIDE_TRANSITION_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        onChange={(v) => set('slideTransition', v === 'fade' ? undefined : (v as BlockStyle['slideTransition']))}
      />
      {resetBtn(['slideInterval', 'slideTransition'])}
    </>
  )
}

const ParallaxBgControls: React.FC<{ value: BlockStyle; onChange: (next: BlockStyle) => void }> = ({ value, onChange }) => {
  const { set, resetBtn } = makeFxEditing(value, onChange)
  const on = value.parallax === 'background'
  return (
    <>
      <CheckRow
        label="Parallax (image moves slower than the page)"
        checked={on}
        help={value.bgImageUrl ? undefined : 'Pick an image first: parallax moves the background image.'}
        onChange={(v) => set('parallax', v ? 'background' : undefined)}
      />
      {on && (
        <RangeRow
          label="Parallax strength"
          value={value.parallaxStrength ?? 40}
          min={0}
          max={100}
          help="How far the image drifts as you scroll"
          onChange={(v) => set('parallaxStrength', v)}
        />
      )}
      {on && (
        <>
          <FxRange k="parallaxDistance" label="Travel" unit="px" value={value} onChange={onChange} def={Math.round((value.parallaxStrength ?? 40) * 1.6)} min={0} max={400} help="Overrides strength with an exact distance." />
          <SelectRow
            label="Direction"
            value={value.parallaxDirection || 'up'}
            options={[
              { label: 'Up (slower than page)', value: 'up' },
              { label: 'Down (reversed)', value: 'down' },
            ]}
            onChange={(v) => set('parallaxDirection', v === 'down' ? 'down' : undefined)}
          />
          {resetBtn(['parallax', 'parallaxStrength', 'parallaxDistance', 'parallaxDirection'])}
        </>
      )}
    </>
  )
}

const BackgroundEffectControls: React.FC<{ value: BlockStyle; onChange: (next: BlockStyle) => void }> = ({ value, onChange }) => {
  const { set, resetBtn } = makeFxEditing(value, onChange)
  const fx = value.bgEffect || 'none'
  const withColors = ['aurora', 'mesh', 'gradient-shift', 'dots', 'grid', 'particles'].includes(fx)
  const twoColors = ['aurora', 'mesh', 'gradient-shift'].includes(fx)
  const bgKeys: (keyof BlockStyle)[] = ['bgEffect', 'bgEffectColor', 'bgEffectColor2', 'bgEffectIntensity', 'particlesCount', 'particlesInteract',
    'particlesSizeMin', 'particlesSizeMax', 'particlesSpeed', 'particlesOpacity', 'particlesLinks', 'particlesLinkDistance', 'particlesInteractRadius', 'particlesShape',
    'dotSize', 'dotSpacing', 'gridSize', 'gridLineWidth', 'auroraBlur', 'auroraSize', 'auroraSpeed', 'gradientAngle', 'gradientSpeed', 'grainOpacity', 'grainSize']
  const r = { value, onChange }
  return (
    <div className="ve-divider-group">
      <SelectRow
        label="Background effect"
        value={fx}
        options={BG_EFFECT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        help="Animated or textured layer behind the content."
        onChange={(v) => set('bgEffect', v === 'none' ? undefined : (v as BlockStyle['bgEffect']))}
      />
      {fx !== 'none' && (
        <RangeRow label="Intensity" value={value.bgEffectIntensity ?? 50} min={0} max={100} help="How strong the effect looks." onChange={(v) => set('bgEffectIntensity', v)} />
      )}
      {withColors && (
        <ColorRow label={twoColors ? 'Effect colour 1' : 'Effect colour'} value={value.bgEffectColor} onChange={(v) => set('bgEffectColor', v)} />
      )}
      {twoColors && <ColorRow label="Effect colour 2" value={value.bgEffectColor2} onChange={(v) => set('bgEffectColor2', v)} />}
      {fx === 'particles' && (
        <>
          <RangeRow label="Particle count" value={value.particlesCount ?? 50} min={10} max={120} onChange={(v) => set('particlesCount', v)} />
          <SelectRow
            label="Mouse interaction"
            value={value.particlesInteract || 'repel'}
            options={PARTICLE_INTERACT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
            help="How particles react to the pointer."
            onChange={(v) => set('particlesInteract', v as BlockStyle['particlesInteract'])}
          />
          {(value.particlesInteract || 'repel') !== 'none' && (
            <FxRange k="particlesInteractRadius" label="Interaction radius" unit="px" def={120} min={40} max={400} {...r} />
          )}
          <FxRange k="particlesSizeMin" label="Size min" unit="px" def={1} min={0.5} max={10} step={0.5} {...r} />
          <FxRange k="particlesSizeMax" label="Size max" unit="px" def={2.8} min={0.5} max={12} step={0.5} {...r} />
          <FxRange k="particlesSpeed" label="Speed" unit="%" def={100} min={0} max={300} {...r} />
          <FxRange k="particlesOpacity" label="Opacity" unit="%" def={100} min={5} max={100} {...r} />
          <SelectRow
            label="Shape"
            value={value.particlesShape || 'circle'}
            options={[
              { label: 'Circle', value: 'circle' },
              { label: 'Square', value: 'square' },
            ]}
            onChange={(v) => set('particlesShape', v === 'square' ? 'square' : undefined)}
          />
          <CheckRow label="Link nearby particles" checked={Boolean(value.particlesLinks) || value.particlesInteract === 'connect'} onChange={(v) => set('particlesLinks', v || undefined)} />
          {(value.particlesLinks || value.particlesInteract === 'connect') && (
            <FxRange k="particlesLinkDistance" label="Link distance" unit="px" def={110} min={40} max={300} {...r} />
          )}
        </>
      )}
      {fx === 'dots' && (
        <>
          <FxRange k="dotSize" label="Dot size" unit="px" def={1.5} min={0.5} max={12} step={0.5} {...r} />
          <FxRange k="dotSpacing" label="Spacing" unit="px" def={22} min={8} max={120} {...r} />
        </>
      )}
      {fx === 'grid' && (
        <>
          <FxRange k="gridSize" label="Cell size" unit="px" def={36} min={12} max={200} {...r} />
          <FxRange k="gridLineWidth" label="Line width" unit="px" def={1} min={0.5} max={6} step={0.5} {...r} />
        </>
      )}
      {fx === 'aurora' && (
        <>
          <FxRange k="auroraBlur" label="Blur" unit="px" def={40} min={0} max={120} {...r} />
          <FxRange k="auroraSize" label="Spread" unit="%" def={30} min={0} max={100} {...r} />
          <FxRange k="auroraSpeed" label="Loop time" unit="s" def={18} min={4} max={80} help="Higher is slower." {...r} />
        </>
      )}
      {fx === 'gradient-shift' && (
        <>
          <FxRange k="gradientAngle" label="Angle" unit="deg" def={90} min={0} max={360} {...r} />
          <FxRange k="gradientSpeed" label="Loop time" unit="s" def={16} min={3} max={60} help="Higher is slower." {...r} />
        </>
      )}
      {fx === 'grain' && (
        <>
          <FxRange k="grainOpacity" label="Grain strength" unit="%" def={Math.round((value.bgEffectIntensity ?? 50) * 0.6)} min={0} max={100} {...r} />
          <FxRange k="grainSize" label="Grain size" unit="px" def={160} min={40} max={400} {...r} />
        </>
      )}
      {fx === 'particles' && (
        <>
        </>
      )}
      {resetBtn(bgKeys)}
    </div>
  )
}

/* Advanced (Elementor-style). Like Effects, these are base (desktop) values only, not responsive. */

const tfKey = (prefix: 'tf' | 'tfh', suffix: string) => `${prefix}${suffix}` as keyof BlockStyle

/** Transform rows shared by the Normal and Hover groups; `suffix` follows the 'tf' or 'tfh' prefix. */
const TRANSFORM_ROWS: { suffix: string; label: string; unit: string; min: number; max: number; def: number }[] = [
  { suffix: 'Rotate', label: 'Rotate', unit: 'deg', min: -360, max: 360, def: 0 },
  { suffix: 'Scale', label: 'Scale', unit: '%', min: 10, max: 300, def: 100 },
  { suffix: 'TranslateX', label: 'Move X', unit: 'px', min: -600, max: 600, def: 0 },
  { suffix: 'TranslateY', label: 'Move Y', unit: 'px', min: -600, max: 600, def: 0 },
  { suffix: 'SkewX', label: 'Skew X', unit: 'deg', min: -60, max: 60, def: 0 },
  { suffix: 'SkewY', label: 'Skew Y', unit: 'deg', min: -60, max: 60, def: 0 },
]

const FILTER_ROWS: { k: keyof BlockStyle; label: string; unit: string; min: number; max: number; def: number }[] = [
  { k: 'filterBlur', label: 'Blur', unit: 'px', min: 0, max: 40, def: 0 },
  { k: 'filterBrightness', label: 'Brightness', unit: '%', min: 0, max: 200, def: 100 },
  { k: 'filterContrast', label: 'Contrast', unit: '%', min: 0, max: 200, def: 100 },
  { k: 'filterSaturate', label: 'Saturate', unit: '%', min: 0, max: 300, def: 100 },
  { k: 'filterGrayscale', label: 'Grayscale', unit: '%', min: 0, max: 100, def: 0 },
  { k: 'filterHue', label: 'Hue rotate', unit: 'deg', min: 0, max: 360, def: 0 },
]

const ADVANCED_KEYS: (keyof BlockStyle)[] = [
  ...TRANSFORM_ROWS.map((r) => tfKey('tf', r.suffix)),
  ...TRANSFORM_ROWS.map((r) => tfKey('tfh', r.suffix)),
  'tfDuration', 'position', 'posTop', 'posRight', 'posBottom', 'posLeft', 'zIndex',
  'opacity', 'blendMode', ...FILTER_ROWS.map((r) => r.k), 'maskShape', 'blobMorphSpeed', 'cssClasses', 'customCss',
]

const AdvancedControls: React.FC<{ value: BlockStyle; onChange: (next: BlockStyle) => void }> = ({ value, onChange }) => {
  const { set, resetBtn } = makeFxEditing(value, onChange)
  const positioned = value.position !== undefined

  return (
    <>
      <p className="ve-row__label">Transform</p>
      <div className="ve-divider-group">
        <p className="ve-row__label">Normal</p>
        {TRANSFORM_ROWS.map((r) => (
          <FxRange key={r.suffix} k={tfKey('tf', r.suffix)} label={r.label} unit={r.unit} value={value} onChange={onChange} def={r.def} min={r.min} max={r.max} />
        ))}
      </div>
      <div className="ve-divider-group">
        <p className="ve-row__label">Hover</p>
        {TRANSFORM_ROWS.map((r) => (
          <FxRange key={r.suffix} k={tfKey('tfh', r.suffix)} label={r.label} unit={r.unit} value={value} onChange={onChange} def={r.def} min={r.min} max={r.max} />
        ))}
      </div>
      <FxRange k="tfDuration" label="Transition" unit="ms" value={value} onChange={onChange} def={250} min={0} max={2000} step={10} help="How long transform changes take." />

      <p className="ve-row__label">Position</p>
      <div className="ve-divider-group">
        <SelectRow
          label="Position"
          value={value.position ?? 'default'}
          options={[{ label: 'Default', value: 'default' }, ...POSITION_OPTIONS]}
          onChange={(v) => set('position', v === 'default' ? undefined : (v as BlockPosition))}
        />
        {positioned && (
          <>
            <FxRange k="posTop" label="Top" unit="px" value={value} onChange={onChange} def={0} min={-2000} max={2000} />
            <FxRange k="posRight" label="Right" unit="px" value={value} onChange={onChange} def={0} min={-2000} max={2000} />
            <FxRange k="posBottom" label="Bottom" unit="px" value={value} onChange={onChange} def={0} min={-2000} max={2000} />
            <FxRange k="posLeft" label="Left" unit="px" value={value} onChange={onChange} def={0} min={-2000} max={2000} />
          </>
        )}
        <NumberRow label="Z-index" value={value.zIndex} min={-10} max={9999} onChange={(v) => set('zIndex', v)} />
      </div>

      <p className="ve-row__label">Appearance</p>
      <div className="ve-divider-group">
        <FxRange k="opacity" label="Opacity" unit="%" value={value} onChange={onChange} def={100} min={0} max={100} />
        <SelectRow
          label="Blend mode"
          value={value.blendMode ?? 'normal'}
          options={BLEND_MODE_OPTIONS}
          onChange={(v) => set('blendMode', v === 'normal' ? undefined : (v as BlendMode))}
        />
        {FILTER_ROWS.map((r) => (
          <FxRange key={String(r.k)} k={r.k} label={r.label} unit={r.unit} value={value} onChange={onChange} def={r.def} min={r.min} max={r.max} />
        ))}
      </div>

      <p className="ve-row__label">Mask</p>
      <div className="ve-divider-group">
        <SelectRow
          label="Shape"
          value={value.maskShape ?? 'none'}
          options={MASK_SHAPE_OPTIONS}
          help="Clips the whole block, background and content, to this shape."
          onChange={(v) => set('maskShape', v === 'none' ? undefined : (v as MaskShape))}
        />
        {value.maskShape === 'blob-morph' && (
          <>
            <SelectRow
              label="Blob speed"
              value={value.blobMorphSpeed || 'medium'}
              options={BLOB_SPEED_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
              help="Live page only: the editor shows the resting shape. Static for reduced motion."
              onChange={(v) => set('blobMorphSpeed', v === 'medium' ? undefined : (v as BlockStyle['blobMorphSpeed']))}
            />
          </>
        )}
        {resetBtn(['maskShape', 'blobMorphSpeed'])}
      </div>

      <p className="ve-row__label">Custom</p>
      <div className="ve-divider-group">
        <TextRow
          label="CSS classes"
          value={value.cssClasses}
          placeholder="e.g. hero-card shadowed"
          help="Up to 8 class names separated by spaces. Letters, digits, - and _ only."
          onChange={(v) => set('cssClasses', v)}
        />
        <Row label="Custom CSS" help="Use selector to target this element, e.g. selector:hover { opacity: .8 }">
          <textarea
            rows={6}
            maxLength={4000}
            value={value.customCss ?? ''}
            onChange={(e) => set('customCss', e.target.value || undefined)}
          />
        </Row>
      </div>

      {ADVANCED_KEYS.some((k) => value[k] !== undefined) && (
        <button
          type="button"
          className="ve-btn ve-btn--ghost"
          onClick={() => {
            const updated = { ...value }
            for (const k of ADVANCED_KEYS) delete updated[k]
            onChange(updated)
          }}
        >
          Reset advanced
        </button>
      )}
    </>
  )
}

const EffectsControls: React.FC<{ value: BlockStyle; onChange: (next: BlockStyle) => void }> = ({ value, onChange }) => {
  const { set, resetBtn } = makeFxEditing(value, onChange)
  const scroll = value.parallax === 'float-up' || value.parallax === 'float-down' ? value.parallax : 'none'

  return (
    <>
      <div className="ve-divider-group">
        <SelectRow
          label="Scroll motion"
          value={scroll}
          options={[
            { label: 'None', value: 'none' },
            { label: 'Float up', value: 'float-up' },
            { label: 'Float down', value: 'float-down' },
          ]}
          help="Moves the section content slightly as it scrolls through the screen. Background parallax is under Background. The two share one setting, so only one applies."
          onChange={(v) => set('parallax', v === 'none' ? undefined : (v as BlockStyle['parallax']))}
        />
        {scroll !== 'none' && (
          <>
            <RangeRow label="Strength" value={value.parallaxStrength ?? 40} min={0} max={100} help="How far it moves as you scroll." onChange={(v) => set('parallaxStrength', v)} />
            <FxRange k="parallaxDistance" label="Travel" unit="px" value={value} onChange={onChange} def={Math.round((value.parallaxStrength ?? 40) * 1.6)} min={0} max={400} help="Overrides strength with an exact distance." />
          </>
        )}
        {resetBtn(['parallax', 'parallaxStrength', 'parallaxDistance'])}
      </div>

      <div className="ve-divider-group">
        <SelectRow
          label="Entrance animation"
          value={value.reveal || 'none'}
          options={REVEAL_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          help="Plays as the section scrolls into view. Pure CSS, no scripts."
          onChange={(v) => set('reveal', v === 'none' ? undefined : (v as BlockStyle['reveal']))}
        />
        {value.reveal && value.reveal !== 'none' && (
          <>
            {value.reveal !== 'fade' && <FxRange k="revealDistance" label="Distance" unit="px" value={value} onChange={onChange} def={32} min={0} max={200} />}
            <FxRange k="revealDuration" label="Duration" unit="% of scroll-in" value={value} onChange={onChange} def={40} min={5} max={100} help="Scroll-linked, so this is how much of the scroll-in the animation spans." />
            <FxRange k="revealDelay" label="Delay" unit="%" value={value} onChange={onChange} def={0} min={0} max={60} />
            <SelectRow
              label="Easing"
              value={value.revealEasing || 'linear'}
              options={REVEAL_EASING_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
              onChange={(v) => set('revealEasing', v === 'linear' ? undefined : (v as BlockStyle['revealEasing']))}
            />
          </>
        )}
        {resetBtn(['reveal', 'revealDistance', 'revealDuration', 'revealDelay', 'revealEasing'])}
      </div>

      <div className="ve-divider-group">
        <SelectRow
          label="Hover effect"
          value={value.hover || 'none'}
          options={HOVER_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          help="How the section reacts when the pointer is over it."
          onChange={(v) => set('hover', v === 'none' ? undefined : (v as BlockStyle['hover']))}
        />
        {value.hover === 'lift' && <FxRange k="hoverLift" label="Lift" unit="px" value={value} onChange={onChange} def={4} min={0} max={40} />}
        {(value.hover === 'lift' || value.hover === 'zoom') && (
          <FxRange k="hoverScale" label="Scale" unit="%" value={value} onChange={onChange} def={value.hover === 'zoom' ? 102 : 100} min={100} max={120} />
        )}
        {resetBtn(['hover', 'hoverLift', 'hoverScale'])}
      </div>

      <div className="ve-divider-group">
        <CheckRow
          label="Glass"
          checked={Boolean(value.glass)}
          help="Frosted-glass look. Works best over an image or gradient."
          onChange={(v) => set('glass', v || undefined)}
        />
        {value.glass && (
          <>
            <RangeRow label="Blur (px)" value={value.glassBlur ?? 12} min={0} max={40} onChange={(v) => set('glassBlur', v)} />
            <FxRange k="glassOpacity" label="Tint" unit="%" value={value} onChange={onChange} def={18} min={0} max={100} />
            <FxRange k="glassBorder" label="Border" unit="%" value={value} onChange={onChange} def={30} min={0} max={100} />
          </>
        )}
        {resetBtn(['glass', 'glassBlur', 'glassOpacity', 'glassBorder'])}
      </div>

      <div className="ve-divider-group">
        <SelectRow
          label="Pointer effect"
          value={value.pointerFx || 'none'}
          options={POINTER_FX_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          help="Reacts to the mouse over the block. Desktop only: touch and reduced-motion visitors see no effect. Spotlight is a glow, tilt a 3D lean, magnetic a pull toward the pointer."
          onChange={(v) => set('pointerFx', v === 'none' ? undefined : (v as BlockStyle['pointerFx']))}
        />
        {value.pointerFx && value.pointerFx !== 'none' && (
          <FxRange k="pointerFxStrength" label="Strength" unit="%" value={value} onChange={onChange} def={50} min={0} max={100} help="Tilt angle, magnetic pull and spotlight size." />
        )}
        {value.pointerFx === 'spotlight' && (
          <ColorRow label="Spotlight colour" value={value.spotlightColor} onChange={(v) => set('spotlightColor', v)} />
        )}
        {resetBtn(['pointerFx', 'pointerFxStrength', 'spotlightColor'])}
      </div>

      <div className="ve-divider-group">
        <SelectRow
          label="Ken Burns"
          value={value.kenBurns || 'none'}
          options={KEN_BURNS_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          help={value.bgType === 'image' ? 'Slowly zooms or pans the background image. Pure CSS; off for reduced motion.' : 'Needs an image background (Background: Image).'}
          onChange={(v) => set('kenBurns', v === 'none' ? undefined : (v as BlockStyle['kenBurns']))}
        />
        {value.kenBurns && value.kenBurns !== 'none' && (
          <FxRange k="kenBurnsDuration" label="Cycle" unit="s" value={value} onChange={onChange} def={20} min={5} max={60} help="Seconds for one full cycle. Higher is slower." />
        )}
        {resetBtn(['kenBurns', 'kenBurnsDuration'])}
      </div>

      <div className="ve-divider-group">
        <SelectRow
          label="Animated border"
          value={value.borderFx || 'none'}
          options={BORDER_FX_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          help="A ring around the block. It is drawn over the edge, so the block keeps its size."
          onChange={(v) => set('borderFx', v === 'none' ? undefined : (v as BlockStyle['borderFx']))}
        />
        {value.borderFx && value.borderFx !== 'none' && (
          <>
            <ColorRow label={value.borderFx === 'conic-spin' ? 'Colour 1' : 'Colour'} value={value.borderFxColor} onChange={(v) => set('borderFxColor', v)} />
            {value.borderFx === 'conic-spin' && (
              <ColorRow label="Colour 2" value={value.borderFxColor2} onChange={(v) => set('borderFxColor2', v)} />
            )}
            <FxRange k="borderFxWidth" label="Width" unit="px" value={value} onChange={onChange} def={2} min={1} max={8} />
            <FxRange k="borderFxSpeed" label="Speed" unit="s" value={value} onChange={onChange} def={8} min={2} max={20} help="Seconds per turn or pulse. Lower is faster." />
          </>
        )}
        {resetBtn(['borderFx', 'borderFxColor', 'borderFxColor2', 'borderFxWidth', 'borderFxSpeed'])}
      </div>
    </>
  )
}
