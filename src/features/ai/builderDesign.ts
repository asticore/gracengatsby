/**
 * The design keys the AI builder may write, with the value each one accepts.
 *
 * One table drives both the prompt (builderGuide.ts) and the check on the model's
 * output (builderValidate.ts), so the two cannot drift apart. A value spec is one of:
 *   a|b|c           one of these words
 *   num:min..max    a number in that range
 *   colour          a CSS colour that passes isSafeColor
 *   bool            true or false
 *   font            a built-in font key (see BUILT_IN_FONTS)
 *   object          a nested object, checked by the shared sanitiser (tablet, mobile, layout)
 * Keys that point at media, custom CSS, class names, anchors and transforms are left out on purpose.
 */

const DIVIDER_SHAPES = 'none|wave|tilt|curve|triangle|arrow|waves|zigzag|clouds|drips|mountains|curve-asym|slant-double|pill|steps|spikes'

export type DesignGroup = { title: string; specs: string[] }

export const BUILDER_DESIGN_GROUPS: DesignGroup[] = [
  {
    title: 'Background',
    specs: [
      'bgType:none|color|gradient',
      'bgColor:colour',
      'bgGradientFrom:colour',
      'bgGradientTo:colour',
      'bgGradientAngle:num:0..360',
      'bgOverlay:num:0..100',
      'overlayType:none|color|gradient',
      'overlayColor:colour',
      'overlayColor2:colour',
      'overlayAngle:num:0..360',
      'overlayOpacity:num:0..100',
      'overlayBlend:normal|multiply|screen|overlay|soft-light|color|luminosity',
    ],
  },
  {
    title: 'Spacing (px)',
    specs: [
      'paddingTop:num:0..400',
      'paddingBottom:num:0..400',
      'paddingLeft:num:0..400',
      'paddingRight:num:0..400',
      'paddingTopMobile:num:0..400',
      'paddingBottomMobile:num:0..400',
      'marginTop:num:-200..400',
      'marginBottom:num:-200..400',
    ],
  },
  {
    title: 'Border and shadow',
    specs: [
      'borderWidth:num:0..20',
      'borderStyle:solid|dashed|dotted',
      'borderColor:colour',
      'borderRadius:num:0..200',
      'boxShadow:none|sm|md|lg',
    ],
  },
  {
    title: 'Typography',
    specs: [
      'fontFamily:font',
      'textColor:colour',
      'textAlign:left|center|right',
      'fontSize:num:1..400',
      'fontSizeUnit:px|em|rem|vw',
      'fontWeight:num:100..900',
      'lineHeight:num:0.5..5',
      'letterSpacing:num:-20..50',
      'letterSpacingUnit:px|em',
      'textTransform:none|uppercase|lowercase|capitalize',
      'fontStyle:normal|italic',
      'textDecoration:none|underline|line-through',
      'wordSpacing:num:-20..100',
      'textShadow:none|sm|md|lg',
    ],
  },
  {
    title: 'Size and self alignment',
    specs: [
      'width:contained|wide|full',
      'minHeight:num:0..2000',
      'minHeightUnit:px|vh',
      'selfAlign:stretch|start|center|end',
      'selfWidth:auto|full|custom',
      'selfWidthPercent:num:1..100',
    ],
  },
  {
    title: 'Shape dividers',
    specs: [
      `dividerTop:${DIVIDER_SHAPES}`,
      `dividerBottom:${DIVIDER_SHAPES}`,
      'dividerTopColor:colour',
      'dividerBottomColor:colour',
      'dividerTopHeight:num:0..400',
      'dividerBottomHeight:num:0..400',
      'dividerTopFlip:bool',
      'dividerBottomFlip:bool',
      'dividerTopAnim:none|drift|layers|float',
      'dividerBottomAnim:none|drift|layers|float',
      'dividerTopSpeed:num:4..60',
      'dividerBottomSpeed:num:4..60',
    ],
  },
  {
    title: 'Background effects',
    specs: [
      'bgEffect:none|aurora|mesh|gradient-shift|grain|dots|grid|particles',
      'bgEffectColor:colour',
      'bgEffectColor2:colour',
      'bgEffectIntensity:num:0..100',
      'particlesCount:num:10..120',
      'particlesInteract:none|repel|attract|connect',
      'particlesShape:circle|square',
      'particlesLinks:bool',
      'particlesSpeed:num:0..300',
      'particlesOpacity:num:5..100',
      'particlesLinkDistance:num:40..300',
      'particlesInteractRadius:num:40..400',
      'particlesSizeMin:num:0.5..10',
      'particlesSizeMax:num:0.5..12',
      'dotSize:num:0.5..12',
      'dotSpacing:num:8..120',
      'gridSize:num:12..200',
      'gridLineWidth:num:0.5..6',
      'auroraBlur:num:0..120',
      'auroraSize:num:0..100',
      'auroraSpeed:num:4..80',
      'gradientAngle:num:0..360',
      'gradientSpeed:num:3..60',
      'grainOpacity:num:0..100',
      'grainSize:num:40..400',
    ],
  },
  {
    title: 'Motion and interaction',
    specs: [
      'parallax:none|background|float-up|float-down',
      'parallaxStrength:num:0..100',
      'parallaxDistance:num:0..400',
      'parallaxDirection:up|down',
      'reveal:none|fade|fade-up|fade-down|slide-left|slide-right|zoom|blur',
      'revealDistance:num:0..200',
      'revealDuration:num:5..100',
      'revealDelay:num:0..60',
      'revealEasing:linear|ease|ease-in|ease-out|ease-in-out',
      'hover:none|lift|glow|zoom',
      'hoverLift:num:0..40',
      'hoverScale:num:100..120',
      'pointerFx:none|spotlight|tilt|magnetic',
      'pointerFxStrength:num:0..100',
      'spotlightColor:colour',
      'kenBurns:none|zoom-in|zoom-out|pan',
      'kenBurnsDuration:num:5..60',
      'borderFx:none|glow|conic-spin',
      'borderFxColor:colour',
      'borderFxColor2:colour',
      'borderFxWidth:num:1..8',
      'borderFxSpeed:num:2..20',
      'glass:bool',
      'glassBlur:num:0..40',
      'glassOpacity:num:0..100',
      'glassBorder:num:0..100',
    ],
  },
  {
    title: 'Hover state',
    specs: [
      'hoverBgColor:colour',
      'hoverTextColor:colour',
      'hoverBorderColor:colour',
      'hoverBoxShadow:none|sm|md|lg',
      'hoverBorderRadius:num:0..200',
      'hoverTransitionMs:num:0..2000',
    ],
  },
  {
    title: 'Responsive overrides',
    specs: [
      'tablet:object (padding*, margin*, textAlign, minHeight, selfAlign, selfWidth, fontSize, lineHeight, letterSpacing, hide)',
      'mobile:object (same keys)',
    ],
  },
  {
    title: 'Section layout (sections only, under design.layout)',
    specs: ['layout:object (see the section display list)'],
  },
]

