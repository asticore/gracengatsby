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
import { cleanRoles, cleanUrlText, isIsoDate, rulesFromStyle } from '@/lib/visibilityRules'

import { isDesignV2Raw } from '@/lib/design/upgrade'
import { DEFAULT_BREAKPOINTS, type SectionLayout } from '@/lib/sectionLayout'

export type BackgroundType = 'none' | 'color' | 'gradient' | 'image' | 'video' | 'slideshow'
export type MaskShape = 'none' | 'circle' | 'rounded' | 'blob' | 'hexagon' | 'diamond' | 'arch' | 'triangle' | 'wave' | 'blob-morph'
export type SlideTransition = 'fade' | 'slide' | 'zoom'
export type BlobSpeed = 'slow' | 'medium' | 'fast'
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
export type PointerFx = 'none' | 'spotlight' | 'tilt' | 'magnetic'
export type KenBurns = 'none' | 'zoom-in' | 'zoom-out' | 'pan'
export type BorderFx = 'none' | 'glow' | 'conic-spin'
export type BoxShadowPreset = 'none' | 'sm' | 'md' | 'lg'
export type FontSizeUnit = 'px' | 'em' | 'rem' | 'vw'
/** Units a spacing / size value may use. */
export type LengthUnit = 'px' | '%' | 'em' | 'rem' | 'vw' | 'vh'
export const LENGTH_UNITS: readonly string[] = ['px', '%', 'em', 'rem', 'vw', 'vh']
const lengthUnit = (v: unknown): LengthUnit | undefined =>
  typeof v === 'string' && LENGTH_UNITS.includes(v) ? (v as LengthUnit) : undefined

export type LetterSpacingUnit = 'px' | 'em'
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'
export type TextShadowPreset = 'none' | 'sm' | 'md' | 'lg'
export type TextFx = 'none' | 'gradient' | 'outline' | 'shadow-glow'

/** The keys a tablet / mobile override may carry (everything else is dropped on read). */
export const RESPONSIVE_KEYS = [
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'paddingUnit',
  'marginUnit',
  'selfWidthPercentUnit',
  'textAlign',
  'minHeight',
  'minHeightUnit',
  'selfAlign',
  'selfWidth',
  'selfWidthPercent',
  'fontSize',
  'fontSizeUnit',
  'lineHeight',
  'letterSpacing',
  'radiusTl',
  'radiusTr',
  'radiusBr',
  'radiusBl',
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
  /** Background video (bgType 'video'): https or site-relative .mp4/.webm. See isSafeMediaUrl(). */
  bgVideoUrl?: string | null
  /** Poster image: shown until the video plays, and in its place under reduced motion. */
  bgVideoPoster?: string | null
  /** Default true. false plays the video once. */
  bgVideoLoop?: boolean
  /** Slideshow background (bgType 'slideshow'): up to 6 image URLs (cached from media picks, like bgImageUrl). */
  bgSlides?: string[]
  /** Media doc ids matching bgSlides, for the editor's picker. */
  bgSlideIds?: number[]
  /** Seconds each slide is shown, 2-30 (default 5). */
  slideInterval?: number
  slideTransition?: SlideTransition
  /** Animated blob outline speed, used when maskShape is 'blob-morph'. */
  blobMorphSpeed?: BlobSpeed
  /** 0-100. Film-grain noise over the background and gradient (SVG feTurbulence). */
  noise?: number
  /** 0-100. Darkens an image background so text stays readable. */
  bgOverlay?: number
  /** General background overlay layer (any section or block). Legacy bgOverlay is separate. */
  overlayType?: 'none' | 'color' | 'gradient'
  overlayColor?: string
  overlayColor2?: string
  /** 0-360 (default 180). */
  overlayAngle?: number
  /** 0-100 (default 50). */
  overlayOpacity?: number
  overlayBlend?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'color' | 'luminosity'

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
  /** Per-corner radius in px (0-999). When any is set, unset corners fall back to borderRadius. Responsive. */
  radiusTl?: number
  radiusTr?: number
  radiusBr?: number
  radiusBl?: number
  /** Editor-only: the four corner inputs are linked. */
  radiusLinked?: boolean

  // Shadow
  boxShadow?: BoxShadowPreset

  // Typography / layout
  /** A built-in site font key (see BUILT_IN_FONTS). Absent means the site default. */
  fontFamily?: string
  textColor?: string
  textAlign?: TextAlign
  /** Typography (Elementor-style). Emitted on the wrapper; headings/paragraphs inside inherit it. */
  /** 1-400 in fontSizeUnit (default px). Responsive. */
  fontSize?: number
  fontSizeUnit?: FontSizeUnit
  /** 100-900 in steps of 100. */
  fontWeight?: number
  /** Unitless multiplier, 0.5-5. Responsive. */
  lineHeight?: number
  /** -20..50 in letterSpacingUnit (default px). Responsive. */
  letterSpacing?: number
  letterSpacingUnit?: LetterSpacingUnit
  textTransform?: TextTransform
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline' | 'line-through'
  /** px, -20..100. */
  wordSpacing?: number
  textShadow?: TextShadowPreset
  width?: BlockWidth
  minHeight?: number
  /** Unit of minHeight. Unset = px; 'vh' (with minHeight 100) is "fit the screen". */
  minHeightUnit?: LengthUnit
  paddingUnit?: LengthUnit
  marginUnit?: LengthUnit
  /** Unit of selfWidthPercent. Unset = %. */
  selfWidthPercentUnit?: LengthUnit

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
  /** Pointer-following effect. Spotlight, tilt and magnetic need a fine pointer and motion allowed. */
  pointerFx?: PointerFx
  /** Background image slowly zooms or pans. Uses bgImageUrl (bgType 'image'). */
  kenBurns?: KenBurns
  /** Animated ring drawn around the block. Adds no layout space. */
  borderFx?: BorderFx
  glass?: boolean
  /** px, 0-40 (default 12). */
  glassBlur?: number
  /** Clips the whole block (background and content) to a shape via clip-path. */
  maskShape?: MaskShape

  // Granular effect settings. All optional; unset keeps the built-in look.
  /** Parallax travel in px, 0-400 (default: strength * 1.6). */
  parallaxDistance?: number
  /** Background parallax direction; 'up' (default) is the classic slower-than-page drift. */
  parallaxDirection?: 'up' | 'down'
  particlesSizeMin?: number
  particlesSizeMax?: number
  /** Percent of normal speed, 0-300 (default 100). */
  particlesSpeed?: number
  /** 5-100 (default 100). */
  particlesOpacity?: number
  particlesLinks?: boolean
  /** px, 40-300 (default 110). */
  particlesLinkDistance?: number
  /** px, 40-400 (default 120). */
  particlesInteractRadius?: number
  particlesShape?: 'circle' | 'square'
  /** px, 0.5-12 (default 1.5). */
  dotSize?: number
  /** px, 8-120 (default 22). */
  dotSpacing?: number
  /** px, 12-200 (default 36). */
  gridSize?: number
  /** px, 0.5-6 (default 1). */
  gridLineWidth?: number
  /** px, 0-120 (default 40). */
  auroraBlur?: number
  /** Blob spread as percent, 0-100 (default 30). */
  auroraSize?: number
  /** Seconds per loop, 4-80 (default 18). */
  auroraSpeed?: number
  /** deg, 0-360 (default 90). */
  gradientAngle?: number
  /** Seconds per loop, 3-60 (default 16). */
  gradientSpeed?: number
  /** 0-100 (default derived from intensity). */
  grainOpacity?: number
  /** px tile, 40-400 (default 160). */
  grainSize?: number
  /** px, 0-200 (default 32). */
  revealDistance?: number
  /** Percent of the scroll-in range the animation spans, 5-100 (default 40). */
  revealDuration?: number
  /** Percent of scroll-in before it starts, 0-60 (default 0). */
  revealDelay?: number
  revealEasing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'
  /** px, 0-40 (default 4). */
  hoverLift?: number
  /** Percent, 100-120 (default 102 for zoom). */
  hoverScale?: number
  /** Glass tint opacity percent, 0-100 (default 18). */
  glassOpacity?: number
  /** Glass border opacity percent, 0-100 (default 30). */
  glassBorder?: number
  /** 0-100 (default 50). Tilt angle and magnetic pull; also sets the spotlight radius. */
  pointerFxStrength?: number
  /** Spotlight glow colour (safe colour). */
  spotlightColor?: string
  /** Seconds per full Ken Burns cycle, 5-60 (default 20). */
  kenBurnsDuration?: number
  /** Animated border colours (safe colours). Glow uses the first one. */
  borderFxColor?: string
  borderFxColor2?: string
  /** px, 1-8 (default 2). */
  borderFxWidth?: number
  /** Seconds per turn (conic) or pulse (glow), 2-20 (default 8). */
  borderFxSpeed?: number
  /** Text effect for every heading and paragraph inside the block (not the block itself). */
  textFx?: TextFx
  /** Text effect colour (safe colour). Gradient start, outline colour or glow colour. */
  textFxColor?: string
  /** Gradient end colour (safe colour). */
  textFxColor2?: string
  /** Gradient angle in degrees, 0-360 (default 90). */
  textFxAngle?: number
  /** Outline width in px, 1-6 (default 2). */
  textFxStroke?: number
  /** Gradient colours drift slowly. CSS only; off under reduced motion. */
  textFxAnimated?: boolean

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

  // Display conditions (Visibility rules): all that are set must pass; decided in the browser, never on the server.
  showFrom?: string
  showUntil?: string
  showAuth?: 'in' | 'out'
  /** Comma list of role slugs. */
  showRoles?: string
  /** Text the page path or query must contain. */
  showUrl?: string

  // Visibility
  hideOnMobile?: boolean
  hideOnDesktop?: boolean

  // Advanced
  customClass?: string
  anchorId?: string

  // Advanced (Elementor-style). All optional; unset emits no CSS.
  /** Transform, normal state: deg, percent, px. Emitted inline. */
  tfRotate?: number
  tfScale?: number
  tfTranslateX?: number
  tfTranslateY?: number
  tfSkewX?: number
  tfSkewY?: number
  /** Transform on hover, same units. Emitted as a scoped, hover-gated rule in blockStyleCss(). */
  tfhRotate?: number
  tfhScale?: number
  tfhTranslateX?: number
  tfhTranslateY?: number
  tfhSkewX?: number
  tfhSkewY?: number
  /** Transition length for transform, ms 0-2000 (default 250). */
  tfDuration?: number
  /** Normal | Hover state: colours, shadow and radius applied on hover (hover-capable devices only). Unset = same as normal. */
  hoverBgColor?: string
  hoverTextColor?: string
  hoverBorderColor?: string
  /** Same presets as boxShadow; 'none' removes the shadow on hover. */
  hoverBoxShadow?: BoxShadowPreset
  /** px, 0-200. */
  hoverBorderRadius?: number
  /** Transition length for the hover colour/shadow/radius changes, ms 0-2000 (default 250). */
  hoverTransitionMs?: number
  position?: BlockPosition
  posTop?: number
  posRight?: number
  posBottom?: number
  posLeft?: number
  zIndex?: number
  /** 0-100 percent. */
  opacity?: number
  blendMode?: BlendMode
  /** CSS filter parts, each unset unless set here. */
  filterBlur?: number
  filterBrightness?: number
  filterContrast?: number
  filterSaturate?: number
  filterGrayscale?: number
  filterHue?: number
  /** Space-separated extra wrapper classes; validated by cleanClassList(). */
  cssClasses?: string
  /** Scoped CSS; `selector` means this block. Validated by sanitizeCustomCss(). */
  customCss?: string
}

