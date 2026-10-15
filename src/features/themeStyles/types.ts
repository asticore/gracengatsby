/**
 * Theme styles: the site's global design system (Elementor "Site Settings" style).
 * Colours, text styles, button styles and table styles are set once and read everywhere.
 * Stored as one JSON document in table `eg_theme_styles` (row id 1). Pure types and defaults, no I/O.
 *
 * A colour reference is either a literal colour (`#rgb`, `#rrggbb`, `rgb()`, `rgba()`, `hsl()`, `hsla()`)
 * or `@<id>` pointing at a global colour, so changing the global colour changes every user of it.
 */

export const SYSTEM_COLOUR_IDS = ['primary', 'secondary', 'text', 'accent', 'background', 'surface', 'border', 'success', 'warning', 'error'] as const
export type SystemColourId = (typeof SYSTEM_COLOUR_IDS)[number]

export const SYSTEM_TYPE_IDS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'small', 'caption', 'link'] as const
export type SystemTypeId = (typeof SYSTEM_TYPE_IDS)[number]

export const SYSTEM_BUTTON_IDS = ['primary', 'secondary'] as const

export const LIMITS = {
  presets: 12,
  customCss: 20000,
  colours: 40,
  typography: 30,
  buttons: 20,
  tables: 12,
  name: 40,
} as const

export type ThemeColour = {
  /** Slug, [a-z0-9-], 1 to 32 characters. System colours use the fixed ids in SYSTEM_COLOUR_IDS. */
  id: string
  name: string
  value: string
  /** Optional value used under [data-theme='dark'] on the public site. Empty string means same as value. */
  darkValue: string
  system: boolean
}

export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'

export type TypeStyle = {
  id: string
  name: string
  system: boolean
  /** '' = inherit, 'heading', 'body', or an installed font id from Site fonts. */
  fontFamily: string
  /** Pixels, 8 to 120. */
  size: number
  /** Pixels at tablet and mobile widths, 0 = use size. */
  sizeTablet: number
  sizeMobile: number
  /** 100 to 900 in steps of 100. */
  weight: number
  /** Unitless multiplier, 0.8 to 3. */
  lineHeight: number
  /** Pixels, -5 to 20. */
  letterSpacing: number
  transform: TextTransform
  /** Colour reference, '' = inherit. */
  colour: string
}

export type ShadowLevel = 'none' | 'soft' | 'medium' | 'strong'

export type ButtonStyle = {
  id: string
  name: string
  system: boolean
  bg: string
  text: string
  borderColour: string
  /** Pixels, 0 to 8. */
  borderWidth: number
  /** Pixels, 0 to 999. */
  radius: number
  shadow: ShadowLevel
  /** Pixels, 0 to 80. */
  paddingY: number
  paddingX: number
  /** Pixels, 10 to 40. */
  fontSize: number
  weight: number
  letterSpacing: number
  transform: TextTransform
  /** Milliseconds, 0 to 1000. */
  transition: number
  hover: { bg: string; text: string; borderColour: string; lift: boolean }
}

export type TableBorders = 'all' | 'rows' | 'none'
export type TableAlign = 'left' | 'center' | 'right'

export type TableStyle = {
  id: string
  name: string
  system: boolean
  headerBg: string
  headerText: string
  rowBg: string
  /** '' = no striping. */
  stripeBg: string
  /** '' = no hover colour. */
  hoverBg: string
  borderColour: string
  borders: TableBorders
  /** Pixels, 0 to 8. */
  borderWidth: number
  /** Pixels, 0 to 40. */
  cellPaddingY: number
  cellPaddingX: number
  align: TableAlign
  /** Pixels, 0 to 40. */
  radius: number
  captionColour: string
  /** Pixels, 10 to 24. */
  fontSize: number
  /** scroll = sideways scroll on narrow screens; stack = each row becomes a card. */
  responsive: 'scroll' | 'stack'
}

/** Form fields (inputs, selects, textareas) and their labels, site wide. Colour references allowed. */
export type FormGlobals = {
  fieldBg: string
  fieldText: string
  fieldBorder: string
  /** Pixels, 0 to 6. */
  fieldBorderWidth: number
  /** Pixels, 0 to 40. */
  fieldRadius: number
  /** Pixels, 4 to 30. */
  fieldPaddingY: number
  fieldPaddingX: number
  /** Pixels, 12 to 24. */
  fieldFontSize: number
  focusBorder: string
  labelColour: string
  /** Pixels, 11 to 20. */
  labelSize: number
  labelWeight: number
  placeholderColour: string
  errorColour: string
}

