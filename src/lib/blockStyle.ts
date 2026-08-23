/**
 * The per-block "Design" model, shared by the live site renderer and the
 * visual editor canvas so a block looks identical in both.
 *
 * Every page-builder block carries one of these under a single `style` JSON
 * column. Storing it as JSON rather than ~25 individual Payload fields keeps
 * the D1 schema small (one column per block table instead of twenty-five)
 * and lets the visual editor own the editing UI, which is where these are
 * actually meant to be set.
 */

export type BackgroundType = 'none' | 'color' | 'gradient' | 'image'
export type TextAlign = 'left' | 'center' | 'right'
export type BlockWidth = 'contained' | 'wide' | 'full'
export type DividerShape = 'none' | 'wave' | 'tilt' | 'curve' | 'triangle' | 'arrow'

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

  // Typography / layout
  textColor?: string
  textAlign?: TextAlign
  width?: BlockWidth
  minHeight?: number

  // Shape dividers
  dividerTop?: DividerShape
  dividerTopColor?: string
  dividerTopHeight?: number
  dividerTopFlip?: boolean
  dividerBottom?: DividerShape
  dividerBottomColor?: string
  dividerBottomHeight?: number
  dividerBottomFlip?: boolean

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
  return value as BlockStyle
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
  if (isStr(style.textColor)) css.color = style.textColor
  if (style.textAlign) css.textAlign = style.textAlign
  if (isNum(style.minHeight)) css.minHeight = `${style.minHeight}px`

  return css
}

/**
 * Emits the media-query-dependent rules that can't live in an inline style.
 * Scoped to a per-block id so blocks never leak styles into each other.
 * Returns an empty string when the block needs no such rules.
 */
export function blockStyleCss(style: BlockStyle, scopeId: string): string {
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

  return rules.join('')
}

/** Class names the wrapper should carry, derived from the style. */
export function blockStyleClasses(style: BlockStyle): string {
  return [
    'be-block',
    style.width ? `be-block--${style.width}` : 'be-block--contained',
    style.bgType === 'image' ? 'be-block--has-bg-image' : null,
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
