/**
 * The per-block "Design" model, shared by the live site renderer and the
 * visual editor canvas so a block looks identical in both.
 *
 * Every page-builder block carries one of these under a single `style` JSON
 * column. Storing it as JSON rather than ~25 individual CMS fields keeps
 * the D1 schema small (one column per block table instead of twenty-five)
 * and lets the visual editor own the editing UI, which is where these are
 * actually meant to be set.
 */

import { BUILT_IN_FONTS, fontStack } from '@/features/fonts/installed'

import { isDesignV2Raw } from '@/lib/design/upgrade'
import { DEFAULT_BREAKPOINTS, type SectionLayout } from '@/lib/sectionLayout'

export type BackgroundType = 'none' | 'color' | 'gradient' | 'image'
export type TextAlign = 'left' | 'center' | 'right'
export type BlockWidth = 'contained' | 'wide' | 'full'
export type DividerShape = 'none' | 'wave' | 'tilt' | 'curve' | 'triangle' | 'arrow'
export type BoxShadowPreset = 'none' | 'sm' | 'md' | 'lg'

/** The keys a tablet / mobile override may carry (everything else is dropped on read). */
export const RESPONSIVE_KEYS = [
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'marginTop',
  'marginBottom',
  'textAlign',
  'minHeight',
  'minHeightUnit',
  'selfAlign',
  'selfWidth',
  'selfWidthPercent',
] as const
export type ResponsiveKey = (typeof RESPONSIVE_KEYS)[number]
export type ResponsiveDevice = 'tablet' | 'mobile'

/** One device's overrides: the responsive subset of BlockStyle, plus `hide` for that device only. */
export type DeviceOverride = Partial<Pick<BlockStyle, ResponsiveKey>> & { hide?: boolean }

export type BlockStyle = {
  // Background
  bgType?: BackgroundType
  bgColor?: string
  bgGradientFrom?: string
  bgGradientTo?: string
  bgGradientAngle?: number
  /** Media doc id for an image background. */
  bgImage?: number | null
  /** Media URL, resolved at render time; cached here so previews avoid a refetch. */
  bgImageUrl?: string | null
  /** 0-100. Darkens an image background so text stays readable. */
  bgOverlay?: number

  // Spacing (px)
  paddingTop?: number
  paddingBottom?: number
  paddingTopMobile?: number
  paddingBottomMobile?: number
  paddingLeft?: number
  paddingRight?: number
  marginTop?: number
  marginBottom?: number

  // Border
  borderWidth?: number
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  borderColor?: string
  borderRadius?: number

  // Shadow
  boxShadow?: BoxShadowPreset

  // Typography / layout
  /** A built-in site font key (see BUILT_IN_FONTS). Absent means the site default. */
  fontFamily?: string
  textColor?: string
  textAlign?: TextAlign
  width?: BlockWidth
  minHeight?: number
  /** Unit of minHeight. Unset = px; 'vh' (with minHeight 100) is "fit the screen". */
  minHeightUnit?: 'px' | 'vh'

  // Shape dividers
  dividerTop?: DividerShape
  dividerTopColor?: string
  dividerTopHeight?: number
  dividerTopFlip?: boolean
  dividerBottom?: DividerShape
  dividerBottomColor?: string
  dividerBottomHeight?: number
  dividerBottomFlip?: boolean

  // Position inside a column (all optional; unset keeps normal block flow)
  /** How the block sits across its column. 'stretch' fills it; start/center/end shrink to fit and align. */
  selfAlign?: 'stretch' | 'start' | 'center' | 'end'
  /** 'full' = 100% of the column, 'custom' = selfWidthPercent. Unset = automatic. */
  selfWidth?: 'auto' | 'full' | 'custom'
  selfWidthPercent?: number
  marginLeft?: number
  marginRight?: number

  /** Section-only flow settings (direction per device, gap, wrap...). See lib/sectionLayout.ts. */
  layout?: SectionLayout

  /**
   * Per-device overrides (Elementor-style responsive editing). Desktop is the base style above;
   * these only carry the keys in RESPONSIVE_KEYS. Tablet applies up to the tablet breakpoint and
   * mobile up to the mobile one, mobile inheriting tablet. hideOnMobile / paddingTopMobile /
   * paddingBottomMobile (older documents) read as part of `mobile` - see resolveDeviceOverride().
   */
  tablet?: DeviceOverride
  mobile?: DeviceOverride

  // Visibility
  hideOnMobile?: boolean
  hideOnDesktop?: boolean

  // Advanced
  customClass?: string
  anchorId?: string
}