export type LinkGlobals = {
  hoverColour: string
  underline: 'always' | 'hover' | 'never'
}

export type ImageGlobals = {
  /** Pixels, 0 to 999. */
  radius: number
  shadow: ShadowLevel
  /** Pixels, 0 to 8. */
  borderWidth: number
  borderColour: string
}

export type ContainerGlobals = {
  /** Pixels, 640 to 1920. Drives --max-width. */
  maxWidth: number
  /** Pixels, 0 to 120: gap between sections' inner blocks. */
  gapDesktop: number
  gapTablet: number
  gapMobile: number
  /** Pixels, 0 to 240: top and bottom padding of a section. */
  sectionPaddingDesktop: number
  sectionPaddingTablet: number
  sectionPaddingMobile: number
}

export type ScaleGlobals = {
  /** Pixels, 0 to 999. Emitted as --eg-radius-sm / md / lg. */
  radiusSm: number
  radiusMd: number
  radiusLg: number
  /** Base spacing unit in pixels, 2 to 16; emitted as --eg-space-1..8 = base x [1,2,3,4,6,8,12,16]. */
  spaceBase: number
}

export type BreakpointGlobals = {
  /** Max width in pixels where tablet rules start, 600 to 1280. */
  tablet: number
  /** Max width in pixels where mobile rules start, 320 to 900; must be below tablet. */
  mobile: number
}

export type ThemeGlobals = {
  forms: FormGlobals
  links: LinkGlobals
  images: ImageGlobals
  containers: ContainerGlobals
  scales: ScaleGlobals
  breakpoints: BreakpointGlobals
  /** Admin-written CSS appended last. Sanitised: no '<', '@import', 'expression(', 'javascript:'. Max LIMITS.customCss. */
  customCss: string
}

/** Everything a preset carries (a snapshot of the design, without the presets list itself). */
export type ThemePresetData = {
  colours: ThemeColour[]
  typography: TypeStyle[]
  buttons: ButtonStyle[]
  tables: TableStyle[]
  defaultTableId: string
  globals: ThemeGlobals
}

export type ThemePreset = {
  /** Slug. */
  id: string
  name: string
  data: ThemePresetData
}

export type ThemeStyles = {
  version: 1
  colours: ThemeColour[]
  typography: TypeStyle[]
  buttons: ButtonStyle[]
  tables: TableStyle[]
  /** Id of the table style used for tables that do not choose one. */
  defaultTableId: string
  globals: ThemeGlobals
  /** Saved snapshots the admin can apply again. Max LIMITS.presets. */
  presets: ThemePreset[]
}

const colour = (id: SystemColourId, name: string, value: string, darkValue = ''): ThemeColour => ({ id, name, value, darkValue, system: true })

/** Defaults match the look the site had before theme styles existed (ink, gold, cream). */
export const DEFAULT_COLOURS: ThemeColour[] = [
  colour('primary', 'Primary', '#1f2230', '#f5f3f5'),
  colour('secondary', 'Secondary', '#6b6f7e'),
  colour('text', 'Text', '#1f2230', '#f5f3f5'),
  colour('accent', 'Accent', '#2e3192'),
  colour('background', 'Background', '#f5f3f5', '#14151c'),
  colour('surface', 'Surface', '#ffffff', '#1d1f29'),
  colour('border', 'Border', '#e2dfe2', '#34364a'),
  colour('success', 'Success', '#2e7d4f'),
  colour('warning', 'Warning', '#b7791f'),
  colour('error', 'Error', '#a3352a'),
]

const type = (id: SystemTypeId, name: string, fontFamily: string, size: number, weight: number, lineHeight: number, extra: Partial<TypeStyle> = {}): TypeStyle => ({
  id,
  name,
  system: true,
  fontFamily,
  size,
  sizeTablet: 0,
  sizeMobile: 0,
  weight,
  lineHeight,
  letterSpacing: 0,
  transform: 'none',
  colour: '',
  ...extra,
})

