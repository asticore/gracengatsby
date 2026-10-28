'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings'
import React, { createContext, useContext, useState } from 'react'

import {
  BLEND_MODE_OPTIONS,
  BOX_SHADOW_OPTIONS,
  FONT_TOKEN_OPTIONS,
  RADIUS_CORNER_KEYS,
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
  type HoverTransformPreset,
  type DeviceOverride,
  type DividerAnim,
  type DividerShape,
  type MaskShape,
  type ResponsiveKey,
  isSafeMediaUrl,
} from '@/lib/blockStyle'
import { isIsoDate } from '@/lib/visibilityRules'
import { BUILT_IN_FONTS } from '@/features/fonts/installed'
import { useSiteFonts } from './useSiteFonts'

import { MediaPicker } from './MediaPicker'
import { DESIGN_STATES, HOVER_TRANSFORM_OPTIONS, STATE_KEYS, stateModified, type DesignState } from './designStates'
import {
  GROUP_KEYS,
  GROUP_SEARCH,
  clearDeviceOverrides,
  copyDesktopToDevice,
  groupModified,
  hasDeviceOverrides,
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
  const t = useAdminT()
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
          placeholder={t('dp.search')}
          aria-label={t('dp.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="ve-d51-only">
          <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
          <span>{t('dp.onlyChanged')}</span>
        </label>
      </div>
      <div className="ve-d51-devbar" role="group" aria-label={t('dp.device.overrides')}>
        {(['tablet', 'mobile'] as const).map((d) => (
          <button
            key={`copy-${d}`}
            type="button"
            className="ve-btn ve-btn--ghost"
            onClick={() => onChange(copyDesktopToDevice(value, d))}
            title={`Copy the desktop values of the responsive settings into the ${d} overrides`}
          >
            Copy desktop to {d}
          </button>
        ))}
        {(['tablet', 'mobile'] as const).some((d) => hasDeviceOverrides(value, d)) && (
          <span className="ve-d51-badge" title={t('dp.device.differ')}>
            <span className="ve-d51-dot" aria-hidden="true" />
            Overrides{(['tablet', 'mobile'] as const).filter((d) => hasDeviceOverrides(value, d)).map((d) => ` ${d}`).join(',')}
          </span>
        )}
        {device !== 'desktop' && hasDeviceOverrides(value, device) && (
          <button type="button" className="ve-d51-reset" onClick={() => onChange(clearDeviceOverrides(value, device))}>
            Clear overrides for this device
          </button>
        )}
      </div>
      <Acc g="background" title={t('dp.section.background')} defaultOpen>
        <SelectRow
          label={t('dp.field.type')}
          value={value.bgType || 'none'}
          options={[
            { label: t('dp.opt.none'), value: 'none' },
            { label: t('dp.lit.solid_colour'), value: 'color' },
            { label: t('dp.opt.gradient'), value: 'gradient' },
            { label: t('dp.lit.image'), value: 'image' },
            { label: t('dp.lit.video'), value: 'video' },
            { label: t('dp.lit.slideshow'), value: 'slideshow' },
          ]}
          onChange={(v) => set('bgType', v === 'none' ? undefined : (v as BlockStyle['bgType']))}
        />

        {value.bgType === 'color' && (
          <ColorRow label={t('dp.field.colour')} value={value.bgColor} onChange={(v) => set('bgColor', v)} />
        )}

        {value.bgType === 'gradient' && (
          <>
            <ColorRow label={t('dp.field.from')} value={value.bgGradientFrom} onChange={(v) => set('bgGradientFrom', v)} />
            <ColorRow label={t('dp.field.to')} value={value.bgGradientTo} onChange={(v) => set('bgGradientTo', v)} />
            <NumberRow
              label={t('dp.field.angle_deg')}
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
              label={t('dp.field.image')}
              url={value.bgImageUrl}
              onPick={(id, url) => onChange({ ...value, bgImage: id, bgImageUrl: url })}
              onClear={() => onChange({ ...value, bgImage: null, bgImageUrl: null })}
            />
            <NumberRow
              label={t('dp.field.dark_overlay')}
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
              label={t('dp.field.video_url')}
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
              label={t('dp.field.poster_image')}
              url={value.bgVideoPoster}
              onPick={(_id, url) => set('bgVideoPoster', url)}
              onClear={() => set('bgVideoPoster', undefined)}
            />
            <CheckRow
              label={t('dp.field.loop')}
              checked={value.bgVideoLoop !== false}
              help={t('dp.lit.turn_off_to_play_once_and_hold_the_last')}
              onChange={(v) => set('bgVideoLoop', v ? undefined : false)}
            />
          </>
        )}

        {value.bgType !== 'image' && value.parallax === 'background' && (
          <p className="ve-row__help">{t('dp.lit.parallax_needs_the_background_type_set_t')}</p>
        )}

        <p className="ve-row__label">{t('dp.field.overlay')}</p>
        <SelectRow
          label={t('dp.field.type')}
          value={value.overlayType || 'none'}
          options={[
            { label: t('dp.opt.none'), value: 'none' },
            { label: t('dp.lit.colour'), value: 'color' },
            { label: t('dp.opt.gradient'), value: 'gradient' },
          ]}
          onChange={(v) => set('overlayType', v === 'none' ? undefined : (v as BlockStyle['overlayType']))}
        />
        {value.overlayType === 'color' && (
          <ColorRow label={t('dp.field.colour')} value={value.overlayColor} onChange={(v) => set('overlayColor', v)} />
        )}
        {value.overlayType === 'gradient' && (
          <>
            <ColorRow label={t('dp.field.from')} value={value.overlayColor} onChange={(v) => set('overlayColor', v)} />
            <ColorRow label={t('dp.field.to')} value={value.overlayColor2} onChange={(v) => set('overlayColor2', v)} />
            <NumberRow
              label={t('dp.field.angle_deg')}
              value={value.overlayAngle}
              onChange={(v) => set('overlayAngle', v)}
              min={0}
              max={360}
            />
          </>
        )}
        {value.overlayType && value.overlayType !== 'none' && (
          <>
            <FxRange k="overlayOpacity" label={t('dp.field.opacity')} unit="%" value={value} onChange={onChange} def={50} min={0} max={100} />
            <SelectRow
              label={t('dp.field.blend_mode')}
              value={value.overlayBlend || 'normal'}
              options={[
                { label: t('dp.opt.normal'), value: 'normal' },
                { label: t('dp.lit.multiply'), value: 'multiply' },
                { label: t('dp.lit.screen'), value: 'screen' },
                { label: t('dp.lit.overlay'), value: 'overlay' },
                { label: t('dp.lit.soft_light'), value: 'soft-light' },
                { label: t('dp.lit.colour'), value: 'color' },
                { label: t('dp.lit.luminosity'), value: 'luminosity' },
              ]}
              onChange={(v) => set('overlayBlend', v === 'normal' ? undefined : (v as BlockStyle['overlayBlend']))}
            />
          </>
        )}

        <FxRange k="noise" label={t('dp.field.noise')} unit="%" value={value} onChange={onChange} def={0} min={0} max={100} help={t('dp.lit.film_grain_over_the_background_and_gradi')} />

        {variant === 'block' && (
          <>
            <p className="ve-row__label">{t('dp.field.animated_background')}</p>
            <BackgroundEffectControls value={value} onChange={onChange} />
          </>
        )}
      </Acc>

      <Acc g="hover" title={t('dp.section.hover')}>
        <StateTabs value={value} onChange={onChange} />
      </Acc>

      <Acc g="spacing" title={t('dp.section.spacing')} defaultOpen={device !== 'desktop'}>
        <UnitRow ctl={resp} k="paddingUnit" label={t('dp.lit.padding_unit')} />
        <LinkedSides ctl={resp} keys={PADDING_SIDE_KEYS} noun="Padding" min={0} />
        <HeightRows ctl={resp} />
        <UnitRow ctl={resp} k="marginUnit" label={t('dp.lit.margin_unit')} />
        <LinkedSides ctl={resp} keys={MARGIN_SIDE_KEYS} noun="Margin" />
      </Acc>

      <Acc g="border" title={t('dp.section.border')}>
        <NumberRow
          label={t('dp.field.border_width_px')}
          value={value.borderWidth}
          onChange={(v) => set('borderWidth', v)}
          min={0}
        />
        {Boolean(value.borderWidth) && (
          <>
            <SelectRow
              label={t('dp.field.border_style')}
              value={value.borderStyle || 'solid'}
              options={[
                { label: t('dp.lit.solid'), value: 'solid' },
                { label: t('dp.lit.dashed'), value: 'dashed' },
                { label: t('dp.lit.dotted'), value: 'dotted' },
              ]}
              onChange={(v) => set('borderStyle', v as BlockStyle['borderStyle'])}
            />
            <ColorRow label={t('dp.field.border_colour')} value={value.borderColor} onChange={(v) => set('borderColor', v)} />
          </>
        )}
        <NumberRow label={t('dp.field.corner_radius_px')} value={value.borderRadius} onChange={(v) => set('borderRadius', v)} min={0} />
        <RadiusCorners ctl={resp} linked={value.radiusLinked === true} onLinked={(b) => set('radiusLinked', b ? true : undefined)} />
        <SelectRow
          label={t('dp.field.shadow')}
          value={value.boxShadow || 'none'}
          options={BOX_SHADOW_OPTIONS}
          onChange={(v) => set('boxShadow', v === 'none' ? undefined : (v as BlockStyle['boxShadow']))}
        />
      </Acc>

      <Acc g="layout" title={t('dp.section.layout')}>
        {variant === 'block' && (
          <SelectRow
            label={t('dp.field.width')}
            value={value.width || 'contained'}
            options={[
              { label: t('dp.lit.contained'), value: 'contained' },
              { label: t('dp.lit.wide'), value: 'wide' },
              { label: t('dp.opt.fullWidth'), value: 'full' },
            ]}
            onChange={(v) => set('width', v as BlockStyle['width'])}
          />
        )}
        <RespSelect
          ctl={resp}
          k="textAlign"
          label={t('dp.field.text_alignment')}
          options={[
            { label: t('dp.lit.left'), value: 'left' },
            { label: t('dp.opt.centre'), value: 'center' },
            { label: t('dp.lit.right'), value: 'right' },
          ]}
          defaultLabel={t('dp.lit.default')}
        />
        <ColorRow label={t('dp.field.text_colour')} value={value.textColor} onChange={(v) => set('textColor', v)} />
      </Acc>

      <Acc g="typography" title={t('dp.section.typography')}>
        <TypographyControls value={value} onChange={onChange} ctl={resp} />
      </Acc>

      {variant === 'block' && (
        <Acc g="position" title={t('dp.section.position')}>
          <RespSelect
            ctl={resp}
            k="selfAlign"
            label={t('dp.lit.align_self')}
            options={[
              { label: t('dp.lit.stretch_fill_the_column'), value: 'stretch' },
              { label: t('dp.lit.left_start'), value: 'start' },
              { label: t('dp.opt.centre'), value: 'center' },
              { label: t('dp.lit.right_end'), value: 'end' },
            ]}
            defaultLabel={t('dp.lit.default')}
          />
          <RespSelect
            ctl={resp}
            k="selfWidth"
            label={t('dp.field.width')}
            options={[
              { label: t('dp.opt.fullWidth'), value: 'full' },
              { label: t('dp.lit.custom'), value: 'custom' },
            ]}
            defaultLabel={t('dp.lit.automatic')}
          />
          {resp.effective('selfWidth') === 'custom' && (
            <>
              <RespNumber ctl={resp} k="selfWidthPercent" label={t('dp.lit.custom_width')} min={1} />
              <UnitRow ctl={resp} k="selfWidthPercentUnit" label={t('dp.lit.width_unit')} def="%" />
            </>
          )}
        </Acc>
      )}

      {variant === 'block' && (
      <Acc g="dividers" title={t('dp.section.dividers')}>
        <DividerControls
          label={t('dp.field.top')}
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
          label={t('dp.field.bottom')}
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
        <Acc g="effects" title={t('dp.section.effects')}>
          <EffectsControls value={value} onChange={onChange} />
        </Acc>
      )}

      <Acc g="advanced" title={t('dp.section.advanced')}>
        <AdvancedControls value={value} onChange={onChange} />
      </Acc>

      <Acc g="conditions" title={t('dp.section.visibilityRules')}>
        <ConditionControls value={value} onChange={onChange} />
      </Acc>

      <Acc g="visibility" title={t('dp.section.visibility')}>
        <CheckRow
          label={`Hide on ${device}`}
          checked={Boolean(resp.own('hide'))}
          onChange={(v) => resp.set('hide', v || undefined)}
          resp={{ device, overridden: false }}
        />
        <TextRow
          label={t('dp.lit.anchor_id')}
          value={value.anchorId}
          placeholder="e.g. pricing"
          help={t('dp.lit.link_straight_to_this_section_with_your')}
          onChange={(v) => set('anchorId', v.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^[^A-Za-z]+/, '').slice(0, 64) || undefined)}
        />
        <TextRow
          label={t('dp.lit.extra_css_class')}
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
  const t = useAdminT()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`ve-acc ${open ? 've-acc--open' : ''}`}>
      <button type="button" className="ve-acc__head" onClick={() => setOpen(!open)}>
        <span>
          {title}
          {modified && <span className="ve-d51-dot" title={t('dp.changed')} aria-label={t('dp.changed')} />}
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

const Row: React.FC<{ label: string; help?: string; resp?: RowResp; children: React.ReactNode }> = ({ label, help, resp, children }) => {
  const t = useAdminT()
  return (
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
          title={t('dp.resetInherited')}
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
}

const ConditionControls: React.FC<{ value: BlockStyle; onChange: (next: BlockStyle) => void }> = ({ value, onChange }) => {
  const t = useAdminT()
  const set = (patch: Partial<BlockStyle>) => onChange({ ...value, ...patch })
  return (
    <>
      <p className="ve-row__help">
        Show this block only when every rule below passes. Rules about who is viewing (logged in or out, roles, URL) are checked in the
        browser, so the block stays hidden for visitors without JavaScript and for crawlers. A date window alone is shown without
        JavaScript. To hide by screen size use Hide on device below.
      </p>
      <TextRow
        label={t('dp.lit.show_from')}
        value={value.showFrom}
        placeholder="YYYY-MM-DD"
        help={value.showFrom && !isIsoDate(value.showFrom) ? t('dp.lit.not_a_valid_date_yet_ignored_until_it_is') : t('dp.lit.date_2026_12_01_or_date_and_time_2026_12')}
        onChange={(v) => set({ showFrom: v ? v.slice(0, 32) : undefined })}
      />
      <TextRow
        label={t('dp.lit.show_until')}
        value={value.showUntil}
        placeholder="YYYY-MM-DD"
        help={value.showUntil && !isIsoDate(value.showUntil) ? t('dp.lit.not_a_valid_date_yet_ignored_until_it_is') : t('dp.lit.a_date_alone_includes_the_whole_day')}
        onChange={(v) => set({ showUntil: v ? v.slice(0, 32) : undefined })}
      />
      <SelectRow
        label={t('dp.lit.visitor')}
        value={value.showAuth || 'any'}
        options={[
          { label: t('dp.lit.anyone'), value: 'any' },
          { label: t('dp.lit.logged_in_only'), value: 'in' },
          { label: t('dp.lit.logged_out_only'), value: 'out' },
        ]}
        onChange={(v) => set({ showAuth: v === 'in' || v === 'out' ? v : undefined })}
      />
      <TextRow
        label={t('dp.lit.roles')}
        value={value.showRoles}
        placeholder="customer, editor"
        help={t('dp.lit.comma_list_of_role_slugs_any_one_match_s')}
        onChange={(v) => set({ showRoles: v ? v.slice(0, 200) : undefined })}
      />
      <TextRow
        label={t('dp.lit.url_contains')}
        value={value.showUrl}
        placeholder="/pricing or ?ref=news"
        help={t('dp.lit.text_the_page_path_or_query_string_must')}
        onChange={(v) => set({ showUrl: v ? v.slice(0, 120) : undefined })}
      />
    </>
  )
}

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

const CORNER_LABELS = ['top left', 'top right', 'bottom right', 'bottom left']

/** Per-corner radius: four inputs, or one when linked (one value writes every corner in a single update). */
const RadiusCorners: React.FC<{ ctl: ResponsiveCtl; linked: boolean; onLinked: (b: boolean) => void }> = ({ ctl, linked, onLinked }) => {
  const t = useAdminT()
  const { same, value } = linkedValue(RADIUS_CORNER_KEYS.map((k) => ctl.own(k)))
  return (
    <>
      <CheckRow label={t('dp.lit.link_all_corners')} checked={linked} onChange={onLinked} />
      {linked ? (
        <NumberRow
          label={t('dp.lit.radius_all_corners_px')}
          value={value}
          placeholder={same ? undefined : 'mixed'}
          min={0}
          resp={ctl.resp(RADIUS_CORNER_KEYS[0])}
          onChange={(v) => ctl.setMany(linkedPatch(RADIUS_CORNER_KEYS, v))}
        />
      ) : (
        RADIUS_CORNER_KEYS.map((k, i) => <RespNumber key={k} ctl={ctl} k={k} label={`Radius ${CORNER_LABELS[i]} (px)`} min={0} />)
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
  const t = useAdminT()
  const own = ctl.own(k)
  const inherited = ctl.inherited(k)
  const inheritedLabel = options.find((o) => o.value === inherited)?.label ?? defaultLabel
  const first = ctl.device === 'desktop' ? defaultLabel : t('dp.lit.inherited_from_device_value', { device: t(inheritNote(ctl.device) === 'tablet' ? 'dp.lit.tablet' : 'dp.lit.desktop'), value: inheritedLabel })
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
  const t = useAdminT()
  const minHeight = ctl.own('minHeight')
  const unit = ctl.own('minHeightUnit')
  const inheritedHeight = ctl.inherited('minHeight')
  const effectiveHeight = ctl.effective('minHeight')
  const effectiveUnit = ctl.effective('minHeightUnit')
  const mode = (h: unknown, u: unknown) => (typeof h !== 'number' || h <= 0 ? 'default' : u === 'vh' && h === 100 ? 'screen' : 'min')
  const current = ctl.device === 'desktop' ? mode(minHeight, unit) : typeof minHeight === 'number' ? mode(minHeight, unit) : 'inherit'
  const label = (m: string) => (m === 'screen' ? t('dp.opt.fitScreen') : m === 'min' ? t('dp.opt.minHeight') : t('dp.opt.default'))
  const options = [
    ...(ctl.device === 'desktop'
      ? []
      : [{ label: t('dp.lit.inherited_from_device_value', { device: t(inheritNote(ctl.device) === 'tablet' ? 'dp.lit.tablet' : 'dp.lit.desktop'), value: label(mode(inheritedHeight, ctl.inherited('minHeightUnit'))) }), value: 'inherit' }]),
    { label: t('dp.opt.default'), value: 'default' },
    { label: t('dp.opt.minHeight'), value: 'min' },
    { label: t('dp.opt.fitScreen'), value: 'screen' },
  ]
  return (
    <>
      <SelectRow
        label={t('dp.lit.height')}
        value={current}
        options={options}
        help={t('dp.lit.fit_to_screen_makes_the_section_at_least')}
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
          <RespNumber ctl={ctl} k="minHeight" label={t('dp.lit.minimum_height')} min={0} />
          <UnitRow ctl={ctl} k="minHeightUnit" label={t('dp.lit.height_unit')} />
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
  const t = useAdminT()
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
          title={t('dp.theme.pick')}
          aria-label={t('dp.theme.label')}
          onClick={(e) => {
            e.preventDefault()
            setTokens((cur) => (cur ? null : readColourTokens(document)))
          }}
        >
          Theme
        </button>
        {value && (
          <button type="button" className="ve-color__clear" onClick={() => onChange(undefined)} aria-label={t('dp.color.clear')}>
            &#10005;
          </button>
        )}
      </div>
      {tokens && (
        <div className="ve-d51-tokens">
          {tokens.length === 0 && <span className="ve-row__help">{t('dp.theme.none')}</span>}
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
  const t = useAdminT()
  const [open, setOpen] = useState(false)
  return (
    <Row label={label}>
      <div className="ve-media-field">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="ve-media-field__thumb" />
        ) : (
          <div className="ve-media-field__empty">{t('dp.noImage')}</div>
        )}
        <div className="ve-media-field__actions">
          <button type="button" className="ve-btn ve-btn--ghost" onClick={() => setOpen(true)}>
            {url ? t('dp.lit.change') : t('dp.lit.choose')}
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
}> = ({ label, shape, color, height, flip, anim, speed, onAnim, onSpeed, onShape, onColor, onHeight, onFlip }) => {
  const t = useAdminT()
  return (
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
          help={t('dp.lit.gently_moves_the_divider_pure_css')}
          onChange={(v) => onAnim(v === 'none' ? undefined : (v as DividerAnim))}
        />
        {anim && anim !== 'none' && (
          <RangeRow label={t('dp.lit.speed_seconds')} value={speed ?? 20} min={4} max={60} help={t('dp.lit.time_for_one_full_cycle_higher_is_slower')} onChange={(v) => onSpeed(v)} />
        )}
      </>
    )}
  </div>
  )
}

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
}> = ({ label, options, current, onPick }) => {
  const t = useAdminT()
  return (
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
        <button type="button" className="ve-btn ve-btn--ghost" title={t('dp.reset')} aria-label={`Reset ${label}`} onClick={(e) => { e.preventDefault(); onPick(undefined) }}>
          {String.fromCharCode(0x21BA)}
        </button>
      )}
    </div>
  </Row>
  )
}

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
  const t = useAdminT()
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
            title={t('dp.resetDefault')}
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
  const t = useAdminT()
  const siteFonts = useSiteFonts()
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
        label={t('dp.field.family')}
        value={value.fontFamily || ''}
        options={[
          { label: t('dp.lit.site_default'), value: '' },
          ...FONT_TOKEN_OPTIONS,
          ...BUILT_IN_FONTS.map((font) => ({ label: font.label, value: font.value })),
          ...siteFonts.map((font) => ({ label: `${font.family} (installed)`, value: `family:${font.family}` })),
        ]}
        onChange={(v) => patch({ fontFamily: v || undefined })}
      />
      <TypoRange
        ctl={ctl}
        k="fontSize"
        label={t('dp.field.size')}
        def={sizeRange.def}
        min={sizeRange.min}
        max={sizeRange.max}
        step={sizeRange.step}
        alsoReset={['fontSizeUnit']}
        unit={
          <select
            aria-label={t('dp.sizeUnit')}
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
        label={t('dp.field.weight')}
        value={value.fontWeight !== undefined ? String(value.fontWeight) : ''}
        options={[{ label: t('dp.opt.default'), value: '' }, ...WEIGHT_OPTIONS]}
        onChange={(v) => patch({ fontWeight: v ? Number(v) : undefined })}
      />
      <ToggleRow
        label={t('dp.field.transform')}
        current={value.textTransform}
        options={[
          { label: t('dp.opt.none'), value: 'none' },
          { label: 'AA', value: 'uppercase', title: t('dp.lit.uppercase') },
          { label: 'aa', value: 'lowercase', title: t('dp.lit.lowercase') },
          { label: 'Aa', value: 'capitalize', title: t('dp.lit.capitalize') },
        ]}
        onPick={(v) => patch({ textTransform: v })}
      />
      <ToggleRow
        label={t('dp.field.style')}
        current={value.fontStyle}
        options={[
          { label: t('dp.opt.normal'), value: 'normal' },
          { label: t('dp.lit.italic'), value: 'italic' },
        ]}
        onPick={(v) => patch({ fontStyle: v })}
      />
      <ToggleRow
        label={t('dp.field.decoration')}
        current={value.textDecoration}
        options={[
          { label: t('dp.opt.none'), value: 'none' },
          { label: t('dp.lit.underline'), value: 'underline' },
          { label: t('dp.lit.strike'), value: 'line-through', title: t('dp.lit.line_through') },
        ]}
        onPick={(v) => patch({ textDecoration: v })}
      />
      <TypoRange ctl={ctl} k="lineHeight" label={t('dp.field.line_height')} def={1.5} min={0.8} max={3} step={0.05} />
      <TypoRange
        ctl={ctl}
        k="letterSpacing"
        label={t('dp.field.letter_spacing')}
        def={0}
        min={lsRange.min}
        max={lsRange.max}
        step={lsRange.step}
        unit={
          <select
            aria-label={t('dp.letterSpacingUnit')}
            value={lsUnit}
            onChange={(e) => patch({ letterSpacingUnit: e.target.value === 'em' ? 'em' : undefined })}
          >
            <option value="px">px</option>
            <option value="em">em</option>
          </select>
        }
      />
      <FxRange k="wordSpacing" label={t('dp.field.word_spacing')} unit="px" value={value} onChange={onChange} def={0} min={-10} max={50} />
      <SelectRow
        label={t('dp.field.text_shadow')}
        value={value.textShadow || 'none'}
        options={[
          { label: t('dp.opt.none'), value: 'none' },
          { label: t('dp.lit.small'), value: 'sm' },
          { label: t('dp.lit.medium'), value: 'md' },
          { label: t('dp.lit.large'), value: 'lg' },
        ]}
        onChange={(v) => patch({ textShadow: v === 'none' ? undefined : v })}
      />
      <SelectRow
        label={t('dp.field.text_effect')}
        help={t('dp.lit.applies_to_the_text_inside_this_block')}
        value={value.textFx || 'none'}
        options={TEXT_FX_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        onChange={(v) => patch({ textFx: v === 'none' ? undefined : v })}
      />
      {value.textFx === 'gradient' && (
        <>
          <ColorRow label={t('dp.field.colour_1')} value={value.textFxColor} onChange={(v) => patch({ textFxColor: v })} />
          <ColorRow label={t('dp.field.colour_2')} value={value.textFxColor2} onChange={(v) => patch({ textFxColor2: v })} />
          <FxRange k="textFxAngle" label={t('dp.field.gradient_angle')} unit="deg" value={value} onChange={onChange} def={90} min={0} max={360} />
          <CheckRow label={t('dp.field.animate_gradient')} checked={value.textFxAnimated === true} onChange={(v) => patch({ textFxAnimated: v ? true : undefined })} />
        </>
      )}
      {value.textFx === 'outline' && (
        <>
          <ColorRow label={t('dp.field.outline_colour')} value={value.textFxColor} onChange={(v) => patch({ textFxColor: v })} />
          <FxRange k="textFxStroke" label={t('dp.field.outline_width')} unit="px" value={value} onChange={onChange} def={2} min={1} max={6} step={0.5} />
        </>
      )}
      {value.textFx === 'shadow-glow' && (
        <ColorRow label={t('dp.field.glow_colour')} value={value.textFxColor} onChange={(v) => patch({ textFxColor: v })} />
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
/** Normal / Hover / Focus tabs for the "Hover & focus" accordion. */
const StateTabs: React.FC<{ value: BlockStyle; onChange: (next: BlockStyle) => void }> = ({ value, onChange }) => {
  const t = useAdminT()
  const [state, setState] = useState<DesignState>('hover')
  const set = <K extends keyof BlockStyle>(k: K, v: BlockStyle[K] | undefined) => {
    const next = { ...value } as Record<string, unknown>
    if (v === undefined || v === '') delete next[k]
    else next[k] = v
    onChange(next as BlockStyle)
  }
  return (
    <>
      <div role="tablist" aria-label={t('dp.state.label')} style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {DESIGN_STATES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={state === t.value}
            className={`ve-btn${state === t.value ? ' ve-btn--active' : ''}`}
            onClick={() => setState(t.value)}
          >
            {t.label}{stateModified(value, t.value) ? ` ${String.fromCharCode(0x2022)}` : ''}
          </button>
        ))}
      </div>
      {state === 'normal' && (
        <p className="ve-row__help">{t('dp.state.hint')}</p>
      )}
      {state === 'hover' && (
        <>
          <p className="ve-row__help">{t('dp.hover.hint')}</p>
          <ColorRow label={t('dp.field.background')} value={value.hoverBgColor} onChange={(v) => set('hoverBgColor', v)} />
          <ColorRow label={t('dp.field.text_colour')} value={value.hoverTextColor} onChange={(v) => set('hoverTextColor', v)} />
          <ColorRow label={t('dp.field.border_colour')} value={value.hoverBorderColor} onChange={(v) => set('hoverBorderColor', v)} />
          <SelectRow
            label={t('dp.field.shadow')}
            value={value.hoverBoxShadow || ''}
            options={[{ label: t('dp.lit.same_as_normal'), value: '' }, ...BOX_SHADOW_OPTIONS]}
            onChange={(v) => set('hoverBoxShadow', (v || undefined) as BlockStyle['hoverBoxShadow'])}
          />
          <SelectRow
            label={t('dp.field.transform')}
            value={value.hoverTransform || 'none'}
            options={HOVER_TRANSFORM_OPTIONS}
            onChange={(v) => set('hoverTransform', v === 'none' ? undefined : (v as HoverTransformPreset))}
          />
          <FxRange k="hoverOpacity" label={t('dp.field.opacity')} value={value} onChange={onChange} def={1} min={0} max={1} step={0.05} help={t('dp.lit.the_lift_scale_transform_is_skipped_for')} />
          <FxRange k="hoverBorderRadius" label={t('dp.lit.corner_radius')} unit="px" value={value} onChange={onChange} def={0} min={0} max={200} />
          <FxRange k="hoverTransitionMs" label={t('dp.field.transition')} unit="ms" value={value} onChange={onChange} def={150} min={0} max={2000} step={10} />
        </>
      )}
      {state === 'focus' && (
        <>
          <p className="ve-row__help">{t('dp.focus.hint')}</p>
          <ColorRow label={t('dp.field.focus_ring')} value={value.focusRing} onChange={(v) => set('focusRing', v)} />
        </>
      )}
      {makeFxEditing(value, onChange).resetBtn([...STATE_KEYS.hover, ...STATE_KEYS.focus])}
    </>
  )
}

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
  const t = useAdminT()
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
          <button type="button" className="ve-btn ve-btn--ghost" title={t('dp.resetDefault')} aria-label={`Reset ${label}`} onClick={() => write(undefined)}>
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
  const t = useAdminT()
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
          label={urls.length === 0 ? t('dp.lit.first_slide') : t('dp.lit.add_a_slide')}
          url={undefined}
          onPick={(id, url) => {
            if (url) write([...urls, url], [...ids.slice(0, urls.length), id])
          }}
          onClear={() => undefined}
        />
      )}
      <p className="ve-row__help">Up to {MAX_SLIDES} images. The first image is the still picture for visitors who ask for reduced motion. Live page only: the editor shows the first image.</p>
      <FxRange k="slideInterval" label={t('dp.lit.time_per_slide')} unit="s" value={value} onChange={onChange} def={5} min={2} max={30} />
      <SelectRow
        label={t('dp.field.transition')}
        value={value.slideTransition || 'fade'}
        options={SLIDE_TRANSITION_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        onChange={(v) => set('slideTransition', v === 'fade' ? undefined : (v as BlockStyle['slideTransition']))}
      />
      {resetBtn(['slideInterval', 'slideTransition'])}
    </>
  )
}

const ParallaxBgControls: React.FC<{ value: BlockStyle; onChange: (next: BlockStyle) => void }> = ({ value, onChange }) => {
  const t = useAdminT()
  const { set, resetBtn } = makeFxEditing(value, onChange)
  const on = value.parallax === 'background'
  return (
    <>
      <CheckRow
        label={t('dp.lit.parallax_image_moves_slower_than_the_pag')}
        checked={on}
        help={value.bgImageUrl ? undefined : 'Pick an image first: parallax moves the background image.'}
        onChange={(v) => set('parallax', v ? 'background' : undefined)}
      />
      {on && (
        <RangeRow
          label={t('dp.lit.parallax_strength')}
          value={value.parallaxStrength ?? 40}
          min={0}
          max={100}
          help={t('dp.lit.how_far_the_image_drifts_as_you_scroll')}
          onChange={(v) => set('parallaxStrength', v)}
        />
      )}
      {on && (
        <>
          <FxRange k="parallaxDistance" label={t('dp.lit.travel')} unit="px" value={value} onChange={onChange} def={Math.round((value.parallaxStrength ?? 40) * 1.6)} min={0} max={400} help={t('dp.lit.overrides_strength_with_an_exact_distanc')} />
          <SelectRow
            label={t('dp.lit.direction')}
            value={value.parallaxDirection || 'up'}
            options={[
              { label: t('dp.lit.up_slower_than_page'), value: 'up' },
              { label: t('dp.lit.down_reversed'), value: 'down' },
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
  const t = useAdminT()
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
        label={t('dp.lit.background_effect')}
        value={fx}
        options={BG_EFFECT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        help={t('dp.lit.animated_or_textured_layer_behind_the_co')}
        onChange={(v) => set('bgEffect', v === 'none' ? undefined : (v as BlockStyle['bgEffect']))}
      />
      {fx !== 'none' && (
        <RangeRow label={t('dp.lit.intensity')} value={value.bgEffectIntensity ?? 50} min={0} max={100} help={t('dp.lit.how_strong_the_effect_looks')} onChange={(v) => set('bgEffectIntensity', v)} />
      )}
      {withColors && (
        <ColorRow label={twoColors ? t('dp.lit.effect_colour_1') : t('dp.lit.effect_colour')} value={value.bgEffectColor} onChange={(v) => set('bgEffectColor', v)} />
      )}
      {twoColors && <ColorRow label={t('dp.lit.effect_colour_2')} value={value.bgEffectColor2} onChange={(v) => set('bgEffectColor2', v)} />}
      {fx === 'particles' && (
        <>
          <RangeRow label={t('dp.lit.particle_count')} value={value.particlesCount ?? 50} min={10} max={120} onChange={(v) => set('particlesCount', v)} />
          <SelectRow
            label={t('dp.lit.mouse_interaction')}
            value={value.particlesInteract || 'repel'}
            options={PARTICLE_INTERACT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
            help={t('dp.lit.how_particles_react_to_the_pointer')}
            onChange={(v) => set('particlesInteract', v as BlockStyle['particlesInteract'])}
          />
          {(value.particlesInteract || 'repel') !== 'none' && (
            <FxRange k="particlesInteractRadius" label={t('dp.lit.interaction_radius')} unit="px" def={120} min={40} max={400} {...r} />
          )}
          <FxRange k="particlesSizeMin" label={t('dp.lit.size_min')} unit="px" def={1} min={0.5} max={10} step={0.5} {...r} />
          <FxRange k="particlesSizeMax" label={t('dp.lit.size_max')} unit="px" def={2.8} min={0.5} max={12} step={0.5} {...r} />
          <FxRange k="particlesSpeed" label={t('dp.lit.speed')} unit="%" def={100} min={0} max={300} {...r} />
          <FxRange k="particlesOpacity" label={t('dp.field.opacity')} unit="%" def={100} min={5} max={100} {...r} />
          <SelectRow
            label={t('dp.lit.shape')}
            value={value.particlesShape || 'circle'}
            options={[
              { label: t('dp.lit.circle'), value: 'circle' },
              { label: t('dp.lit.square'), value: 'square' },
            ]}
            onChange={(v) => set('particlesShape', v === 'square' ? 'square' : undefined)}
          />
          <CheckRow label={t('dp.lit.link_nearby_particles')} checked={Boolean(value.particlesLinks) || value.particlesInteract === 'connect'} onChange={(v) => set('particlesLinks', v || undefined)} />
          {(value.particlesLinks || value.particlesInteract === 'connect') && (
            <FxRange k="particlesLinkDistance" label={t('dp.lit.link_distance')} unit="px" def={110} min={40} max={300} {...r} />
          )}
        </>
      )}
      {fx === 'dots' && (
        <>
          <FxRange k="dotSize" label={t('dp.lit.dot_size')} unit="px" def={1.5} min={0.5} max={12} step={0.5} {...r} />
          <FxRange k="dotSpacing" label={t('dp.lit.spacing')} unit="px" def={22} min={8} max={120} {...r} />
        </>
      )}
      {fx === 'grid' && (
        <>
          <FxRange k="gridSize" label={t('dp.lit.cell_size')} unit="px" def={36} min={12} max={200} {...r} />
          <FxRange k="gridLineWidth" label={t('dp.lit.line_width')} unit="px" def={1} min={0.5} max={6} step={0.5} {...r} />
        </>
      )}
      {fx === 'aurora' && (
        <>
          <FxRange k="auroraBlur" label={t('dp.lit.blur')} unit="px" def={40} min={0} max={120} {...r} />
          <FxRange k="auroraSize" label={t('dp.lit.spread')} unit="%" def={30} min={0} max={100} {...r} />
          <FxRange k="auroraSpeed" label={t('dp.lit.loop_time')} unit="s" def={18} min={4} max={80} help={t('dp.lit.higher_is_slower')} {...r} />
        </>
      )}
      {fx === 'gradient-shift' && (
        <>
          <FxRange k="gradientAngle" label={t('dp.lit.angle')} unit="deg" def={90} min={0} max={360} {...r} />
          <FxRange k="gradientSpeed" label={t('dp.lit.loop_time')} unit="s" def={16} min={3} max={60} help={t('dp.lit.higher_is_slower')} {...r} />
        </>
      )}
      {fx === 'grain' && (
        <>
          <FxRange k="grainOpacity" label={t('dp.lit.grain_strength')} unit="%" def={Math.round((value.bgEffectIntensity ?? 50) * 0.6)} min={0} max={100} {...r} />
          <FxRange k="grainSize" label={t('dp.lit.grain_size')} unit="px" def={160} min={40} max={400} {...r} />
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
const TRANSFORM_ROWS: { suffix: string; labelKey: UiStringKey; unit: string; min: number; max: number; def: number }[] = [
  { suffix: 'Rotate', labelKey: 'dp.lit.rotate', unit: 'deg', min: -360, max: 360, def: 0 },
  { suffix: 'Scale', labelKey: 'dp.lit.scale', unit: '%', min: 10, max: 300, def: 100 },
  { suffix: 'TranslateX', labelKey: 'dp.lit.move_x', unit: 'px', min: -600, max: 600, def: 0 },
  { suffix: 'TranslateY', labelKey: 'dp.lit.move_y', unit: 'px', min: -600, max: 600, def: 0 },
  { suffix: 'SkewX', labelKey: 'dp.lit.skew_x', unit: 'deg', min: -60, max: 60, def: 0 },
  { suffix: 'SkewY', labelKey: 'dp.lit.skew_y', unit: 'deg', min: -60, max: 60, def: 0 },
]

const FILTER_ROWS: { k: keyof BlockStyle; labelKey: UiStringKey; unit: string; min: number; max: number; def: number }[] = [
  { k: 'filterBlur', labelKey: 'dp.lit.blur', unit: 'px', min: 0, max: 40, def: 0 },
  { k: 'filterBrightness', labelKey: 'dp.lit.brightness', unit: '%', min: 0, max: 200, def: 100 },
  { k: 'filterContrast', labelKey: 'dp.lit.contrast', unit: '%', min: 0, max: 200, def: 100 },
  { k: 'filterSaturate', labelKey: 'dp.lit.saturate', unit: '%', min: 0, max: 300, def: 100 },
  { k: 'filterGrayscale', labelKey: 'dp.lit.grayscale', unit: '%', min: 0, max: 100, def: 0 },
  { k: 'filterHue', labelKey: 'dp.lit.hue_rotate', unit: 'deg', min: 0, max: 360, def: 0 },
]

const ADVANCED_KEYS: (keyof BlockStyle)[] = [
  ...TRANSFORM_ROWS.map((r) => tfKey('tf', r.suffix)),
  ...TRANSFORM_ROWS.map((r) => tfKey('tfh', r.suffix)),
  'tfDuration', 'position', 'posTop', 'posRight', 'posBottom', 'posLeft', 'zIndex',
  'opacity', 'blendMode', ...FILTER_ROWS.map((r) => r.k), 'maskShape', 'blobMorphSpeed', 'cssClasses', 'customCss',
]

const AdvancedControls: React.FC<{ value: BlockStyle; onChange: (next: BlockStyle) => void }> = ({ value, onChange }) => {
  const t = useAdminT()
  const { set, resetBtn } = makeFxEditing(value, onChange)
  const positioned = value.position !== undefined

  return (
    <>
      <p className="ve-row__label">{t('dp.field.transform')}</p>
      <div className="ve-divider-group">
        <p className="ve-row__label">{t('dp.state.normal')}</p>
        {TRANSFORM_ROWS.map((r) => (
          <FxRange key={r.suffix} k={tfKey('tf', r.suffix)} label={t(r.labelKey)} unit={r.unit} value={value} onChange={onChange} def={r.def} min={r.min} max={r.max} />
        ))}
      </div>
      <div className="ve-divider-group">
        <p className="ve-row__label">{t('dp.state.hover')}</p>
        {TRANSFORM_ROWS.map((r) => (
          <FxRange key={r.suffix} k={tfKey('tfh', r.suffix)} label={t(r.labelKey)} unit={r.unit} value={value} onChange={onChange} def={r.def} min={r.min} max={r.max} />
        ))}
      </div>
      <FxRange k="tfDuration" label={t('dp.field.transition')} unit="ms" value={value} onChange={onChange} def={250} min={0} max={2000} step={10} help={t('dp.lit.how_long_transform_changes_take')} />

      <p className="ve-row__label">{t('dp.field.position')}</p>
      <div className="ve-divider-group">
        <SelectRow
          label={t('dp.field.position')}
          value={value.position ?? 'default'}
          options={[{ label: t('dp.opt.default'), value: 'default' }, ...POSITION_OPTIONS]}
          onChange={(v) => set('position', v === 'default' ? undefined : (v as BlockPosition))}
        />
        {positioned && (
          <>
            <FxRange k="posTop" label={t('dp.field.top')} unit="px" value={value} onChange={onChange} def={0} min={-2000} max={2000} />
            <FxRange k="posRight" label={t('dp.lit.right')} unit="px" value={value} onChange={onChange} def={0} min={-2000} max={2000} />
            <FxRange k="posBottom" label={t('dp.field.bottom')} unit="px" value={value} onChange={onChange} def={0} min={-2000} max={2000} />
            <FxRange k="posLeft" label={t('dp.lit.left')} unit="px" value={value} onChange={onChange} def={0} min={-2000} max={2000} />
          </>
        )}
        <NumberRow label={t('dp.lit.z_index')} value={value.zIndex} min={-10} max={9999} onChange={(v) => set('zIndex', v)} />
      </div>

      <p className="ve-row__label">{t('dp.field.appearance')}</p>
      <div className="ve-divider-group">
        <FxRange k="opacity" label={t('dp.field.opacity')} unit="%" value={value} onChange={onChange} def={100} min={0} max={100} />
        <SelectRow
          label={t('dp.field.blend_mode')}
          value={value.blendMode ?? 'normal'}
          options={BLEND_MODE_OPTIONS}
          onChange={(v) => set('blendMode', v === 'normal' ? undefined : (v as BlendMode))}
        />
        {FILTER_ROWS.map((r) => (
          <FxRange key={String(r.k)} k={r.k} label={t(r.labelKey)} unit={r.unit} value={value} onChange={onChange} def={r.def} min={r.min} max={r.max} />
        ))}
      </div>

      <p className="ve-row__label">{t('dp.field.mask')}</p>
      <div className="ve-divider-group">
        <SelectRow
          label={t('dp.lit.shape')}
          value={value.maskShape ?? 'none'}
          options={MASK_SHAPE_OPTIONS}
          help={t('dp.lit.clips_the_whole_block_background_and_con')}
          onChange={(v) => set('maskShape', v === 'none' ? undefined : (v as MaskShape))}
        />
        {value.maskShape === 'blob-morph' && (
          <>
            <SelectRow
              label={t('dp.lit.blob_speed')}
              value={value.blobMorphSpeed || 'medium'}
              options={BLOB_SPEED_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
              help={t('dp.lit.live_page_only_the_editor_shows_the_rest')}
              onChange={(v) => set('blobMorphSpeed', v === 'medium' ? undefined : (v as BlockStyle['blobMorphSpeed']))}
            />
          </>
        )}
        {resetBtn(['maskShape', 'blobMorphSpeed'])}
      </div>

      <p className="ve-row__label">{t('dp.field.custom')}</p>
      <div className="ve-divider-group">
        <TextRow
          label={t('dp.lit.css_classes')}
          value={value.cssClasses}
          placeholder="e.g. hero-card shadowed"
          help={t('dp.lit.up_to_8_class_names_separated_by_spaces')}
          onChange={(v) => set('cssClasses', v)}
        />
        <Row label={t('dp.lit.custom_css')} help="Use selector to target this element, e.g. selector:hover { opacity: .8 }">
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
  const t = useAdminT()
  const { set, resetBtn } = makeFxEditing(value, onChange)
  const scroll = value.parallax === 'float-up' || value.parallax === 'float-down' ? value.parallax : 'none'

  return (
    <>
      <div className="ve-divider-group">
        <SelectRow
          label={t('dp.lit.scroll_motion')}
          value={scroll}
          options={[
            { label: t('dp.opt.none'), value: 'none' },
            { label: t('dp.lit.float_up'), value: 'float-up' },
            { label: t('dp.lit.float_down'), value: 'float-down' },
          ]}
          help={t('dp.lit.moves_the_section_content_slightly_as_it')}
          onChange={(v) => set('parallax', v === 'none' ? undefined : (v as BlockStyle['parallax']))}
        />
        {scroll !== 'none' && (
          <>
            <RangeRow label={t('dp.lit.strength')} value={value.parallaxStrength ?? 40} min={0} max={100} help={t('dp.lit.how_far_it_moves_as_you_scroll')} onChange={(v) => set('parallaxStrength', v)} />
            <FxRange k="parallaxDistance" label={t('dp.lit.travel')} unit="px" value={value} onChange={onChange} def={Math.round((value.parallaxStrength ?? 40) * 1.6)} min={0} max={400} help={t('dp.lit.overrides_strength_with_an_exact_distanc')} />
          </>
        )}
        {resetBtn(['parallax', 'parallaxStrength', 'parallaxDistance'])}
      </div>

      <div className="ve-divider-group">
        <SelectRow
          label={t('dp.lit.entrance_animation')}
          value={value.reveal || 'none'}
          options={REVEAL_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          help={t('dp.lit.plays_as_the_section_scrolls_into_view_p')}
          onChange={(v) => set('reveal', v === 'none' ? undefined : (v as BlockStyle['reveal']))}
        />
        {value.reveal && value.reveal !== 'none' && (
          <>
            {value.reveal !== 'fade' && <FxRange k="revealDistance" label={t('dp.lit.distance')} unit="px" value={value} onChange={onChange} def={32} min={0} max={200} />}
            <FxRange k="revealDuration" label={t('dp.lit.duration')} unit="% of scroll-in" value={value} onChange={onChange} def={40} min={5} max={100} help={t('dp.lit.scroll_linked_so_this_is_how_much_of_the')} />
            <FxRange k="revealDelay" label={t('dp.lit.delay')} unit="%" value={value} onChange={onChange} def={0} min={0} max={60} />
            <SelectRow
              label={t('dp.lit.easing')}
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
          label={t('dp.lit.hover_effect')}
          value={value.hover || 'none'}
          options={HOVER_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          help={t('dp.lit.how_the_section_reacts_when_the_pointer')}
          onChange={(v) => set('hover', v === 'none' ? undefined : (v as BlockStyle['hover']))}
        />
        {value.hover === 'lift' && <FxRange k="hoverLift" label={t('dp.lit.lift')} unit="px" value={value} onChange={onChange} def={4} min={0} max={40} />}
        {(value.hover === 'lift' || value.hover === 'zoom') && (
          <FxRange k="hoverScale" label={t('dp.lit.scale')} unit="%" value={value} onChange={onChange} def={value.hover === 'zoom' ? 102 : 100} min={100} max={120} />
        )}
        {resetBtn(['hover', 'hoverLift', 'hoverScale'])}
      </div>

      <div className="ve-divider-group">
        <CheckRow
          label={t('dp.lit.glass')}
          checked={Boolean(value.glass)}
          help={t('dp.lit.frosted_glass_look_works_best_over_an_im')}
          onChange={(v) => set('glass', v || undefined)}
        />
        {value.glass && (
          <>
            <RangeRow label={t('dp.lit.blur_px')} value={value.glassBlur ?? 12} min={0} max={40} onChange={(v) => set('glassBlur', v)} />
            <FxRange k="glassOpacity" label={t('dp.lit.tint')} unit="%" value={value} onChange={onChange} def={18} min={0} max={100} />
            <FxRange k="glassBorder" label={t('dp.lit.border')} unit="%" value={value} onChange={onChange} def={30} min={0} max={100} />
          </>
        )}
        {resetBtn(['glass', 'glassBlur', 'glassOpacity', 'glassBorder'])}
      </div>

      <div className="ve-divider-group">
        <SelectRow
          label={t('dp.lit.pointer_effect')}
          value={value.pointerFx || 'none'}
          options={POINTER_FX_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          help={t('dp.lit.reacts_to_the_mouse_over_the_block_deskt')}
          onChange={(v) => set('pointerFx', v === 'none' ? undefined : (v as BlockStyle['pointerFx']))}
        />
        {value.pointerFx && value.pointerFx !== 'none' && (
          <FxRange k="pointerFxStrength" label={t('dp.lit.strength')} unit="%" value={value} onChange={onChange} def={50} min={0} max={100} help={t('dp.lit.tilt_angle_magnetic_pull_and_spotlight_s')} />
        )}
        {value.pointerFx === 'spotlight' && (
          <ColorRow label={t('dp.lit.spotlight_colour')} value={value.spotlightColor} onChange={(v) => set('spotlightColor', v)} />
        )}
        {resetBtn(['pointerFx', 'pointerFxStrength', 'spotlightColor'])}
      </div>

      <div className="ve-divider-group">
        <SelectRow
          label={t('dp.lit.ken_burns')}
          value={value.kenBurns || 'none'}
          options={KEN_BURNS_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          help={value.bgType === 'image' ? t('dp.lit.slowly_zooms_or_pans_the_background_imag') : t('dp.lit.needs_an_image_background_background_ima')}
          onChange={(v) => set('kenBurns', v === 'none' ? undefined : (v as BlockStyle['kenBurns']))}
        />
        {value.kenBurns && value.kenBurns !== 'none' && (
          <FxRange k="kenBurnsDuration" label={t('dp.lit.cycle')} unit="s" value={value} onChange={onChange} def={20} min={5} max={60} help={t('dp.lit.seconds_for_one_full_cycle_higher_is_slo')} />
        )}
        {resetBtn(['kenBurns', 'kenBurnsDuration'])}
      </div>

      <div className="ve-divider-group">
        <SelectRow
          label={t('dp.lit.animated_border')}
          value={value.borderFx || 'none'}
          options={BORDER_FX_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          help={t('dp.lit.a_ring_around_the_block_it_is_drawn_over')}
          onChange={(v) => set('borderFx', v === 'none' ? undefined : (v as BlockStyle['borderFx']))}
        />
        {value.borderFx && value.borderFx !== 'none' && (
          <>
            <ColorRow label={value.borderFx === 'conic-spin' ? t('dp.lit.colour_1') : t('dp.lit.colour')} value={value.borderFxColor} onChange={(v) => set('borderFxColor', v)} />
            {value.borderFx === 'conic-spin' && (
              <ColorRow label={t('dp.field.colour_2')} value={value.borderFxColor2} onChange={(v) => set('borderFxColor2', v)} />
            )}
            <FxRange k="borderFxWidth" label={t('dp.field.width')} unit="px" value={value} onChange={onChange} def={2} min={1} max={8} />
            <FxRange k="borderFxSpeed" label={t('dp.lit.speed')} unit="s" value={value} onChange={onChange} def={8} min={2} max={20} help={t('dp.lit.seconds_per_turn_or_pulse_lower_is_faste')} />
          </>
        )}
        {resetBtn(['borderFx', 'borderFxColor', 'borderFxColor2', 'borderFxWidth', 'borderFxSpeed'])}
      </div>
    </>
  )
}
