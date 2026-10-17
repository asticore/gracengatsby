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
export type DividerShape =
  | 'none' | 'wave' | 'tilt' | 'curve' | 'triangle' | 'arrow'
  | 'waves' | 'zigzag' | 'clouds' | 'drips' | 'mountains' | 'curve-asym' | 'slant-double' | 'pill' | 'steps' | 'spikes'
export type DividerAnim = 'none' | 'drift' | 'layers' | 'float'
export type BgEffect = 'none' | 'aurora' | 'mesh' | 'gradient-shift' | 'grain' | 'dots' | 'grid' | 'particles'
export type ParticlesInteract = 'none' | 'repel' | 'attract' | 'connect'
export type Parallax = 'none' | 'background' | 'float-up' | 'float-down'
export type Reveal = 'none' | 'fade' | 'fade-up' | 'fade-down' | 'slide-left' | 'slide-right' | 'zoom' | 'blur'
export type HoverFx = 'none' | 'lift' | 'glow' | 'zoom'
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
  dividerTopAnim?: DividerAnim
  dividerBottomAnim?: DividerAnim
  /** Seconds per loop, 4-60 (default 14). */
  dividerTopSpeed?: number
  dividerBottomSpeed?: number

  // Effects
  bgEffect?: BgEffect
  bgEffectColor?: string
  bgEffectColor2?: string
  /** 0-100 (default 50). */
  bgEffectIntensity?: number
  /** 10-120 (default 50). */
  particlesCount?: number
  particlesInteract?: ParticlesInteract
  parallax?: Parallax
  /** 0-100 (default 40). */
  parallaxStrength?: number
  reveal?: Reveal
  hover?: HoverFx
  glass?: boolean
  /** px, 0-40 (default 12). */
  glassBlur?: number

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
  const fx = sanitizeFx(style)
  if (style.tablet === undefined && style.mobile === undefined) return fx
  // Overrides come out of JSON: keep only whitelisted, well-typed keys.
  const { tablet: rawTablet, mobile: rawMobile, ...rest } = fx
  const out: BlockStyle = { ...rest }
  const tablet = sanitizeDeviceOverride(rawTablet)
  const mobile = sanitizeDeviceOverride(rawMobile)
  if (tablet) out.tablet = tablet
  if (mobile) out.mobile = mobile
  return out
}

const clampNum = (v: unknown, min: number, max: number): number | undefined =>
  isNum(v) ? Math.min(max, Math.max(min, v)) : undefined