export type BlockPosition = 'relative' | 'absolute' | 'fixed' | 'sticky'
export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity'

export const POSITION_OPTIONS: { label: string; value: BlockPosition }[] = [
  { label: 'Relative', value: 'relative' },
  { label: 'Absolute', value: 'absolute' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Sticky', value: 'sticky' },
]

export const BLEND_MODE_OPTIONS: { label: string; value: BlendMode }[] = [
  { label: 'Normal', value: 'normal' },
  { label: 'Multiply', value: 'multiply' },
  { label: 'Screen', value: 'screen' },
  { label: 'Overlay', value: 'overlay' },
  { label: 'Darken', value: 'darken' },
  { label: 'Lighten', value: 'lighten' },
  { label: 'Color dodge', value: 'color-dodge' },
  { label: 'Color burn', value: 'color-burn' },
  { label: 'Hard light', value: 'hard-light' },
  { label: 'Soft light', value: 'soft-light' },
  { label: 'Difference', value: 'difference' },
  { label: 'Exclusion', value: 'exclusion' },
  { label: 'Hue', value: 'hue' },
  { label: 'Saturation', value: 'saturation' },
  { label: 'Color', value: 'color' },
  { label: 'Luminosity', value: 'luminosity' },
]

export const EMPTY_STYLE: BlockStyle = {}

const UNIT_KEYS = ['paddingUnit', 'marginUnit', 'selfWidthPercentUnit', 'minHeightUnit'] as const
/** Drops unit keys that are not on the whitelist. */
function withSafeUnits(style: BlockStyle): BlockStyle {
  const raw = style as Record<string, unknown>
  if (!UNIT_KEYS.some((k) => raw[k] !== undefined)) return style
  const out = { ...raw }
  for (const k of UNIT_KEYS) if (out[k] !== undefined && lengthUnit(out[k]) === undefined) delete out[k]
  return out as BlockStyle
}

/** anchorId becomes an element id and a CSS id selector, so only plain id characters pass. */
function withSafeAnchor(style: BlockStyle): BlockStyle {
  if (style.anchorId === undefined) return style
  if (typeof style.anchorId === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(style.anchorId)) return style
  const { anchorId: _drop, ...rest } = style
  void _drop
  return rest
}

/** Narrows an unknown JSON column value to a BlockStyle without throwing. */
export function asBlockStyle(value: unknown): BlockStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_STYLE
  // v2 designs are emitted by renderElement (src/lib/design/css.ts), not this wrapper.
  if (isDesignV2Raw(value)) return EMPTY_STYLE
  const style = value as BlockStyle
  const fx = withSafeAnchor(withSafeUnits(sanitizeRadius(sanitizeTypography(sanitizeVisibility(sanitizeFx(sanitizeSlides(sanitizeBgVideo(style))))))))
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

export const RADIUS_CORNER_KEYS = ['radiusTl', 'radiusTr', 'radiusBr', 'radiusBl'] as const
const RADIUS_MAX = 999

/** Clamps the per-corner radius keys to 0-999 and drops junk / non-boolean radiusLinked. */
function sanitizeRadius(style: BlockStyle): BlockStyle {
  const raw = style as Record<string, unknown>
  if (!RADIUS_CORNER_KEYS.some((k) => raw[k] !== undefined) && raw.radiusLinked === undefined) return style
  const out: Record<string, unknown> = { ...raw }
  for (const k of RADIUS_CORNER_KEYS) {
    if (raw[k] === undefined) continue
    const n = clampNum(raw[k], 0, RADIUS_MAX)
    if (n === undefined) delete out[k]
    else out[k] = n
  }
  if (raw.radiusLinked !== undefined && typeof raw.radiusLinked !== 'boolean') delete out.radiusLinked
  return out as BlockStyle
}

/** The border-radius shorthand when any corner is set (unset corners use borderRadius, else 0), else undefined. */
export function cornerRadiusValue(s: BlockStyle): string | undefined {
  if (!RADIUS_CORNER_KEYS.some((k) => isNum(s[k]))) return undefined
  const base = isNum(s.borderRadius) ? s.borderRadius : 0
  return RADIUS_CORNER_KEYS.map((k) => `${isNum(s[k]) ? s[k] : base}px`).join(' ')
}

const VIS_KEYS = ['showFrom', 'showUntil', 'showAuth', 'showRoles', 'showUrl'] as const

/** Validates the Display conditions keys: ISO dates, in/out, slug-shaped roles, short clean URL text. */
function sanitizeVisibility(style: BlockStyle): BlockStyle {
  const raw = style as Record<string, unknown>
  if (!VIS_KEYS.some((k) => raw[k] !== undefined)) return style
  const out: Record<string, unknown> = { ...raw }
  for (const k of VIS_KEYS) delete out[k]
  if (isIsoDate(raw.showFrom)) out.showFrom = raw.showFrom
  if (isIsoDate(raw.showUntil)) out.showUntil = raw.showUntil
  if (raw.showAuth === 'in' || raw.showAuth === 'out') out.showAuth = raw.showAuth
  const roles = cleanRoles(raw.showRoles)
  if (roles.length > 0) out.showRoles = roles.join(',')
  const url = cleanUrlText(raw.showUrl)
  if (url) out.showUrl = url
  return out as BlockStyle
}

/** True when the block has any Display condition set (used for the editor badge). */
export const hasVisibilityRules = (style: BlockStyle): boolean => rulesFromStyle(style) !== null

const clampNum = (v: unknown, min: number, max: number): number | undefined =>
  isNum(v) ? Math.min(max, Math.max(min, v)) : undefined
const SAFE_COLOR = /^[#a-zA-Z0-9(),.%\s/-]{1,64}$/
/** A colour string that is safe to put in a style value (no ; { } quotes or colons). Shared with the page-effects element. */
export const isSafeColor = (v: unknown): v is string => sanitizeColor(v) !== undefined
const VAR_COLOR = /^var\(--[a-z0-9_-]+\)$/
/** Returns the colour when it is safe to emit (hex / rgb / hsl / named / transparent / var(--token)), else undefined. */
export function sanitizeColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  if (VAR_COLOR.test(t)) return t
  if (!SAFE_COLOR.test(t) || /var\s*\(|url\s*\(|expression|import|\\/i.test(t)) return undefined
  return v
}
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
    if (raw[k] !== undefined && sanitizeColor(raw[k]) === undefined) drop(k)
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
  enumKey('pointerFx', POINTER_FX_OPTIONS)
  enumKey('kenBurns', KEN_BURNS_OPTIONS)
  enumKey('borderFx', BORDER_FX_OPTIONS)
  enumKey('textFx', TEXT_FX_OPTIONS)
  colorKey('textFxColor')
  colorKey('textFxColor2')
  numKey('textFxAngle', 0, 360)
  numKey('textFxStroke', 1, 6)
  if (raw.textFxAnimated !== undefined && typeof raw.textFxAnimated !== 'boolean') drop('textFxAnimated')
  colorKey('spotlightColor')
  colorKey('borderFxColor')
  colorKey('borderFxColor2')
  numKey('dividerTopSpeed', 4, 60)
  numKey('dividerBottomSpeed', 4, 60)
  numKey('bgEffectIntensity', 0, 100)
  numKey('particlesCount', 10, 120)
  numKey('parallaxStrength', 0, 100)
  numKey('glassBlur', 0, 40)
  for (const [k, min, max] of NUM_FX) numKey(k, min, max)
  enumKey('parallaxDirection', [{ value: 'up' }, { value: 'down' }])
  enumKey('particlesShape', [{ value: 'circle' }, { value: 'square' }])
  enumKey('revealEasing', REVEAL_EASING_OPTIONS)
  if (raw.particlesLinks !== undefined && typeof raw.particlesLinks !== 'boolean') drop('particlesLinks')
  colorKey('bgEffectColor')
  colorKey('bgEffectColor2')
  enumKey('overlayType', [{ value: 'none' }, { value: 'color' }, { value: 'gradient' }])
  colorKey('overlayColor')
  colorKey('overlayColor2')
  colorKey('hoverBgColor')
  colorKey('hoverTextColor')
  colorKey('hoverBorderColor')
  enumKey('hoverBoxShadow', BOX_SHADOW_OPTIONS)
  numKey('hoverBorderRadius', 0, 200)
  numKey('hoverTransitionMs', 0, 2000)
  numKey('overlayAngle', 0, 360)
  numKey('overlayOpacity', 0, 100)
  enumKey('overlayBlend', [
    { value: 'normal' }, { value: 'multiply' }, { value: 'screen' }, { value: 'overlay' },
    { value: 'soft-light' }, { value: 'color' }, { value: 'luminosity' },
  ])
  if (raw.glass !== undefined && typeof raw.glass !== 'boolean') drop('glass')
  enumKey('position', POSITION_OPTIONS)
  enumKey('blendMode', BLEND_MODE_OPTIONS)
  enumKey('maskShape', MASK_SHAPE_OPTIONS)
  enumKey('slideTransition', SLIDE_TRANSITION_OPTIONS)
  enumKey('blobMorphSpeed', BLOB_SPEED_OPTIONS)
  numKey('slideInterval', 2, 30)
  numKey('noise', 0, 100)
  if (raw.cssClasses !== undefined) {
    const classes = cleanClassList(raw.cssClasses)
    if (classes) out.cssClasses = classes
    else drop('cssClasses')
  }
  if (raw.customCss !== undefined) {
    const css = sanitizeCustomCss(raw.customCss)
    if (css) out.customCss = css
    else drop('customCss')
  }
  return out as BlockStyle
}

const TYPO_KEYS = [
  'fontSize', 'fontSizeUnit', 'fontWeight', 'lineHeight', 'letterSpacing', 'letterSpacingUnit',
  'textTransform', 'fontStyle', 'textDecoration', 'wordSpacing', 'textShadow',
] as const

const FONT_SIZE_UNITS: readonly string[] = ['px', 'em', 'rem', 'vw']
const LETTER_SPACING_UNITS: readonly string[] = ['px', 'em']
const TEXT_TRANSFORMS: readonly string[] = ['none', 'uppercase', 'lowercase', 'capitalize']
const FONT_STYLES: readonly string[] = ['normal', 'italic']
const TEXT_DECORATIONS: readonly string[] = ['none', 'underline', 'line-through']
const TEXT_SHADOWS: readonly string[] = ['none', 'sm', 'md', 'lg']

/** Validates the typography keys read from JSON (enum membership, numeric clamps). Same object back when none are set. */
function sanitizeTypography(style: BlockStyle): BlockStyle {
  const raw = style as Record<string, unknown>
  if (!TYPO_KEYS.some((k) => raw[k] !== undefined)) return style
  const out: Record<string, unknown> = { ...raw }
  const num = (k: string, min: number, max: number, round?: (n: number) => number) => {
    if (raw[k] === undefined) return
    const n = clampNum(raw[k], min, max)
    if (n === undefined) delete out[k]
    else out[k] = round ? round(n) : n
  }
  const en = (k: string, opts: readonly string[]) => {
    if (raw[k] !== undefined && !(typeof raw[k] === 'string' && opts.includes(raw[k] as string))) delete out[k]
  }
  num('fontSize', 0.1, 400)
  en('fontSizeUnit', FONT_SIZE_UNITS)
  num('fontWeight', 100, 900, (n) => Math.round(n / 100) * 100)
  num('lineHeight', 0.5, 5)
  num('letterSpacing', -20, 50)
  en('letterSpacingUnit', LETTER_SPACING_UNITS)
  en('textTransform', TEXT_TRANSFORMS)
  en('fontStyle', FONT_STYLES)
  en('textDecoration', TEXT_DECORATIONS)
  num('wordSpacing', -20, 100)
  en('textShadow', TEXT_SHADOWS)
  return out as BlockStyle
}

const TEXT_SHADOW_PRESETS: Record<Exclude<TextShadowPreset, 'none'>, string> = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 2px 8px rgba(0, 0, 0, 0.35)',
  lg: '0 4px 16px rgba(0, 0, 0, 0.45)',
}

/** The font-size value for a style (base, or merged with device overrides by the caller). */
const fontSizeValue = (s: BlockStyle): string | undefined =>
  isNum(s.fontSize) && s.fontSize > 0 ? `${s.fontSize}${FONT_SIZE_UNITS.includes(s.fontSizeUnit ?? '') ? s.fontSizeUnit : 'px'}` : undefined
const letterSpacingValue = (s: BlockStyle): string | undefined =>
  isNum(s.letterSpacing) ? `${s.letterSpacing}${s.letterSpacingUnit === 'em' ? 'em' : 'px'}` : undefined

/** Desktop typography as inline CSS on the wrapper; children inherit it (see blockStyleCss for headings). */
export function typographyCss(style: BlockStyle): React.CSSProperties {
  const css: React.CSSProperties = {}
  const size = fontSizeValue(style)
  if (size) css.fontSize = size
  if (isNum(style.fontWeight)) css.fontWeight = style.fontWeight
  if (isNum(style.lineHeight)) css.lineHeight = style.lineHeight
  const ls = letterSpacingValue(style)
  if (ls) css.letterSpacing = ls
  if (style.textTransform && TEXT_TRANSFORMS.includes(style.textTransform)) css.textTransform = style.textTransform
  if (style.fontStyle && FONT_STYLES.includes(style.fontStyle)) css.fontStyle = style.fontStyle
  if (style.textDecoration && TEXT_DECORATIONS.includes(style.textDecoration)) css.textDecoration = style.textDecoration
  if (isNum(style.wordSpacing)) css.wordSpacing = `${style.wordSpacing}px`
  if (style.textShadow && style.textShadow !== 'none' && TEXT_SHADOWS.includes(style.textShadow)) {
    css.textShadow = TEXT_SHADOW_PRESETS[style.textShadow]
  }
  return css
}

/** Typography properties (kebab-case) that are set on this style or any device override, so headings must inherit them. */
function typographyInheritProps(style: BlockStyle): string[] {
  const any = (f: (s: BlockStyle) => unknown) => [style, style.tablet, style.mobile].some((s) => s && f(s as BlockStyle) !== undefined)
  const props: string[] = []
  if (any(fontSizeValue)) props.push('font-size')
  if (any((s) => (isNum(s.fontWeight) ? 1 : undefined))) props.push('font-weight')
  if (any((s) => (isNum(s.lineHeight) ? 1 : undefined))) props.push('line-height')
  if (any(letterSpacingValue)) props.push('letter-spacing')
  if (style.textTransform) props.push('text-transform')
  if (style.fontStyle) props.push('font-style')
  if (isNum(style.wordSpacing)) props.push('word-spacing')
  if (style.textShadow && style.textShadow !== 'none') props.push('text-shadow')
  return props
}

const NUM_FX: readonly (readonly [string, number, number])[] = [
  ['parallaxDistance', 0, 400], ['particlesSizeMin', 0.5, 10], ['particlesSizeMax', 0.5, 12],
  ['particlesSpeed', 0, 300], ['particlesOpacity', 5, 100], ['particlesLinkDistance', 40, 300],
  ['particlesInteractRadius', 40, 400], ['dotSize', 0.5, 12], ['dotSpacing', 8, 120],
  ['gridSize', 12, 200], ['gridLineWidth', 0.5, 6], ['auroraBlur', 0, 120], ['auroraSize', 0, 100],
  ['auroraSpeed', 4, 80], ['gradientAngle', 0, 360], ['gradientSpeed', 3, 60], ['grainOpacity', 0, 100],
  ['grainSize', 40, 400], ['revealDistance', 0, 200], ['revealDuration', 5, 100], ['revealDelay', 0, 60],
  ['hoverLift', 0, 40], ['hoverScale', 100, 120], ['glassOpacity', 0, 100], ['glassBorder', 0, 100],
  ['pointerFxStrength', 0, 100], ['kenBurnsDuration', 5, 60], ['borderFxWidth', 1, 8], ['borderFxSpeed', 2, 20],
  // Advanced tab
  ['tfRotate', -360, 360], ['tfScale', 10, 300], ['tfTranslateX', -600, 600], ['tfTranslateY', -600, 600],
  ['tfSkewX', -60, 60], ['tfSkewY', -60, 60], ['tfhRotate', -360, 360], ['tfhScale', 10, 300],
  ['tfhTranslateX', -600, 600], ['tfhTranslateY', -600, 600], ['tfhSkewX', -60, 60], ['tfhSkewY', -60, 60],
  ['tfDuration', 0, 2000], ['posTop', -2000, 2000], ['posRight', -2000, 2000], ['posBottom', -2000, 2000],
  ['posLeft', -2000, 2000], ['zIndex', -10, 9999], ['opacity', 0, 100], ['filterBlur', 0, 40],
  ['filterBrightness', 0, 200], ['filterContrast', 0, 200], ['filterSaturate', 0, 300],
  ['filterGrayscale', 0, 100], ['filterHue', 0, 360],
]

export const REVEAL_EASING_OPTIONS: { label: string; value: NonNullable<BlockStyle['revealEasing']> }[] = [
  { label: 'Linear', value: 'linear' },
  { label: 'Ease', value: 'ease' },
  { label: 'Ease in', value: 'ease-in' },
  { label: 'Ease out', value: 'ease-out' },
  { label: 'Ease in-out', value: 'ease-in-out' },
]

const FX_KEYS = [
  ...NUM_FX.map((n) => n[0]), 'parallaxDirection', 'particlesShape', 'revealEasing', 'particlesLinks',
  'dividerTop', 'dividerBottom', 'dividerTopAnim', 'dividerBottomAnim', 'dividerTopSpeed', 'dividerBottomSpeed',
  'bgEffect', 'bgEffectColor', 'bgEffectColor2', 'bgEffectIntensity', 'particlesCount', 'particlesInteract',
  'parallax', 'parallaxStrength', 'reveal', 'hover', 'glass', 'glassBlur',
  'pointerFx', 'pointerFxStrength', 'spotlightColor', 'kenBurns', 'kenBurnsDuration',
  'borderFx', 'borderFxColor', 'borderFxColor2', 'borderFxWidth', 'borderFxSpeed',
  'overlayType', 'overlayColor', 'overlayColor2', 'overlayAngle', 'overlayOpacity', 'overlayBlend',
  'position', 'blendMode', 'cssClasses', 'customCss', 'maskShape',
  'slideInterval', 'slideTransition', 'blobMorphSpeed', 'noise',
  'hoverBgColor', 'hoverTextColor', 'hoverBorderColor', 'hoverBoxShadow', 'hoverBorderRadius', 'hoverTransitionMs',
  'textFx', 'textFxColor', 'textFxColor2', 'textFxAngle', 'textFxStroke', 'textFxAnimated',
] as const

/** Normal | Hover state keys (Elementor-style). Any of them set turns on the hover transition. */
const HOVER_STATE_KEYS = [
  'hoverBgColor', 'hoverTextColor', 'hoverBorderColor', 'hoverBoxShadow', 'hoverBorderRadius', 'hoverTransitionMs',
] as const
/** Properties that animate between the normal and hover values. */
const HOVER_TRANSITION_PROPS = ['background-color', 'color', 'border-color', 'box-shadow', 'border-radius'] as const

function hasHoverState(style: BlockStyle): boolean {
  return HOVER_STATE_KEYS.some((k) => style[k] !== undefined)
}

const CSS_CLASS_TOKEN = /^[A-Za-z_][A-Za-z0-9_-]{0,60}$/
const CUSTOM_CSS_MAX = 4000
/** Anything that could leave a rule, load a resource, or close the <style> element. Tested before and after `</` is stripped. */
const CUSTOM_CSS_BLOCKED =
  /<\/?style|<\/?script|@import|@charset|expression\s*\(|javascript:|behavior\s*:|-moz-binding|url\s*\(\s*['"]?\s*(javascript|data:text\/html)/i

/** Keeps at most 8 well-formed class names from a whitespace-separated string, rejoined with single spaces. */
export function cleanClassList(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v
    .split(/\s+/)
    .filter((t) => CSS_CLASS_TOKEN.test(t))
    .slice(0, 8)
    .join(' ')
}

/**
 * Makes user-written custom CSS safe to place inside a <style> element. Returns undefined when the
 * text matches a blocked pattern (the whole value is dropped, not partly stripped). Otherwise it is
 * capped at 4000 chars with every "</" removed, so it cannot close the style element.
 */
export function sanitizeCustomCss(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  if (CUSTOM_CSS_BLOCKED.test(v)) return undefined
  const text = v.slice(0, CUSTOM_CSS_MAX).replace(/<\//g, '')
  if (CUSTOM_CSS_BLOCKED.test(text)) return undefined
  if (!text.trim()) return undefined
  if (!customCssStaysInScope(text)) return undefined
  return text
}

/**
 * Custom CSS must not close the block's own rule or style other parts of the page: braces must
 * balance, and when the text has top-level rules every selector must contain the word `selector`.
 * Plain declarations (no braces) are allowed and wrapped in the block's scope at emit time.
 */
function customCssStaysInScope(text: string): boolean {
  let depth = 0
  let prelude = ''
  const preludes: string[] = []
  for (const ch of text) {
    if (ch === '{') {
      if (depth === 0) preludes.push(prelude.trim())
      depth += 1
      if (depth === 1) prelude = ''
    } else if (ch === '}') {
      depth -= 1
      if (depth < 0) return false
      if (depth === 0) prelude = ''
    } else if (depth === 0) {
      prelude += ch
    }
  }
  if (depth !== 0) return false
  if (preludes.length === 0) return true
  // Trailing text after the last rule would be a loose declaration outside the scope.
  if (prelude.trim()) return false
  return preludes.every((p) => /\bselector\b/.test(p))
}

const VIDEO_URL = /^(https:\/\/|\/(?!\/))[^\s"'<>()\\]+\.(mp4|webm)(\?[^\s"'<>()\\]*)?$/i
const IMAGE_URL = /^(https:\/\/|\/(?!\/))[^\s"'<>()\\]+\.(jpe?g|png|webp|avif|svg)(\?[^\s"'<>()\\]*)?$/i
const ASCII_VISIBLE = /^[\x21-\x7e]+$/

/**
 * True for a media URL that is safe to put in a src or url() : an https URL or a site-relative
 * path (never protocol-relative, javascript:, or data:), ASCII only, with the right extension.
 * No quotes, parentheses, backslashes or whitespace, so the value cannot break out of url().
 */
export function isSafeMediaUrl(v: unknown, kind: 'video' | 'image'): v is string {
  if (typeof v !== 'string' || v.length > 2048 || !ASCII_VISIBLE.test(v)) return false
  return (kind === 'video' ? VIDEO_URL : IMAGE_URL).test(v)
}

/** Drops background video keys whose values fail validation. Same object back when none are set. */
function sanitizeBgVideo(style: BlockStyle): BlockStyle {
  const raw = style as Record<string, unknown>
  if (raw.bgVideoUrl === undefined && raw.bgVideoPoster === undefined && raw.bgVideoLoop === undefined) return style
  const out: Record<string, unknown> = { ...raw }
  if (raw.bgVideoUrl !== undefined && !isSafeMediaUrl(raw.bgVideoUrl, 'video')) delete out.bgVideoUrl
  if (raw.bgVideoPoster !== undefined && !isSafeMediaUrl(raw.bgVideoPoster, 'image')) delete out.bgVideoPoster
  if (raw.bgVideoLoop !== undefined && typeof raw.bgVideoLoop !== 'boolean') delete out.bgVideoLoop
  return out as BlockStyle
}

export const SLIDE_TRANSITION_OPTIONS: { label: string; value: SlideTransition }[] = [
  { label: 'Fade', value: 'fade' },
  { label: 'Slide', value: 'slide' },
  { label: 'Zoom', value: 'zoom' },
]
export const BLOB_SPEED_OPTIONS: { label: string; value: BlobSpeed }[] = [
  { label: 'Slow', value: 'slow' },
  { label: 'Medium', value: 'medium' },
  { label: 'Fast', value: 'fast' },
]
export const MAX_SLIDES = 6

/** Keeps up to 6 safe image URLs in bgSlides (and finite ids in bgSlideIds); drops the keys when nothing valid is left. */
function sanitizeSlides(style: BlockStyle): BlockStyle {
  const raw = style as Record<string, unknown>
  if (raw.bgSlides === undefined && raw.bgSlideIds === undefined) return style
  const out: Record<string, unknown> = { ...raw }
  if (raw.bgSlides !== undefined) {
    const urls = Array.isArray(raw.bgSlides) ? raw.bgSlides.filter((u): u is string => isSafeMediaUrl(u, 'image')).slice(0, MAX_SLIDES) : []
    if (urls.length > 0) out.bgSlides = urls
    else delete out.bgSlides
  }
  if (raw.bgSlideIds !== undefined) {
    const ids = Array.isArray(raw.bgSlideIds) ? raw.bgSlideIds.filter((n): n is number => Number.isInteger(n) && n > 0).slice(0, MAX_SLIDES) : []
    if (ids.length > 0) out.bgSlideIds = ids
    else delete out.bgSlideIds
  }
  return out as BlockStyle
}

export const MASK_SHAPE_OPTIONS: { label: string; value: MaskShape }[] = [
  { label: 'None', value: 'none' },
  { label: 'Circle', value: 'circle' },
  { label: 'Rounded corners', value: 'rounded' },
  { label: 'Blob', value: 'blob' },
  { label: 'Hexagon', value: 'hexagon' },
  { label: 'Diamond', value: 'diamond' },
  { label: 'Arch', value: 'arch' },
  { label: 'Triangle', value: 'triangle' },
  { label: 'Wave', value: 'wave' },
  { label: 'Morphing blob (animated)', value: 'blob-morph' },
]

/**
 * Literal clip-path values. Only basic shapes and inset(), never url(#...) references, so a mask
 * renders the same on the canvas and on the live site.
 */
const MASK_CLIP: Record<Exclude<MaskShape, 'none' | 'blob-morph'>, string> = {
  circle: 'circle(50% at 50% 50%)',
  rounded: 'inset(0 round 24px)',
  blob: 'polygon(28% 4%, 62% 0%, 92% 14%, 100% 46%, 90% 80%, 66% 100%, 32% 96%, 6% 82%, 0% 50%, 8% 18%)',
  hexagon: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  arch: 'polygon(0% 100%, 0% 50%, 4% 30%, 15% 13%, 30% 4%, 50% 0%, 70% 4%, 85% 13%, 96% 30%, 100% 50%, 100% 100%)',
  triangle: 'polygon(50% 0%, 100% 100%, 0% 100%)',
  wave: 'polygon(0% 0%, 100% 0%, 100% 85%, 87.5% 92%, 75% 85%, 62.5% 92%, 50% 85%, 37.5% 92%, 25% 85%, 12.5% 92%, 0% 85%)',
}

/** The clip-path for a mask shape, or undefined for none / an unknown value. */
export function maskClipPath(shape: unknown): string | undefined {
  if (typeof shape !== 'string' || shape === 'none') return undefined
  return Object.prototype.hasOwnProperty.call(MASK_CLIP, shape) ? MASK_CLIP[shape as Exclude<MaskShape, 'none' | 'blob-morph'>] : undefined
}

/** Background overlay layer. Null when off (legacy bgOverlay is rendered separately). */
export function overlayStyle(style: BlockStyle): React.CSSProperties | null {
  if (style.overlayType === undefined || style.overlayType === 'none') return null
  const opacity = (style.overlayOpacity ?? 50) / 100
  const out: React.CSSProperties = { opacity }
  if (style.overlayType === 'color') {
    out.background = style.overlayColor || '#000000'
  } else {
    const angle = style.overlayAngle ?? 180
    out.background = `linear-gradient(${angle}deg, ${style.overlayColor || '#000000'}, ${style.overlayColor2 || 'transparent'})`
  }
  if (style.overlayBlend && style.overlayBlend !== 'normal') out.mixBlendMode = style.overlayBlend
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
  for (const key of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'] as const) {
    if (isNum(r[key])) out[key] = r[key]
  }
  if (typeof r.textAlign === 'string' && TEXT_ALIGNS.includes(r.textAlign)) out.textAlign = r.textAlign as TextAlign
  if (isNum(r.fontSize) && r.fontSize > 0) out.fontSize = Math.min(400, Math.max(0.1, r.fontSize))
  if (typeof r.fontSizeUnit === 'string' && FONT_SIZE_UNITS.includes(r.fontSizeUnit)) out.fontSizeUnit = r.fontSizeUnit as FontSizeUnit
  if (isNum(r.lineHeight)) out.lineHeight = Math.min(5, Math.max(0.5, r.lineHeight))
  if (isNum(r.letterSpacing)) out.letterSpacing = Math.min(50, Math.max(-20, r.letterSpacing))
  for (const key of ['minHeightUnit', 'paddingUnit', 'marginUnit', 'selfWidthPercentUnit'] as const) {
    const u = lengthUnit(r[key])
    if (u) out[key] = u
  }
  if (typeof r.selfAlign === 'string' && SELF_ALIGNS.includes(r.selfAlign)) out.selfAlign = r.selfAlign as BlockStyle['selfAlign']
  if (typeof r.selfWidth === 'string' && SELF_WIDTHS.includes(r.selfWidth)) out.selfWidth = r.selfWidth as BlockStyle['selfWidth']
  if (isNum(r.selfWidthPercent) && r.selfWidthPercent > 0) out.selfWidthPercent = r.selfWidthPercent
  for (const key of RADIUS_CORNER_KEYS) {
    const n = clampNum(r[key], 0, RADIUS_MAX)
    if (n !== undefined) out[key] = n
  }
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

  // The image moves to its own layer (kenburnsLayer) when Ken Burns is on, so the wrapper must not paint it too.
  if (style.bgType === 'image' && isStr(style.bgImageUrl) && !(style.parallax === 'background') && !hasKenBurnsLayer(style)) {
    css.backgroundImage = `url(${style.bgImageUrl})`
    css.backgroundSize = 'cover'
    css.backgroundPosition = 'center'
  }

  // Video background: the poster is the wrapper's own background, so it shows until the video
  // plays and stays visible when the video layer is hidden for reduced motion.
  if (style.bgType === 'video' && isSafeMediaUrl(style.bgVideoPoster, 'image')) {
    css.backgroundImage = `url(${style.bgVideoPoster})`
    css.backgroundSize = 'cover'
    css.backgroundPosition = 'center'
  }

  // Slideshow: the first slide is the static fallback (no CSS animation support, reduced motion). The animated layers sit on top.
  const firstSlide = slideshowUrls(style)[0]
  if (style.bgType === 'slideshow' && firstSlide) {
    css.backgroundImage = `url(${firstSlide})`
    css.backgroundSize = 'cover'
    css.backgroundPosition = 'center'
  }

  const pu = lengthUnit(style.paddingUnit) ?? 'px'
  const mu = lengthUnit(style.marginUnit) ?? 'px'
  if (isNum(style.paddingTop)) css.paddingTop = `${style.paddingTop}${pu}`
  if (isNum(style.paddingBottom)) css.paddingBottom = `${style.paddingBottom}${pu}`
  if (isNum(style.paddingLeft)) css.paddingLeft = `${style.paddingLeft}${pu}`
  if (isNum(style.paddingRight)) css.paddingRight = `${style.paddingRight}${pu}`
  if (isNum(style.marginTop)) css.marginTop = `${style.marginTop}${mu}`
  if (isNum(style.marginBottom)) css.marginBottom = `${style.marginBottom}${mu}`
  Object.assign(css, selfPositionCss(style))
  if (isNum(style.marginLeft)) css.marginLeft = `${style.marginLeft}${mu}`
  if (isNum(style.marginRight)) css.marginRight = `${style.marginRight}${mu}`
  const fontValue = blockFontStack(style.fontFamily)
  if (fontValue) css.fontFamily = fontValue
  if (isStr(style.textColor)) css.color = style.textColor
  if (style.textAlign) css.textAlign = style.textAlign
  Object.assign(css, typographyCss(style))
  if (isNum(style.minHeight)) css.minHeight = minHeightValue(style.minHeight, style.minHeightUnit)

  if (isNum(style.borderWidth) && style.borderWidth > 0) {
    css.borderWidth = `${style.borderWidth}px`
    css.borderStyle = style.borderStyle || 'solid'
    css.borderColor = style.borderColor || 'currentColor'
  }
  if (isNum(style.borderRadius)) css.borderRadius = `${style.borderRadius}px`
  const corners = cornerRadiusValue(style)
  if (corners) css.borderRadius = corners
  if (style.boxShadow && style.boxShadow !== 'none') css.boxShadow = BOX_SHADOW_PRESETS[style.boxShadow]
  const clip = maskClipPath(style.maskShape)
  if (clip) css.clipPath = clip
  Object.assign(css, advancedCss(style))
  // One comma-separated list: the transform transition from advancedCss (if any) plus the hover colour/shadow/radius ones.
  if (hasHoverState(style)) {
    const ms = isNum(style.hoverTransitionMs) ? style.hoverTransitionMs : 250
    const parts = css.transition ? [String(css.transition)] : []
    for (const prop of HOVER_TRANSITION_PROPS) parts.push(`${prop} ${ms}ms ease`)
    css.transition = parts.join(', ')
  }
  // The inline transition above would hide the class-based spring, so magnetic's translate is listed here.
  if (style.pointerFx === 'magnetic') {
    css.transition = [...(css.transition ? [String(css.transition)] : []), 'translate 450ms cubic-bezier(.2,.8,.2,1)'].join(', ')
  }

  return css
}

/** The transform list for the normal ('tf') or hover ('tfh') keys, or '' when none is set. */
function transformValue(style: BlockStyle, prefix: 'tf' | 'tfh'): string {
  const raw = style as Record<string, unknown>
  const num = (suffix: string): number | undefined => {
    const v = raw[prefix + suffix]
    return isNum(v) ? v : undefined
  }
  const parts: string[] = []
  const tx = num('TranslateX')
  const ty = num('TranslateY')
  if (tx !== undefined || ty !== undefined) parts.push(`translate(${tx ?? 0}px,${ty ?? 0}px)`)
  const rotate = num('Rotate')
  if (rotate !== undefined) parts.push(`rotate(${rotate}deg)`)
  const skewX = num('SkewX')
  if (skewX !== undefined) parts.push(`skewX(${skewX}deg)`)
  const skewY = num('SkewY')
  if (skewY !== undefined) parts.push(`skewY(${skewY}deg)`)
  const scale = num('Scale')
  if (scale !== undefined) parts.push(`scale(${scale / 100})`)
  return parts.join(' ')
}

/** CSS filter list from the set filter keys, or '' when none is set. */
function filterValue(style: BlockStyle): string {
  const parts: string[] = []
  if (isNum(style.filterBlur)) parts.push(`blur(${style.filterBlur}px)`)
  if (isNum(style.filterBrightness)) parts.push(`brightness(${style.filterBrightness}%)`)
  if (isNum(style.filterContrast)) parts.push(`contrast(${style.filterContrast}%)`)
  if (isNum(style.filterSaturate)) parts.push(`saturate(${style.filterSaturate}%)`)
  if (isNum(style.filterGrayscale)) parts.push(`grayscale(${style.filterGrayscale}%)`)
  if (isNum(style.filterHue)) parts.push(`hue-rotate(${style.filterHue}deg)`)
  return parts.join(' ')
}

/**
 * Elementor "Advanced" inline CSS: normal transform + transition, position and offsets, z-index,
 * opacity, blend mode and filters. The hover transform and custom CSS are scoped rules (blockStyleCss).
 */
function advancedCss(style: BlockStyle): React.CSSProperties {
  const css: React.CSSProperties = {}
  const tf = transformValue(style, 'tf')
  if (tf) css.transform = tf
  if (tf || transformValue(style, 'tfh')) {
    css.transition = `transform ${isNum(style.tfDuration) ? style.tfDuration : 250}ms ease`
  }
  if (style.position && POSITION_OPTIONS.some((o) => o.value === style.position)) {
    css.position = style.position
    if (isNum(style.posTop)) css.top = `${style.posTop}px`
    if (isNum(style.posRight)) css.right = `${style.posRight}px`
    if (isNum(style.posBottom)) css.bottom = `${style.posBottom}px`
    if (isNum(style.posLeft)) css.left = `${style.posLeft}px`
  }
  if (isNum(style.zIndex)) css.zIndex = style.zIndex
  if (isNum(style.opacity)) css.opacity = style.opacity / 100
  if (style.blendMode && style.blendMode !== 'normal' && BLEND_MODE_OPTIONS.some((o) => o.value === style.blendMode)) {
    css.mixBlendMode = style.blendMode
  }
  const filter = filterValue(style)
  if (filter) css.filter = filter
  return css
}

const minHeightValue = (value: number, unit: string | undefined): string => `${value}${lengthUnit(unit) ?? 'px'}`

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
    const wu = lengthUnit(style.selfWidthPercentUnit) ?? '%'
    css.width = `${wu === '%' ? Math.min(100, style.selfWidthPercent) : style.selfWidthPercent}${wu}`
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
export const FONT_TOKEN_PATTERN = /^var\(--(?:eg-)?font-[a-z0-9-]{1,40}\)$/
/** Theme font tokens offered in the Family select (the site sets --font-display / --font-body, see the layout). */
export const FONT_TOKEN_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'var(--font-display)', label: 'Theme heading font' },
  { value: 'var(--font-body)', label: 'Theme body font' },
]

export function blockFontStack(key: string | undefined): string | null {
  if (typeof key === 'string' && FONT_TOKEN_PATTERN.test(key.trim())) return key.trim()
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
  const mergedU: BlockStyle = { ...style, ...style.tablet, ...(device === 'mobile' ? style.mobile : {}) }
  const pu = lengthUnit(mergedU.paddingUnit) ?? 'px'
  const mu = lengthUnit(mergedU.marginUnit) ?? 'px'
  const px = (name: string, v: number | undefined, u: string) => {
    if (isNum(v)) decls.push(`${name}:${v}${u} !important`)
  }
  px('padding-top', own.paddingTop ?? (own.paddingUnit ? mergedU.paddingTop : undefined), pu)
  px('padding-bottom', own.paddingBottom ?? (own.paddingUnit ? mergedU.paddingBottom : undefined), pu)
  px('padding-left', own.paddingLeft ?? (own.paddingUnit ? mergedU.paddingLeft : undefined), pu)
  px('padding-right', own.paddingRight ?? (own.paddingUnit ? mergedU.paddingRight : undefined), pu)
  px('margin-top', own.marginTop ?? (own.marginUnit ? mergedU.marginTop : undefined), mu)
  px('margin-bottom', own.marginBottom ?? (own.marginUnit ? mergedU.marginBottom : undefined), mu)
  const posTouched = own.selfAlign !== undefined || own.selfWidth !== undefined || own.selfWidthPercent !== undefined || own.selfWidthPercentUnit !== undefined
  if (!posTouched) {
    px('margin-left', own.marginLeft ?? (own.marginUnit ? mergedU.marginLeft : undefined), mu)
    px('margin-right', own.marginRight ?? (own.marginUnit ? mergedU.marginRight : undefined), mu)
  }
  if (RADIUS_CORNER_KEYS.some((k) => own[k] !== undefined)) {
    const cr = cornerRadiusValue(mergedU)
    if (cr) decls.push(`border-radius:${cr} !important`)
  }
  if (own.textAlign) decls.push(`text-align:${own.textAlign} !important`)
  if (own.fontSize !== undefined || own.fontSizeUnit !== undefined) {
    const merged: BlockStyle = { ...style, ...style.tablet, ...(device === 'mobile' ? style.mobile : {}) }
    const size = fontSizeValue(merged)
    if (size) decls.push(`font-size:${size} !important`)
  }
  if (isNum(own.lineHeight)) decls.push(`line-height:${own.lineHeight} !important`)
  if (own.letterSpacing !== undefined) {
    const merged: BlockStyle = { ...style, ...style.tablet, ...(device === 'mobile' ? style.mobile : {}) }
    const ls = letterSpacingValue(merged)
    if (ls) decls.push(`letter-spacing:${ls} !important`)
  }
  if (isNum(own.minHeight) || own.minHeightUnit) {
    const merged = { ...style, ...style.tablet, ...(device === 'mobile' ? style.mobile : {}) }
    if (isNum(merged.minHeight)) decls.push(`min-height:${minHeightValue(merged.minHeight, merged.minHeightUnit)} !important`)
  }
  if (posTouched) {
    const merged: BlockStyle = { ...style, ...style.tablet, ...(device === 'mobile' ? style.mobile : {}) }
    const pos = selfPositionCss(merged)
    decls.push(`width:${pos.width ?? 'auto'} !important`)
    decls.push(`max-width:${pos.maxWidth ?? 'none'} !important`)
    const left = isNum(merged.marginLeft) ? `${merged.marginLeft}${mu}` : (pos.marginLeft ?? '0')
    const right = isNum(merged.marginRight) ? `${merged.marginRight}${mu}` : (pos.marginRight ?? '0')
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

  // Hover transform. !important because the normal transform is an inline style, which beats a stylesheet rule.
  const tfh = transformValue(style, 'tfh')
  if (tfh) rules.push(`@media (hover:hover){${sel}:hover{transform:${tfh} !important}}`)

  // Hover colours, shadow and radius. !important for the same reason: the normal values are inline.
  const hoverDecls = hoverStateDecls(style)
  if (hoverDecls.length > 0) rules.push(`@media (hover:hover){${sel}:hover{${hoverDecls.join(';')}}}`)

  // Custom CSS: `selector` is this block; without it the text is taken as the block's declarations.
  // Sanitized again here, since this is where the text lands inside a <style> element.
  const custom = sanitizeCustomCss(style.customCss)
  if (custom) {
    rules.push(/\bselector\b/.test(custom) ? custom.replace(/\bselector\b/g, () => sel) : `${sel}{${custom}}`)
  }

  // Headings set their own theme font, so the block font is repeated on them here.
  const fontValue = blockFontStack(style.fontFamily)
  if (fontValue) {
    rules.push(`${sel} :is(h1,h2,h3,h4,h5,h6){font-family:${fontValue}}`)
  }
  // Global heading rules (and browser defaults) fix size/weight/spacing on h1-h6, so any typography
  // set here is inherited from the wrapper. A nested block with its own value still wins: `inherit`
  // reads the nearest parent, which is that block's wrapper.
  const inheritProps = typographyInheritProps(style)
  if (inheritProps.length > 0) {
    rules.push(`${sel} :is(h1,h2,h3,h4,h5,h6,button){${inheritProps.map((p) => `${p}:inherit`).join(';')}}`)
  }

  return rules.join('')
}

/**
 * Declarations for the scoped hover rule. Colours are re-checked against SAFE_COLOR because this text
 * lands inside a <style> element, even though asBlockStyle() has already validated them.
 */
function hoverStateDecls(style: BlockStyle): string[] {
  const decls: string[] = []
  const color = (name: string, v: unknown) => {
    if (sanitizeColor(v) !== undefined) decls.push(`${name}:${v} !important`)
  }
  color('background-color', style.hoverBgColor)
  color('color', style.hoverTextColor)
  color('border-color', style.hoverBorderColor)
  const shadow = style.hoverBoxShadow
  if (shadow === 'none') decls.push('box-shadow:none !important')
  else if (shadow) {
    const preset = BOX_SHADOW_PRESETS[shadow as Exclude<BoxShadowPreset, 'none'>]
    if (preset) decls.push(`box-shadow:${preset} !important`)
  }
  if (isNum(style.hoverBorderRadius)) decls.push(`border-radius:${style.hoverBorderRadius}px !important`)
  return decls
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

export const POINTER_FX_OPTIONS: { label: string; value: PointerFx }[] = [
  { label: 'None', value: 'none' },
  { label: 'Spotlight', value: 'spotlight' },
  { label: 'Tilt', value: 'tilt' },
  { label: 'Magnetic', value: 'magnetic' },
]

export const KEN_BURNS_OPTIONS: { label: string; value: KenBurns }[] = [
  { label: 'None', value: 'none' },
  { label: 'Zoom in', value: 'zoom-in' },
  { label: 'Zoom out', value: 'zoom-out' },
  { label: 'Pan', value: 'pan' },
]

export const BORDER_FX_OPTIONS: { label: string; value: BorderFx }[] = [
  { label: 'None', value: 'none' },
  { label: 'Glow', value: 'glow' },
  { label: 'Conic spin', value: 'conic-spin' },
]

export const TEXT_FX_OPTIONS: { label: string; value: TextFx }[] = [
  { label: 'None', value: 'none' },
  { label: 'Gradient', value: 'gradient' },
  { label: 'Outline', value: 'outline' },
  { label: 'Glow', value: 'shadow-glow' },
]

/** The text effect this style asks for, or undefined when it is none or not a known value. */
function textFxName(style: BlockStyle): Exclude<TextFx, 'none'> | undefined {
  const v = style.textFx
  return v === 'gradient' || v === 'outline' || v === 'shadow-glow' ? v : undefined
}

/** The slideshow's safe image URLs (max 6) when bgType is 'slideshow', else []. */
export function slideshowUrls(style: BlockStyle): string[] {
  if (style.bgType !== 'slideshow' || !Array.isArray(style.bgSlides)) return []
  return style.bgSlides.filter((u): u is string => isSafeMediaUrl(u, 'image')).slice(0, MAX_SLIDES)
}

/** CSS-only crossfade layer: one div per slide, staggered by animation-delay. Null under 2 slides (the wrapper image is enough). */
export function slideshowLayer(style: BlockStyle): { className: string; style: React.CSSProperties; slides: { url: string; style: React.CSSProperties }[] } | null {
  const urls = slideshowUrls(style)
  if (urls.length < 2) return null
  const t = isNum(style.slideInterval) ? Math.min(30, Math.max(2, style.slideInterval)) : 5
  const mode = style.slideTransition === 'slide' || style.slideTransition === 'zoom' ? style.slideTransition : 'fade'
  const n = urls.length
  return {
    className: `be-fx be-fx--ss be-ss--${mode}`,
    style: { ['--be-ss-t' as string]: `${t * n}s` } as React.CSSProperties,
    slides: urls.map((url, i) => ({
      url,
      style: { backgroundImage: `url(${url})`, animationName: `be-ss-${mode}-${n}`, animationDelay: `${t * i}s` },
    })),
  }
}

/** Noise (grain) layer over the background and gradient, or null when off. The SVG is a URL-encoded ASCII data URI. */
const NOISE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>"
/** Fully percent-encoded (quotes and parentheses too), so it is safe unquoted inside url(). */
export const NOISE_DATA_URI = `url(data:image/svg+xml,${encodeURIComponent(NOISE_SVG).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)})`
export function noiseLayer(style: BlockStyle): { className: string; style: React.CSSProperties } | null {
  if (!isNum(style.noise) || style.noise <= 0) return null
  return {
    className: 'be-fx be-fx--noise',
    style: { opacity: Math.min(100, style.noise) / 100, backgroundImage: NOISE_DATA_URI },
  }
}

/** Ken Burns moves the background image onto its own layer. Background parallax already owns that image, so it wins. */
export function hasKenBurnsLayer(style: BlockStyle): boolean {
  return (
    !!style.kenBurns && style.kenBurns !== 'none' && style.bgType === 'image' &&
    isStr(style.bgImageUrl) && style.parallax !== 'background'
  )
}

/** The Ken Burns image layer, or null. Rendered by StyledBlock and the editor canvas, like the parallax layer. */
export function kenBurnsLayer(style: BlockStyle): { className: string; style: React.CSSProperties } | null {
  if (!hasKenBurnsLayer(style)) return null
  return {
    className: `be-fx be-fx--kb be-fx--kb-${style.kenBurns}`,
    style: { backgroundImage: `url(${style.bgImageUrl})` },
  }
}

/** Extra wrapper classes for the effect keys; empty when none are set. */
export function blockFxClasses(style: BlockStyle): string {
  const c: string[] = []
  if (style.reveal && style.reveal !== 'none') c.push(`be-fx-reveal-${style.reveal}`)
  if (style.hover && style.hover !== 'none') c.push(`be-fx-hover-${style.hover}`)
  if (style.glass) c.push('be-fx-glass')
  if (style.parallax === 'background' && style.bgType === 'image' && isStr(style.bgImageUrl)) c.push('be-fx-parallax-bg')
  else if (style.parallax === 'float-up' || style.parallax === 'float-down') c.push(`be-fx-parallax-${style.parallax}`)
  if (style.pointerFx && style.pointerFx !== 'none') c.push(`be-fx-pointer-${style.pointerFx}`)
  if (style.maskShape === 'blob-morph') c.push('be-fx-blobmorph', `be-fx-blobmorph-${style.blobMorphSpeed ?? 'medium'}`)
  if (style.borderFx && style.borderFx !== 'none') c.push(style.borderFx === 'conic-spin' ? 'be-fx-border-conic' : 'be-fx-border-glow')
  const tfx = textFxName(style)
  if (tfx) {
    c.push(`be-fx--textfx-${tfx}`)
    if (tfx === 'gradient' && style.textFxAnimated === true) c.push('be-fx--textfx-anim')
  }
  // Isolates the z-index:-1 layers (bg effect, video, Ken Burns, spotlight) so they sit behind the content, not behind the wrapper's background.
  if (
    hasFxLayer(style) || c.includes('be-fx-parallax-bg') || style.bgType === 'video' ||
    hasKenBurnsLayer(style) || style.pointerFx === 'spotlight' ||
    slideshowUrls(style).length > 1 || noiseLayer(style) !== null || style.maskShape === 'blob-morph'
  ) c.push('be-fx-clip')
  const custom = cleanClassList(style.cssClasses)
  if (custom) c.push(custom)
  return c.join(' ')
}

export const hasFxLayer = (style: BlockStyle): boolean => !!style.bgEffect && style.bgEffect !== 'none'

/** CSS custom properties the effect classes read; only the ones that were set. */
export function blockFxVars(style: BlockStyle): Record<string, string> {
  const v: Record<string, string> = {}
  if (isStr(style.bgEffectColor)) v['--be-fx-c'] = style.bgEffectColor
  if (isStr(style.bgEffectColor2)) v['--be-fx-c2'] = style.bgEffectColor2
  if (isNum(style.bgEffectIntensity)) v['--be-fx-i'] = String(style.bgEffectIntensity / 100)
  if (style.parallax && style.parallax !== 'none') {
    v['--be-par'] = `${isNum(style.parallaxDistance) ? style.parallaxDistance : Math.round((isNum(style.parallaxStrength) ? style.parallaxStrength : 40) * 1.6)}px`
    if (style.parallax === 'background' && style.parallaxDirection === 'down') v['--be-pdir'] = '-1'
  }
  if (style.glass) {
    v['--be-glass'] = `${isNum(style.glassBlur) ? style.glassBlur : 12}px`
    if (isNum(style.glassOpacity)) v['--be-glass-a'] = String(style.glassOpacity / 100)
    if (isNum(style.glassBorder)) v['--be-glass-b'] = String(style.glassBorder / 100)
  }
  const px = (name: string, n: number | undefined, unit = 'px') => {
    if (isNum(n)) v[name] = `${n}${unit}`
  }
  const fx = style.bgEffect
  if (fx === 'dots') {
    px('--be-dot', style.dotSize)
    px('--be-dsp', style.dotSpacing)
  } else if (fx === 'grid') {
    px('--be-gsz', style.gridSize)
    px('--be-gw', style.gridLineWidth)
  } else if (fx === 'aurora') {
    px('--be-aur-b', style.auroraBlur)
    px('--be-aur-s', style.auroraSize, '%')
    px('--be-aur-t', style.auroraSpeed, 's')
  } else if (fx === 'gradient-shift') {
    px('--be-gs-a', style.gradientAngle, 'deg')
    px('--be-gs-t', style.gradientSpeed, 's')
  } else if (fx === 'grain') {
    if (isNum(style.grainOpacity)) v['--be-gr-o'] = String(style.grainOpacity / 100)
    px('--be-gr-s', style.grainSize)
  }
  if (style.reveal && style.reveal !== 'none') {
    if (isNum(style.revealDistance)) {
      v['--be-rv-d'] = `${style.revealDistance}px`
      v['--be-rv-z'] = String(Math.max(0.2, 1 - style.revealDistance / 400))
      v['--be-rv-b'] = `${Math.round(style.revealDistance / 3.2)}px`
    }
    const start = isNum(style.revealDelay) ? style.revealDelay : 0
    if (isNum(style.revealDelay)) v['--be-rv-s'] = `${start}%`
    if (isNum(style.revealDuration) || isNum(style.revealDelay)) {
      v['--be-rv-e'] = `${Math.min(100, start + (isNum(style.revealDuration) ? style.revealDuration : 40))}%`
    }
    if (style.revealEasing) v['--be-rv-ease'] = style.revealEasing
  }
  if (style.hover === 'lift' || style.hover === 'zoom') {
    px('--be-hl', style.hoverLift)
    if (isNum(style.hoverScale)) v['--be-hs'] = String(style.hoverScale / 100)
  }
  if (style.pointerFx === 'spotlight') {
    if (isStr(style.spotlightColor)) v['--be-spot'] = style.spotlightColor
    v['--be-spot-r'] = `${120 + (isNum(style.pointerFxStrength) ? style.pointerFxStrength : 50) * 2}px`
  }
  if (hasKenBurnsLayer(style) && isNum(style.kenBurnsDuration)) v['--be-kb-t'] = `${style.kenBurnsDuration}s`
  if (textFxName(style)) {
    if (isSafeColor(style.textFxColor)) v['--be-tfx-c'] = style.textFxColor
    if (isSafeColor(style.textFxColor2)) v['--be-tfx-c2'] = style.textFxColor2
    if (isNum(style.textFxAngle)) v['--be-tfx-a'] = `${style.textFxAngle}deg`
    if (isNum(style.textFxStroke)) v['--be-tfx-sw'] = `${style.textFxStroke}px`
  }
  if (style.borderFx && style.borderFx !== 'none') {
    if (isStr(style.borderFxColor)) v['--be-bc'] = style.borderFxColor
    if (isStr(style.borderFxColor2)) v['--be-bc2'] = style.borderFxColor2
    px('--be-bw', style.borderFxWidth)
    px('--be-bs', style.borderFxSpeed, 's')
  }
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