export const EMPTY_STYLE: BlockStyle = {}

/** Narrows an unknown JSON column value to a BlockStyle without throwing. */
export function asBlockStyle(value: unknown): BlockStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_STYLE
  // v2 designs are emitted by renderElement (src/lib/design/css.ts), not this wrapper.
  if (isDesignV2Raw(value)) return EMPTY_STYLE
  const style = value as BlockStyle
  if (style.tablet === undefined && style.mobile === undefined) return style
  // Overrides come out of JSON: keep only whitelisted, well-typed keys.
  const { tablet: rawTablet, mobile: rawMobile, ...rest } = style
  const out: BlockStyle = { ...rest }
  const tablet = sanitizeDeviceOverride(rawTablet)
  const mobile = sanitizeDeviceOverride(rawMobile)
  if (tablet) out.tablet = tablet
  if (mobile) out.mobile = mobile
  return out
}

const TEXT_ALIGNS: readonly string[] = ['left', 'center', 'right']
const SELF_ALIGNS: readonly string[] = ['stretch', 'start', 'center', 'end']
const SELF_WIDTHS: readonly string[] = ['auto', 'full', 'custom']

/** Reads one stored override object; junk keys and wrong types are dropped. Undefined when nothing is left. */
export function sanitizeDeviceOverride(raw: unknown): DeviceOverride | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  const out: DeviceOverride = {}
  for (const key of ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'minHeight'] as const) {
    const v = r[key]
    if (isNum(v) && v >= 0) out[key] = v
  }
  for (const key of ['marginTop', 'marginBottom'] as const) {
    if (isNum(r[key])) out[key] = r[key]
  }
  if (typeof r.textAlign === 'string' && TEXT_ALIGNS.includes(r.textAlign)) out.textAlign = r.textAlign as TextAlign
  if (r.minHeightUnit === 'px' || r.minHeightUnit === 'vh') out.minHeightUnit = r.minHeightUnit
  if (typeof r.selfAlign === 'string' && SELF_ALIGNS.includes(r.selfAlign)) out.selfAlign = r.selfAlign as BlockStyle['selfAlign']
  if (typeof r.selfWidth === 'string' && SELF_WIDTHS.includes(r.selfWidth)) out.selfWidth = r.selfWidth as BlockStyle['selfWidth']
  if (isNum(r.selfWidthPercent) && r.selfWidthPercent > 0) out.selfWidthPercent = r.selfWidthPercent
  if (r.hide === true) out.hide = true
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * The override a device effectively has: the stored one on top of the older mobile-only keys
 * (paddingTopMobile, paddingBottomMobile, hideOnMobile), which keep working and read as mobile values.
 */