const SAFE_COLOR = /^[#a-zA-Z0-9(),.%\s/-]{1,64}$/
const oneOf = <T extends string>(v: unknown, opts: readonly { value: T }[]): v is T =>
  typeof v === 'string' && opts.some((o) => o.value === v)

/**
 * Validates the effect keys read from JSON (enum membership, numeric clamps, safe colours).
 * Returns the same object untouched when no effect key is present.
 */
function sanitizeFx(style: BlockStyle): BlockStyle {
  const raw = style as Record<string, unknown>
  if (!FX_KEYS.some((k) => raw[k] !== undefined)) return style
  const out: Record<string, unknown> = { ...raw }
  const drop = (k: string) => delete out[k]
  const enumKey = (k: string, opts: readonly { value: string }[]) => {
    if (raw[k] !== undefined && !oneOf(raw[k], opts)) drop(k)
  }
  const numKey = (k: string, min: number, max: number) => {
    if (raw[k] === undefined) return
    const n = clampNum(raw[k], min, max)
    if (n === undefined) drop(k)
    else out[k] = n
  }
  const colorKey = (k: string) => {
    if (raw[k] !== undefined && !(typeof raw[k] === 'string' && SAFE_COLOR.test(raw[k] as string))) drop(k)
  }
  enumKey('dividerTop', DIVIDER_OPTIONS)
  enumKey('dividerBottom', DIVIDER_OPTIONS)
  enumKey('dividerTopAnim', DIVIDER_ANIM_OPTIONS)
  enumKey('dividerBottomAnim', DIVIDER_ANIM_OPTIONS)
  enumKey('bgEffect', BG_EFFECT_OPTIONS)
  enumKey('particlesInteract', PARTICLE_INTERACT_OPTIONS)
  enumKey('parallax', PARALLAX_OPTIONS)
  enumKey('reveal', REVEAL_OPTIONS)
  enumKey('hover', HOVER_OPTIONS)
  numKey('dividerTopSpeed', 4, 60)
  numKey('dividerBottomSpeed', 4, 60)
  numKey('bgEffectIntensity', 0, 100)
  numKey('particlesCount', 10, 120)
  numKey('parallaxStrength', 0, 100)
  numKey('glassBlur', 0, 40)
  colorKey('bgEffectColor')
  colorKey('bgEffectColor2')
  if (raw.glass !== undefined && typeof raw.glass !== 'boolean') drop('glass')
  return out as BlockStyle
}

const FX_KEYS = [
  'dividerTop', 'dividerBottom', 'dividerTopAnim', 'dividerBottomAnim', 'dividerTopSpeed', 'dividerBottomSpeed',
  'bgEffect', 'bgEffectColor', 'bgEffectColor2', 'bgEffectIntensity', 'particlesCount', 'particlesInteract',
  'parallax', 'parallaxStrength', 'reveal', 'hover', 'glass', 'glassBlur',
] as const

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

  if (style.bgType === 'image' && isStr(style.bgImageUrl) && !(style.parallax === 'background')) {
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

/** Zigzag / spike style teeth: `n` teeth across 1200 units, valley y `lo`, peak y `hi`. */
const teeth = (n: number, lo: number, hi: number): string => {
  const w = 1200 / n
  let d = `M0,${lo}`
  for (let i = 0; i < n; i++) d += `L${i * w + w / 2},${hi}L${(i + 1) * w},${lo}`
  return `${d}L1200,120L0,120Z`
}
const clouds = (): string => {
  let d = 'M0,95'
  for (let i = 0; i < 6; i++) d += 'a100,55 0 0 1 200,0'
  return `${d}L1200,120L0,120Z`
}
const drips = (): string => {
  let d = 'M0,85'
  for (let o = 0; o < 1200; o += 300) {
    d += `L${o + 30},85L${o + 30},40A20,20 0 0 1 ${o + 70},40L${o + 70},85L${o + 130},85L${o + 130},62A15,15 0 0 1 ${o + 160},62L${o + 160},85`
    d += `L${o + 225},85L${o + 225},52A22.5,22.5 0 0 1 ${o + 270},52L${o + 270},85L${o + 300},85`
  }
  return `${d}L1200,120L0,120Z`
}

const DIVIDER_PATHS: Record<Exclude<DividerShape, 'none'>, string> = {
  wave: 'M0,64L48,69.3C96,75,192,85,288,80C384,75,480,53,576,53.3C672,53,768,75,864,80C960,85,1056,75,1152,64L1200,64L1200,120L0,120Z',
  tilt: 'M0,120L1200,0L1200,120L0,120Z',
  curve: 'M0,120L0,40C300,120,900,120,1200,40L1200,120Z',
  triangle: 'M0,120L600,0L1200,120L0,120Z',
  arrow: 'M0,0L600,80L1200,0L1200,120L0,120Z',
  waves: 'M0,80C200,40,400,40,600,80S1000,120,1200,80L1200,120L0,120Z',
  zigzag: teeth(12, 80, 40),
  clouds: clouds(),
  drips: drips(),
  mountains: 'M0,120L0,90L180,40L300,75L480,15L650,70L800,30L1000,80L1100,55L1200,85L1200,120Z',
  'curve-asym': 'M0,120L0,30C500,30,800,110,1200,95L1200,120Z',
  'slant-double': 'M0,120L0,50L400,0L800,100L1200,50L1200,120Z',
  pill: 'M0,120L0,110L400,110A40,40 0 0 1 440,70L760,70A40,40 0 0 1 800,110L1200,110L1200,120Z',
  steps: 'M0,120L0,100L300,100L300,70L600,70L600,40L900,40L900,10L1200,10L1200,120Z',
  spikes: teeth(20, 110, 15),
}

/** Back layer drawn behind the main path (lower opacity) for two-layer shapes. */
const DIVIDER_BACK_PATHS: Partial<Record<DividerShape, string>> = {
  waves: 'M0,60C200,100,400,100,600,60S1000,20,1200,60L1200,120L0,120Z',
}

/** Shapes that repeat horizontally with a 1200 unit period, so they can slide seamlessly. */
const PERIODIC: readonly DividerShape[] = ['wave', 'waves', 'zigzag', 'clouds', 'drips', 'spikes']
export const isPeriodicDivider = (shape: DividerShape | undefined): boolean => !!shape && PERIODIC.includes(shape)

export function dividerPath(shape: DividerShape): string | null {
  if (!shape || shape === 'none') return null
  return DIVIDER_PATHS[shape] ?? null
}

/** Optional translucent back path (currently only `waves`). */
export function dividerBackPath(shape: DividerShape | undefined): string | null {
  return (shape && DIVIDER_BACK_PATHS[shape]) || null
}

export const DIVIDER_OPTIONS: { label: string; value: DividerShape }[] = [
  { label: 'None', value: 'none' },
  { label: 'Wave', value: 'wave' },
  { label: 'Layered waves', value: 'waves' },
  { label: 'Tilt', value: 'tilt' },
  { label: 'Curve', value: 'curve' },
  { label: 'Asymmetric curve', value: 'curve-asym' },
  { label: 'Triangle', value: 'triangle' },
  { label: 'Arrow', value: 'arrow' },
  { label: 'Zigzag', value: 'zigzag' },
  { label: 'Clouds', value: 'clouds' },
  { label: 'Drips', value: 'drips' },
  { label: 'Mountains', value: 'mountains' },
  { label: 'Double slant', value: 'slant-double' },
  { label: 'Pill', value: 'pill' },
  { label: 'Steps', value: 'steps' },
  { label: 'Spikes', value: 'spikes' },
]

export const DIVIDER_ANIM_OPTIONS: { label: string; value: DividerAnim }[] = [
  { label: 'None', value: 'none' },
  { label: 'Drift', value: 'drift' },
  { label: 'Layers', value: 'layers' },
  { label: 'Float', value: 'float' },
]

export const BG_EFFECT_OPTIONS: { label: string; value: BgEffect }[] = [
  { label: 'None', value: 'none' },
  { label: 'Aurora', value: 'aurora' },
  { label: 'Mesh gradient', value: 'mesh' },
  { label: 'Gradient shift', value: 'gradient-shift' },
  { label: 'Film grain', value: 'grain' },
  { label: 'Dots', value: 'dots' },
  { label: 'Grid', value: 'grid' },
  { label: 'Particles', value: 'particles' },
]

export const PARALLAX_OPTIONS: { label: string; value: Parallax }[] = [
  { label: 'None', value: 'none' },
  { label: 'Background', value: 'background' },
  { label: 'Float up', value: 'float-up' },
  { label: 'Float down', value: 'float-down' },
]

export const REVEAL_OPTIONS: { label: string; value: Reveal }[] = [
  { label: 'None', value: 'none' },
  { label: 'Fade', value: 'fade' },
  { label: 'Fade up', value: 'fade-up' },
  { label: 'Fade down', value: 'fade-down' },
  { label: 'Slide from right', value: 'slide-left' },
  { label: 'Slide from left', value: 'slide-right' },
  { label: 'Zoom', value: 'zoom' },
  { label: 'Blur in', value: 'blur' },
]

export const HOVER_OPTIONS: { label: string; value: HoverFx }[] = [
  { label: 'None', value: 'none' },
  { label: 'Lift', value: 'lift' },
  { label: 'Glow', value: 'glow' },
  { label: 'Zoom', value: 'zoom' },
]

export const PARTICLE_INTERACT_OPTIONS: { label: string; value: ParticlesInteract }[] = [
  { label: 'None', value: 'none' },
  { label: 'Repel', value: 'repel' },
  { label: 'Attract', value: 'attract' },
  { label: 'Connect', value: 'connect' },
]

/** Extra wrapper classes for the effect keys; empty when none are set. */
export function blockFxClasses(style: BlockStyle): string {
  const c: string[] = []
  if (style.reveal && style.reveal !== 'none') c.push(`be-fx-reveal-${style.reveal}`)
  if (style.hover && style.hover !== 'none') c.push(`be-fx-hover-${style.hover}`)
  if (style.glass) c.push('be-fx-glass')
  if (style.parallax === 'background' && style.bgType === 'image' && isStr(style.bgImageUrl)) c.push('be-fx-parallax-bg')
  else if (style.parallax === 'float-up' || style.parallax === 'float-down') c.push(`be-fx-parallax-${style.parallax}`)
  if (hasFxLayer(style) || c.includes('be-fx-parallax-bg')) c.push('be-fx-clip')
  return c.join(' ')
}

export const hasFxLayer = (style: BlockStyle): boolean => !!style.bgEffect && style.bgEffect !== 'none'

/** CSS custom properties the effect classes read; only the ones that were set. */
export function blockFxVars(style: BlockStyle): Record<string, string> {
  const v: Record<string, string> = {}
  if (isStr(style.bgEffectColor)) v['--be-fx-c'] = style.bgEffectColor
  if (isStr(style.bgEffectColor2)) v['--be-fx-c2'] = style.bgEffectColor2
  if (isNum(style.bgEffectIntensity)) v['--be-fx-i'] = String(style.bgEffectIntensity / 100)
  if (style.parallax && style.parallax !== 'none') v['--be-par'] = `${Math.round((isNum(style.parallaxStrength) ? style.parallaxStrength : 40) * 1.6)}px`
  if (style.glass) v['--be-glass'] = `${isNum(style.glassBlur) ? style.glassBlur : 12}px`
  return v
}

/** Stable per-block DOM id used to scope the block's media-query CSS. */
export function blockScopeId(index: number, prefix = 'be'): string {
  return `${prefix}-block-${index}`
}

/**
 * Parse old "one per line" format (string with optional "|" cells) into repeater array format.
 * Used for backwards compatibility when upgrading element props from old format to repeater format.
 *
 * Examples:
 * - "Line 1\nLine 2" => [{text: "Line 1"}, {text: "Line 2"}]
 * - "Text | link\nMore | /url" => [{text: "Text", link: "link"}, {text: "More", link: "/url"}]
 * - "Q | A\nQ2 | A2" (with fieldNames) => [{heading: "Q", content: "A"}, {heading: "Q2", content: "A2"}]
 */
export function parseOldFormat(
  value: unknown,
  fieldNames: string[]
): Record<string, unknown>[] {
  if (typeof value !== 'string') return []

  return value
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim())
      const row: Record<string, unknown> = {}
      for (let i = 0; i < fieldNames.length; i++) {
        row[fieldNames[i]] = cells[i] || ''
      }
      return row
    })
}