export const DEFAULT_TYPOGRAPHY: TypeStyle[] = [
  type('h1', 'Heading 1', 'heading', 56, 500, 1.1, { sizeTablet: 44, sizeMobile: 34 }),
  type('h2', 'Heading 2', 'heading', 42, 500, 1.15, { sizeTablet: 34, sizeMobile: 28 }),
  type('h3', 'Heading 3', 'heading', 32, 500, 1.2, { sizeMobile: 26 }),
  type('h4', 'Heading 4', 'heading', 26, 500, 1.25),
  type('h5', 'Heading 5', 'heading', 21, 500, 1.3),
  type('h6', 'Heading 6', 'heading', 18, 600, 1.35),
  type('body', 'Body', 'body', 16, 400, 1.6),
  type('small', 'Small', 'body', 14, 400, 1.5),
  type('caption', 'Caption', 'body', 12, 400, 1.4, { letterSpacing: 0.4 }),
  type('link', 'Link', 'body', 16, 400, 1.6, { colour: '@accent' }),
]

const button = (id: string, name: string, over: Partial<ButtonStyle>): ButtonStyle => ({
  id,
  name,
  system: id === 'primary' || id === 'secondary',
  bg: '@primary',
  text: '@background',
  borderColour: '@primary',
  borderWidth: 1,
  radius: 10,
  shadow: 'none',
  paddingY: 12,
  paddingX: 28,
  fontSize: 14,
  weight: 500,
  letterSpacing: 1,
  transform: 'uppercase',
  transition: 200,
  hover: { bg: '@accent', text: '@background', borderColour: '@accent', lift: false },
  ...over,
})

export const DEFAULT_BUTTONS: ButtonStyle[] = [
  button('primary', 'Primary', {}),
  button('secondary', 'Secondary', {
    bg: 'transparent',
    text: '@primary',
    borderColour: '@primary',
    hover: { bg: '@primary', text: '@background', borderColour: '@primary', lift: false },
  }),
]

export const DEFAULT_TABLES: TableStyle[] = [
  {
    id: 'default',
    name: 'Default',
    system: true,
    headerBg: '@surface',
    headerText: '@text',
    rowBg: 'transparent',
    stripeBg: '',
    hoverBg: '',
    borderColour: '@border',
    borders: 'rows',
    borderWidth: 1,
    cellPaddingY: 10,
    cellPaddingX: 12,
    align: 'left',
    radius: 0,
    captionColour: '@secondary',
    fontSize: 15,
    responsive: 'scroll',
  },
  {
    id: 'striped',
    name: 'Striped',
    system: false,
    headerBg: '@primary',
    headerText: '@background',
    rowBg: '@background',
    stripeBg: '@surface',
    hoverBg: '',
    borderColour: '@border',
    borders: 'none',
    borderWidth: 1,
    cellPaddingY: 12,
    cellPaddingX: 14,
    align: 'left',
    radius: 8,
    captionColour: '@secondary',
    fontSize: 15,
    responsive: 'scroll',
  },
]

export const DEFAULT_GLOBALS: ThemeGlobals = {
  forms: {
    fieldBg: '@surface',
    fieldText: '@text',
    fieldBorder: '@border',
    fieldBorderWidth: 1,
    fieldRadius: 8,
    fieldPaddingY: 12,
    fieldPaddingX: 14,
    fieldFontSize: 16,
    focusBorder: '@accent',
    labelColour: '@text',
    labelSize: 14,
    labelWeight: 500,
    placeholderColour: '@secondary',
    errorColour: '@error',
  },
  links: { hoverColour: '@primary', underline: 'hover' },
  images: { radius: 0, shadow: 'none', borderWidth: 0, borderColour: '@border' },
  containers: {
    maxWidth: 1180,
    gapDesktop: 24,
    gapTablet: 20,
    gapMobile: 16,
    sectionPaddingDesktop: 80,
    sectionPaddingTablet: 56,
    sectionPaddingMobile: 40,
  },
  scales: { radiusSm: 4, radiusMd: 10, radiusLg: 20, spaceBase: 4 },
  breakpoints: { tablet: 1024, mobile: 640 },
  customCss: '',
}

export const DEFAULT_THEME_STYLES: ThemeStyles = {
  version: 1,
  colours: DEFAULT_COLOURS,
  typography: DEFAULT_TYPOGRAPHY,
  buttons: DEFAULT_BUTTONS,
  tables: DEFAULT_TABLES,
  defaultTableId: 'default',
  globals: DEFAULT_GLOBALS,
  presets: [],
}
