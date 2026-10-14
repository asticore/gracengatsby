import { backgroundImageLeaf, boxShadowLeaf, containerDisplayLeaf, textShadowLeaf, textStrokeLeaf, transformLeaf } from './cssCompound'
import { fmtColor, fmtEnum, fmtFont, fmtFontWeight, fmtLength, fmtNumber, gated, leaf, type Leaf } from './cssGetters'
import {
  ALIGN_VALUES,
  BACKGROUND_POSITIONS,
  BACKGROUND_REPEATS,
  BACKGROUND_SIZES,
  BLEND_MODES,
  BORDER_STYLES,
  FLEX_DIRECTIONS,
  FLEX_WRAPS,
  FONT_STYLES,
  JUSTIFY_VALUES,
  POSITION_MODES,
  TEXT_ALIGNS,
  TEXT_DECORATIONS,
  TEXT_TRANSFORMS,
  type DesignV2,
  type Dimensions,
} from './types'

/**
 * Turns a v2 design into an ordered list of declarations (one Leaf each).
 * The order is fixed, so the emitted CSS is deterministic.
 */

const SIDES = ['top', 'right', 'bottom', 'left'] as const

function sideLeaves(prefix: string, dims: Dimensions | undefined): Leaf[] {
  return SIDES.map((side) => leaf(`${prefix}-${side}`, dims?.[side], fmtLength))
}

function spacingLeaves(d: DesignV2): Leaf[] {
  return [
    ...sideLeaves('margin', d.spacing?.margin),
    ...sideLeaves('padding', d.spacing?.padding),
    leaf('width', d.size?.width, fmtLength),
    leaf('min-height', d.size?.minHeight, fmtLength),
    leaf('max-height', d.size?.maxHeight, fmtLength),
    ...SIDES.map((side) => leaf(side, d.position?.offsets?.[side], fmtLength)),
  ]
}

function typographyLeaves(d: DesignV2): Leaf[] {
  const t = d.typography
  return [
    leaf('font-family', t?.family, fmtFont),
    leaf('font-size', t?.size, fmtLength),
    leaf('font-weight', t?.weight, fmtFontWeight),
    leaf('text-transform', t?.transform, fmtEnum(TEXT_TRANSFORMS)),
    leaf('font-style', t?.style, fmtEnum(FONT_STYLES)),
    leaf('text-decoration', t?.decoration, fmtEnum(TEXT_DECORATIONS)),
    leaf('line-height', t?.lineHeight, fmtLength),
    leaf('letter-spacing', t?.letterSpacing, fmtLength),
    leaf('word-spacing', t?.wordSpacing, fmtLength),
    leaf('text-align', t?.align, fmtEnum(TEXT_ALIGNS)),
    leaf('color', d.color?.text, fmtColor),
  ]
}

function backgroundLeaves(d: DesignV2): Leaf[] {
  const bg = d.background
  const type = bg?.type
  if (!bg) return []
  return [
    gated(type === 'color', leaf('background-color', bg.color, fmtColor)),
    backgroundImageLeaf(bg),
    gated(type === 'image', leaf('background-size', bg.size, fmtEnum(BACKGROUND_SIZES))),
    gated(type === 'image', leaf('background-position', bg.position, fmtEnum(BACKGROUND_POSITIONS))),
    gated(type === 'image', leaf('background-repeat', bg.repeat, fmtEnum(BACKGROUND_REPEATS))),
  ]
}

function borderAndEffectLeaves(d: DesignV2): Leaf[] {
  return [
    leaf('border-style', d.border?.style, fmtEnum(BORDER_STYLES)),
    leaf('border-width', d.border?.width, fmtLength),
    leaf('border-color', d.border?.color, fmtColor),
    leaf('border-radius', d.border?.radius, fmtLength),
    boxShadowLeaf(d.boxShadow),
    textShadowLeaf(d.textShadow),
    textStrokeLeaf(d.textStroke),
    leaf('opacity', d.opacity, fmtNumber(0, 1)),
    leaf('mix-blend-mode', d.blendMode, fmtEnum(BLEND_MODES)),
    transformLeaf(d.transform),
  ]
}

function positionLeaves(d: DesignV2): Leaf[] {
  return [leaf('position', d.position?.mode, fmtEnum(POSITION_MODES)), leaf('z-index', d.position?.zIndex, fmtNumber(-9999, 9999))]
}

function containerLeaves(d: DesignV2): Leaf[] {
  const c = d.container
  const fields = [
    leaf('flex-direction', c?.direction, fmtEnum(FLEX_DIRECTIONS)),
    leaf('justify-content', c?.justify, fmtEnum(JUSTIFY_VALUES)),
    leaf('align-items', c?.align, fmtEnum(ALIGN_VALUES)),
    leaf('gap', c?.gap, fmtLength),
    leaf('flex-wrap', c?.wrap, fmtEnum(FLEX_WRAPS)),
  ]
  return [containerDisplayLeaf(fields), ...fields]
}

/** Every declaration the design can produce, in a fixed order. */
export function designLeaves(d: DesignV2): Leaf[] {
  return [...spacingLeaves(d), ...typographyLeaves(d), ...backgroundLeaves(d), ...borderAndEffectLeaves(d), ...positionLeaves(d), ...containerLeaves(d)]
}