export function resolveDeviceOverride(style: BlockStyle, device: ResponsiveDevice): DeviceOverride {
  const stored = device === 'tablet' ? style.tablet : style.mobile
  if (device === 'tablet') return { ...stored }
  const legacy: DeviceOverride = {}
  if (isNum(style.paddingTopMobile)) legacy.paddingTop = style.paddingTopMobile
  if (isNum(style.paddingBottomMobile)) legacy.paddingBottom = style.paddingBottomMobile
  if (style.hideOnMobile) legacy.hide = true
  return { ...legacy, ...stored }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/**
 * Builds the inline style for a block's outer wrapper.
 *
 * Only desktop values go inline - mobile padding and the hide-on-* toggles
 * need media queries, which inline styles can't express, so those are emitted
 * as a scoped <style> rule by blockStyleCss() instead.
 */
export function blockStyleToCss(style: BlockStyle): React.CSSProperties {
  const css: React.CSSProperties = {}

  if (style.bgType === 'color' && isStr(style.bgColor)) {
    css.backgroundColor = style.bgColor
  }

  if (style.bgType === 'gradient' && (isStr(style.bgGradientFrom) || isStr(style.bgGradientTo))) {
    const from = style.bgGradientFrom || 'transparent'
    const to = style.bgGradientTo || 'transparent'
    const angle = isNum(style.bgGradientAngle) ? style.bgGradientAngle : 180
    css.backgroundImage = `linear-gradient(${angle}deg, ${from}, ${to})`
  }

  if (style.bgType === 'image' && isStr(style.bgImageUrl)) {
    css.backgroundImage = `url(${style.bgImageUrl})`
    css.backgroundSize = 'cover'
    css.backgroundPosition = 'center'
  }

  if (isNum(style.paddingTop)) css.paddingTop = `${style.paddingTop}px`
  if (isNum(style.paddingBottom)) css.paddingBottom = `${style.paddingBottom}px`
  if (isNum(style.paddingLeft)) css.paddingLeft = `${style.paddingLeft}px`
  if (isNum(style.paddingRight)) css.paddingRight = `${style.paddingRight}px`
  if (isNum(style.marginTop)) css.marginTop = `${style.marginTop}px`
  if (isNum(style.marginBottom)) css.marginBottom = `${style.marginBottom}px`
  Object.assign(css, selfPositionCss(style))
  if (isNum(style.marginLeft)) css.marginLeft = `${style.marginLeft}px`
  if (isNum(style.marginRight)) css.marginRight = `${style.marginRight}px`
  const fontValue = blockFontStack(style.fontFamily)
  if (fontValue) css.fontFamily = fontValue
  if (isStr(style.textColor)) css.color = style.textColor
  if (style.textAlign) css.textAlign = style.textAlign
  if (isNum(style.minHeight)) css.minHeight = minHeightValue(style.minHeight, style.minHeightUnit)

  if (isNum(style.borderWidth) && style.borderWidth > 0) {
    css.borderWidth = `${style.borderWidth}px`
    css.borderStyle = style.borderStyle || 'solid'
    css.borderColor = style.borderColor || 'currentColor'
  }
  if (isNum(style.borderRadius)) css.borderRadius = `${style.borderRadius}px`
  if (style.boxShadow && style.boxShadow !== 'none') css.boxShadow = BOX_SHADOW_PRESETS[style.boxShadow]

  return css
}

const minHeightValue = (value: number, unit: 'px' | 'vh' | undefined): string => `${value}${unit === 'vh' ? 'vh' : 'px'}`

/**
 * Width and alignment of a block inside its column. Blocks are normal-flow boxes, so
 * start/center/end are done with auto margins on a shrink-wrapped width; an explicit
 * margin-left/right in the same style wins over the alignment margin.
 */
export function selfPositionCss(style: BlockStyle): React.CSSProperties {
  const css: React.CSSProperties = {}
  const align = style.selfAlign
  if (style.selfWidth === 'full') css.width = '100%'
  else if (style.selfWidth === 'custom' && isNum(style.selfWidthPercent) && style.selfWidthPercent > 0) {
    css.width = `${Math.min(100, style.selfWidthPercent)}%`
  }
  if (align === 'stretch') {
    if (!css.width) css.width = '100%'
  } else if (align) {
    if (!css.width) css.width = 'fit-content'
    css.maxWidth = '100%'
    if (align === 'center') {
      css.marginLeft = 'auto'
      css.marginRight = 'auto'
    } else if (align === 'end') {
      css.marginLeft = 'auto'
    }
  }
  return css
}

/**
 * CSS font stack for a built-in site font key, or null for the site default.
 * Only keys in BUILT_IN_FONTS resolve, so a stored value can never inject CSS.
 * Every built-in face is loaded site-wide (see the layout), so no extra load is needed.
 */
export function blockFontStack(key: string | undefined): string | null {
  const font = BUILT_IN_FONTS.find((candidate) => candidate.value === key)
  return font ? fontStack(font.family, font.category) : null
}

/** Shadow presets rather than a free-form CSS box-shadow field - keeps the Design tab a
 *  couple of clicks instead of asking anyone to hand-write shadow syntax. */
const BOX_SHADOW_PRESETS: Record<Exclude<BoxShadowPreset, 'none'>, string> = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.12)',
  md: '0 8px 24px rgba(0, 0, 0, 0.16)',
  lg: '0 20px 48px rgba(0, 0, 0, 0.22)',
}