export type DesignSpec = { key: string; kind: string }

/** Every allowed design key with its value spec, in the order the guide prints them. */
export const BUILDER_DESIGN_SPECS: DesignSpec[] = BUILDER_DESIGN_GROUPS.flatMap((group) =>
  group.specs.map((spec) => {
    const cut = spec.indexOf(':')
    return { key: spec.slice(0, cut), kind: spec.slice(cut + 1) }
  }),
)

const SPEC_BY_KEY = new Map(BUILDER_DESIGN_SPECS.map((spec) => [spec.key, spec.kind]))

/** The spec for one design key, or undefined when the builder may not write it. */
export function designSpec(key: string): string | undefined {
  return SPEC_BY_KEY.get(key)
}

/** Section display modes and the options the builder may set under design.layout. */
export const BUILDER_SECTION_DISPLAYS = [
  'columns (default: side by side, leave display unset)',
  'tabs (each column is a tab, titled by column label)',
  'accordion (each column is a panel, titled by label)',
  'carousel (each column is a slide)',
  'grid (equal cells)',
  'modal (one column behind a button)',
  'stack (cards that pile up on scroll)',
  'hscroll (columns slide sideways on scroll)',
  'sticky-steps (a sticky first column beside scrolling steps)',
]

export const BUILDER_LAYOUT_OPTIONS = [
  'display:columns|tabs|accordion|carousel|grid|modal|stack|hscroll|sticky-steps',
  'wrap:false (keep columns on one line)',
  'gap:{"desktop":24} (px between columns, per device)',
  'justify:start|center|end|between|around|evenly',
  'alignItems:start|center|end|stretch',
  'contentWidth:boxed|full',
  'boxedWidth:px (with boxed)',
  'verticalAlign:top|middle|bottom',
  'tabsAlign:start|center|end|stretch; tabsColor:colour',
  'carouselPerView:1..4; carouselGap:0..64; carouselArrows:bool',
  'gridColumns:1..6; gridColumnsTablet:1..6; gridColumnsMobile:1..6; gridGap:0..64; gridAlign:start|center|end|stretch',
  'modalLabel:text (button text); modalWidth:320..1200; modalStyle:button|link',
  'stackTop:0..200; stackOffset:0..60; stackMinHeight:30..100 (vh)',
  'hscrollLength:200..600 (vh); hscrollColumnWidth:40..100 (vw)',
  'stickyStepsSide:left|right; stickyStepsTop:0..200; stickyStepsGap:0..160',
]

/** Column layout keys (column.layout). */
export const BUILDER_COLUMN_LAYOUT = 'grow:number, shrink:number, alignSelf:stretch|start|center|end, minWidth:px, vAlign:top|middle|bottom|between, gap:px between the blocks in the column, padding:{top,right,bottom,left} px'
