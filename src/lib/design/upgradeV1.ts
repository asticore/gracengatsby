import { pickEnum, safeClassList, safeCssId } from './sanitize'
import { BACKGROUND_TYPES, BORDER_STYLES, UNITS, type Breakpoint, type DesignV2, type Dimensions, type Length, type Rs, type Shadow, type Unit } from './types'

/**
 * Converts a v1 flat design (BlockStyle in src/lib/blockStyle.ts) to v2.
 *
 * Rules: a v1 field is mapped only when its type is right; anything not mapped
 * (wrong type, no v2 equivalent such as dividers or width) is copied to
 * `legacy` so nothing is lost. Values are not range-checked here; the emitter
 * sanitises them when CSS is written.
 */

const TEXT_ALIGNS = ['left', 'center', 'right'] as const

const SHADOW_PRESETS: Record<'sm' | 'md' | 'lg', { y: number; blur: number; alpha: number }> = {
  sm: { y: 1, blur: 3, alpha: 0.12 },
  md: { y: 8, blur: 24, alpha: 0.16 },
  lg: { y: 20, blur: 48, alpha: 0.22 },
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const px = (value: number): Length => ({ value, unit: 'px' })

/** Puts a desktop or mobile normal value into a responsive leaf, keeping any value already there. */
function withDevice<T>(leaf: Rs<T> | undefined, device: Breakpoint, value: T): Rs<T> {
  return { ...(leaf ?? {}), [device]: { ...(leaf?.[device] ?? {}), normal: value } }
}

/** Sets one side of a Dimensions group for one device. */
function setSide(dims: Dimensions, side: 'top' | 'right' | 'bottom' | 'left', device: Breakpoint, value: Length): void {
  dims[side] = withDevice(dims[side], device, value)
}

function shadowFromPreset(preset: 'sm' | 'md' | 'lg'): Shadow {
  const p = SHADOW_PRESETS[preset]
  return {
    x: { desktop: { normal: px(0) } },
    y: { desktop: { normal: px(p.y) } },
    blur: { desktop: { normal: px(p.blur) } },
    color: { desktop: { normal: `rgba(0, 0, 0, ${p.alpha})` } },
  }
}

/**
 * Maps v1 spacing fields into spacing.padding / spacing.margin.
 *
 * v1 writes desktop padding and margin in `paddingUnit` / `marginUnit` (any
 * valid length unit, default px); the mobile padding fields are always px.
 * The unit is carried over so the rendered value is the same.
 */
function mapSpacing(raw: Record<string, unknown>, used: Set<string>, out: DesignV2): void {
  const padding: Dimensions = {}
  const margin: Dimensions = {}
  const padUnit = lengthUnitOf(raw.paddingUnit)
  const marginUnit = lengthUnitOf(raw.marginUnit)
  if (raw.paddingUnit !== undefined) used.add('paddingUnit')
  if (raw.marginUnit !== undefined) used.add('marginUnit')
  const sides: Array<[string, Dimensions, 'top' | 'right' | 'bottom' | 'left', Breakpoint, Unit]> = [
    ['paddingTop', padding, 'top', 'desktop', padUnit],
    ['paddingBottom', padding, 'bottom', 'desktop', padUnit],
    ['paddingLeft', padding, 'left', 'desktop', padUnit],
    ['paddingRight', padding, 'right', 'desktop', padUnit],
    ['paddingTopMobile', padding, 'top', 'mobile', 'px'],
    ['paddingBottomMobile', padding, 'bottom', 'mobile', 'px'],
    ['marginTop', margin, 'top', 'desktop', marginUnit],
    ['marginBottom', margin, 'bottom', 'desktop', marginUnit],
  ]
  for (const [key, dims, side, device, unit] of sides) {
    const value = raw[key]
    if (!isNum(value)) continue
    used.add(key)
    setSide(dims, side, device, { value, unit })
  }
  if (Object.keys(padding).length > 0) out.spacing = { ...out.spacing, padding }
  if (Object.keys(margin).length > 0) out.spacing = { ...out.spacing, margin }
}

/** v1 length unit, or px when the stored unit is missing or not one v1 knows (as v1 rendering did). */
function lengthUnitOf(raw: unknown): Unit {
  return typeof raw === 'string' && (UNITS as readonly string[]).includes(raw) ? (raw as Unit) : 'px'
}

/** Maps v1 background fields. Gradient and overlay values are kept even when the type is different, as v1 did. */
function mapBackground(raw: Record<string, unknown>, used: Set<string>, out: DesignV2): void {
  const bg: NonNullable<DesignV2['background']> = {}
  if (pickEnum(raw.bgType, BACKGROUND_TYPES)) {
    used.add('bgType')
    bg.type = raw.bgType as NonNullable<DesignV2['background']>['type']
  }
  if (isStr(raw.bgColor)) {
    used.add('bgColor')
    bg.color = withDevice(undefined, 'desktop', raw.bgColor)
  }
  const gradient: NonNullable<DesignV2['background']>['gradient'] = {}
  if (isStr(raw.bgGradientFrom)) {
    used.add('bgGradientFrom')
    gradient.from = withDevice(undefined, 'desktop', raw.bgGradientFrom)
  }
  if (isStr(raw.bgGradientTo)) {
    used.add('bgGradientTo')
    gradient.to = withDevice(undefined, 'desktop', raw.bgGradientTo)
  }
  if (isNum(raw.bgGradientAngle)) {
    used.add('bgGradientAngle')
    gradient.angle = withDevice(undefined, 'desktop', raw.bgGradientAngle)
  }
  if (Object.keys(gradient).length > 0) bg.gradient = gradient
  if (isStr(raw.bgImageUrl)) {
    used.add('bgImageUrl')
    bg.imageUrl = withDevice(undefined, 'desktop', raw.bgImageUrl)
    // v1 always drew image backgrounds cover-sized and centred; keep that explicit in v2.
    if (bg.type === 'image') {
      bg.size = withDevice(undefined, 'desktop', 'cover')
      bg.position = withDevice(undefined, 'desktop', 'center')
    }
  }
  if (isNum(raw.bgOverlay)) {
    used.add('bgOverlay')
    bg.overlay = withDevice(undefined, 'desktop', raw.bgOverlay)
  }
  if (Object.keys(bg).length > 0) out.background = bg
}

/** Maps v1 border, shadow and radius fields. */
function mapBorderAndShadow(raw: Record<string, unknown>, used: Set<string>, out: DesignV2): void {
  const border: NonNullable<DesignV2['border']> = {}
  // v1 only draws a border when the width is above zero, and then defaults the style and colour.
  if (isNum(raw.borderWidth) && raw.borderWidth > 0) {
    used.add('borderWidth')
    border.width = withDevice(undefined, 'desktop', px(raw.borderWidth))
    border.style = withDevice(undefined, 'desktop', pickEnum(raw.borderStyle, BORDER_STYLES) ?? 'solid')
    if (pickEnum(raw.borderStyle, BORDER_STYLES)) used.add('borderStyle')
    border.color = withDevice(undefined, 'desktop', isStr(raw.borderColor) ? raw.borderColor : 'currentColor')
    if (isStr(raw.borderColor)) used.add('borderColor')
  }
  if (isNum(raw.borderRadius)) {
    used.add('borderRadius')
    border.radius = withDevice(undefined, 'desktop', px(raw.borderRadius))
  }
  if (Object.keys(border).length > 0) out.border = border

  if (raw.boxShadow === 'none') used.add('boxShadow')
  if (raw.boxShadow === 'sm' || raw.boxShadow === 'md' || raw.boxShadow === 'lg') {
    used.add('boxShadow')
    out.boxShadow = shadowFromPreset(raw.boxShadow)
  }
}

/** Maps the remaining v1 fields: text, size, visibility, classes and anchor. */
function mapMisc(raw: Record<string, unknown>, used: Set<string>, out: DesignV2): void {
  if (isStr(raw.textColor)) {
    used.add('textColor')
    out.color = { text: withDevice(undefined, 'desktop', raw.textColor) }
  }
  if (pickEnum(raw.textAlign, TEXT_ALIGNS)) {
    used.add('textAlign')
    out.typography = { ...out.typography, align: withDevice(undefined, 'desktop', raw.textAlign as (typeof TEXT_ALIGNS)[number]) }
  }
  if (isNum(raw.minHeight)) {
    used.add('minHeight')
    out.size = { ...out.size, minHeight: withDevice(undefined, 'desktop', px(raw.minHeight)) }
  }
  if (typeof raw.hideOnMobile === 'boolean') {
    used.add('hideOnMobile')
    if (raw.hideOnMobile) out.visibility = { ...out.visibility, hideMobile: true }
  }
  if (typeof raw.hideOnDesktop === 'boolean') {
    used.add('hideOnDesktop')
    if (raw.hideOnDesktop) out.visibility = { ...out.visibility, hideDesktop: true }
  }
  if (typeof raw.customClass === 'string') {
    const tokens = raw.customClass.trim().split(/\s+/).filter(Boolean)
    const classes = safeClassList(raw.customClass)
    // Only mapped when every token is valid; otherwise the original string stays under legacy.
    if (classes.length === tokens.length) {
      used.add('customClass')
      out.cssClasses = classes
    }
  }
  if (typeof raw.anchorId === 'string' && safeCssId(raw.anchorId)) {
    used.add('anchorId')
    out.cssId = raw.anchorId
  }
}

/** Converts a v1 flat design. Unmapped keys go to `legacy`. */
export function upgradeV1(raw: Record<string, unknown>): DesignV2 {
  const out: DesignV2 = { schemaVersion: 2 }
  const used = new Set<string>(['schemaVersion'])
  mapSpacing(raw, used, out)
  mapBackground(raw, used, out)
  mapBorderAndShadow(raw, used, out)
  mapMisc(raw, used, out)

  const legacy: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    if (!used.has(key)) legacy[key] = raw[key]
  }
  if (Object.keys(legacy).length > 0) out.legacy = legacy
  return out
}