export const BOX_SHADOW_OPTIONS: { label: string; value: BoxShadowPreset }[] = [
  { label: 'None', value: 'none' },
  { label: 'Small', value: 'sm' },
  { label: 'Medium', value: 'md' },
  { label: 'Large', value: 'lg' },
]

/** Media queries for one device: where the override starts applying (cascading narrower), and where `hide` applies (that device only). */
function deviceQueries(device: ResponsiveDevice | 'desktop'): { cascade: string | null; only: string } {
  const { tablet, mobile } = DEFAULT_BREAKPOINTS
  if (device === 'tablet') return { cascade: `(max-width:${tablet}px)`, only: `(min-width:${mobile + 1}px) and (max-width:${tablet}px)` }
  if (device === 'mobile') return { cascade: `(max-width:${mobile}px)`, only: `(max-width:${mobile}px)` }
  return { cascade: null, only: `(min-width:${tablet + 1}px)` }
}

/**
 * The declarations one device's override adds. `!important` because the desktop base values are
 * inline styles, which a stylesheet rule cannot otherwise beat. Position-in-column keys are
 * computed from the merged style (base, then tablet, then mobile) so that e.g. "full width on
 * mobile" also clears the desktop auto margins.
 */
export function deviceOverrideDecls(style: BlockStyle, device: ResponsiveDevice): string[] {
  const own = device === 'tablet' ? style.tablet : style.mobile
  if (!own) return []
  const decls: string[] = []
  const px = (name: string, v: number | undefined) => {
    if (isNum(v)) decls.push(`${name}:${v}px !important`)
  }
  px('padding-top', own.paddingTop)
  px('padding-bottom', own.paddingBottom)
  px('padding-left', own.paddingLeft)
  px('padding-right', own.paddingRight)
  px('margin-top', own.marginTop)
  px('margin-bottom', own.marginBottom)
  if (own.textAlign) decls.push(`text-align:${own.textAlign} !important`)
  if (isNum(own.minHeight) || own.minHeightUnit) {
    const merged = { ...style, ...style.tablet, ...(device === 'mobile' ? style.mobile : {}) }
    if (isNum(merged.minHeight)) decls.push(`min-height:${minHeightValue(merged.minHeight, merged.minHeightUnit)} !important`)
  }
  if (own.selfAlign !== undefined || own.selfWidth !== undefined || own.selfWidthPercent !== undefined) {
    const merged: BlockStyle = { ...style, ...style.tablet, ...(device === 'mobile' ? style.mobile : {}) }
    const pos = selfPositionCss(merged)
    decls.push(`width:${pos.width ?? 'auto'} !important`)
    decls.push(`max-width:${pos.maxWidth ?? 'none'} !important`)
    const left = isNum(merged.marginLeft) ? `${merged.marginLeft}px` : (pos.marginLeft ?? '0')
    const right = isNum(merged.marginRight) ? `${merged.marginRight}px` : (pos.marginRight ?? '0')
    decls.push(`margin-left:${left} !important`, `margin-right:${right} !important`)
  }
  return decls
}

