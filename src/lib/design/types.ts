import type { V1Group } from './v1Groups'

/**
 * Design model v2 for visual-editor elements (Phase 1 of the visual editor plan).
 *
 * Every style value is wrapped so it can differ by device and by state:
 *   Responsive<T>  = { desktop?, tablet?, mobile? }   (narrower wins; see cascade.ts)
 *   Stated<T>      = { normal?, hover? }
 *   Rs<T>          = Responsive<Stated<T>>             (the usual leaf wrapper)
 *
 * The model is stored as JSON in the existing `design` column. v1 (the flat
 * BlockStyle in src/lib/blockStyle.ts) is converted by upgrade.ts; nothing is
 * migrated in the database.
 */

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'
export type StateName = 'normal' | 'hover'

export const UNITS = ['px', '%', 'em', 'rem', 'vw', 'vh'] as const
export type Unit = (typeof UNITS)[number]

export type Length = { value: number | 'auto'; unit: Unit }

export type Responsive<T> = { desktop?: T; tablet?: T; mobile?: T }
export type Stated<T> = { normal?: T; hover?: T }
export type Rs<T> = Responsive<Stated<T>>

/** Four sides. `linked` is a UI hint (sides edited together); it does not change output. */
export type Dimensions = {
  top?: Rs<Length>
  right?: Rs<Length>
  bottom?: Rs<Length>
  left?: Rs<Length>
  linked?: boolean
}

export const TEXT_TRANSFORMS = ['none', 'uppercase', 'lowercase', 'capitalize'] as const
export const FONT_STYLES = ['normal', 'italic', 'oblique'] as const
export const TEXT_DECORATIONS = ['none', 'underline', 'overline', 'line-through'] as const
export const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'] as const
export const BACKGROUND_TYPES = ['none', 'color', 'gradient', 'image'] as const
export const BACKGROUND_SIZES = ['auto', 'cover', 'contain'] as const
export const BACKGROUND_REPEATS = ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'] as const
export const BACKGROUND_POSITIONS = ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'] as const
export const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted', 'double'] as const
export const POSITION_MODES = ['static', 'relative', 'absolute', 'fixed', 'sticky'] as const
export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'] as const
export const FLEX_DIRECTIONS = ['row', 'row-reverse', 'column', 'column-reverse'] as const
export const JUSTIFY_VALUES = ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'] as const
export const ALIGN_VALUES = ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'] as const
export const FLEX_WRAPS = ['nowrap', 'wrap', 'wrap-reverse'] as const
export const FONT_WEIGHTS = ['normal', 'bold', 'lighter', 'bolder'] as const

export type TextTransform = (typeof TEXT_TRANSFORMS)[number]
export type FontStyle = (typeof FONT_STYLES)[number]
export type TextDecoration = (typeof TEXT_DECORATIONS)[number]
export type TextAlign = (typeof TEXT_ALIGNS)[number]
export type BackgroundType = (typeof BACKGROUND_TYPES)[number]
export type BorderStyle = (typeof BORDER_STYLES)[number]
export type PositionMode = (typeof POSITION_MODES)[number]
export type BlendMode = (typeof BLEND_MODES)[number]

export type Gradient = { from?: Rs<string>; to?: Rs<string>; angle?: Rs<number> }

export type Shadow = {
  x?: Rs<Length>
  y?: Rs<Length>
  blur?: Rs<Length>
  spread?: Rs<Length>
  color?: Rs<string>
  inset?: boolean
}

export type Transform = {
  rotate?: Rs<number>
  offsetX?: Rs<Length>
  offsetY?: Rs<Length>
  scaleX?: Rs<number>
  scaleY?: Rs<number>
  skewX?: Rs<number>
  skewY?: Rs<number>
  flipH?: Rs<boolean>
  flipV?: Rs<boolean>
}

export type Animation = {
  entrance?: 'none' | 'fade' | 'slideUp' | 'slideLeft' | 'zoomIn'
  delayMs?: number
  durationMs?: number
}

export type DesignV2 = {
  schemaVersion: 2
  spacing?: { margin?: Dimensions; padding?: Dimensions }
  size?: { width?: Rs<Length>; minHeight?: Rs<Length>; maxHeight?: Rs<Length> }
  typography?: {
    family?: Rs<string>
    size?: Rs<Length>
    weight?: Rs<string | number>
    transform?: Rs<TextTransform>
    style?: Rs<FontStyle>
    decoration?: Rs<TextDecoration>
    lineHeight?: Rs<Length>
    letterSpacing?: Rs<Length>
    wordSpacing?: Rs<Length>
    align?: Rs<TextAlign>
  }
  color?: { text?: Rs<string> }
  background?: {
    type?: BackgroundType
    color?: Rs<string>
    gradient?: Gradient
    imageUrl?: Rs<string>
    position?: Rs<string>
    size?: Rs<string>
    repeat?: Rs<string>
    /** 0 to 100. Darkens an image background, as v1 bgOverlay did. */
    overlay?: Rs<number>
  }
  border?: { style?: Rs<BorderStyle>; width?: Rs<Length>; color?: Rs<string>; radius?: Rs<Length> }
  boxShadow?: Shadow
  textShadow?: Shadow
  textStroke?: { width?: Rs<Length>; color?: Rs<string> }
  opacity?: Rs<number>
  blendMode?: Rs<BlendMode>
  transform?: Transform
  position?: { mode?: Rs<PositionMode>; zIndex?: Rs<number>; offsets?: Dimensions }
  container?: {
    direction?: Rs<(typeof FLEX_DIRECTIONS)[number]>
    justify?: Rs<(typeof JUSTIFY_VALUES)[number]>
    align?: Rs<(typeof ALIGN_VALUES)[number]>
    gap?: Rs<Length>
    wrap?: Rs<(typeof FLEX_WRAPS)[number]>
  }
  visibility?: { hideDesktop?: boolean; hideTablet?: boolean; hideMobile?: boolean }
  cssId?: string
  cssClasses?: string[]
  customCss?: string
  animation?: Animation
  /**
   * v1 values, verbatim, grouped by V1_GROUP_OF (v1Groups.ts). Written by
   * upgradeV1 and read back by downgradeV1, so no v1 value is lost or changed.
   */
  groups?: Partial<Record<V1Group, Record<string, unknown>>>
  /** v1 keys that are not in V1_GROUP_OF (none today). Kept verbatim, never rendered as v2. */
  legacy?: Record<string, unknown>
}

/** Returned instead of a design when the stored schemaVersion is not one this code knows. */
export type DesignError = {
  error: 'unsupported-schema-version' | 'invalid-schema-version'
  version: unknown
  message: string
}

export type UpgradeResult = DesignV2 | DesignError