/**
 * Emits the media-query-dependent rules that can't live in an inline style.
 * Scoped to a per-block id so blocks never leak styles into each other.
 * Returns an empty string when the block needs no such rules.
 *
 * `editor` is for the canvas: a block hidden on the device being previewed is faded instead of
 * removed, otherwise it could no longer be clicked and un-hidden.
 */
export function blockStyleCss(style: BlockStyle, scopeId: string, options: { editor?: boolean } = {}): string {
  const rules: string[] = []
  const sel = `#${scopeId}`

  const mobileDecls: string[] = []
  if (isNum(style.paddingTopMobile)) mobileDecls.push(`padding-top:${style.paddingTopMobile}px`)
  if (isNum(style.paddingBottomMobile)) mobileDecls.push(`padding-bottom:${style.paddingBottomMobile}px`)
  if (style.hideOnMobile) mobileDecls.push('display:none')

  if (mobileDecls.length > 0) {
    rules.push(`@media (max-width:768px){${sel}{${mobileDecls.join(';')}}}`)
  }

  if (style.hideOnDesktop) {
    rules.push(`@media (min-width:769px){${sel}{display:none}}`)
  }

  // Per-device overrides: tablet first so mobile (declared later) wins where both apply.
  const hidden = options.editor ? 'opacity:0.3 !important' : 'display:none !important'
  for (const device of ['tablet', 'mobile'] as const) {
    const decls = deviceOverrideDecls(style, device)
    if (decls.length > 0) rules.push(`@media ${deviceQueries(device).cascade}{${sel}{${decls.join(';')}}}`)
  }
  for (const device of ['tablet', 'mobile'] as const) {
    if ((device === 'tablet' ? style.tablet : style.mobile)?.hide) {
      rules.push(`@media ${deviceQueries(device).only}{${sel}{${hidden}}}`)
    }
  }

  // Headings set their own theme font, so the block font is repeated on them here.
  const fontValue = blockFontStack(style.fontFamily)
  if (fontValue) {
    rules.push(`${sel} :is(h1,h2,h3,h4,h5,h6){font-family:${fontValue}}`)
  }

  return rules.join('')
}

/** Class names the wrapper should carry, derived from the style. */
export function blockStyleClasses(style: BlockStyle): string {
  return [
    'be-block',
    style.width ? `be-block--${style.width}` : 'be-block--contained',
    style.bgType === 'image' ? 'be-block--has-bg-image' : null,
    isNum(style.minHeight) || isNum(style.tablet?.minHeight) || isNum(style.mobile?.minHeight) ? 'be-block--minh' : null,
    style.customClass || null,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * SVG path data for each shape divider, drawn in a 0 0 1200 120 viewBox so
 * every shape scales the same way regardless of the height chosen.
 */
const DIVIDER_PATHS: Record<Exclude<DividerShape, 'none'>, string> = {
  wave: 'M0,64L48,69.3C96,75,192,85,288,80C384,75,480,53,576,53.3C672,53,768,75,864,80C960,85,1056,75,1152,64L1200,58.7L1200,120L0,120Z',
  tilt: 'M0,120L1200,0L1200,120L0,120Z',
  curve: 'M0,120L0,40C300,120,900,120,1200,40L1200,120Z',
  triangle: 'M0,120L600,0L1200,120L0,120Z',
  arrow: 'M0,0L600,80L1200,0L1200,120L0,120Z',
}

export function dividerPath(shape: DividerShape): string | null {
  if (!shape || shape === 'none') return null
  return DIVIDER_PATHS[shape] ?? null
}

export const DIVIDER_OPTIONS: { label: string; value: DividerShape }[] = [
  { label: 'None', value: 'none' },
  { label: 'Wave', value: 'wave' },
  { label: 'Tilt', value: 'tilt' },
  { label: 'Curve', value: 'curve' },
  { label: 'Triangle', value: 'triangle' },
  { label: 'Arrow', value: 'arrow' },
]

/** Stable per-block DOM id used to scope the block's media-query CSS. */
export function blockScopeId(index: number, prefix = 'be'): string {
  return `${prefix}-block-${index}`
}
