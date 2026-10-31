import { describe, expect, it } from 'vitest'

import { blockStyleClasses, blockStyleCss, blockStyleToCss, type BlockStyle } from '@/lib/blockStyle'
import { downgradeV1, upgradeV1 } from '@/lib/design/upgradeV1'
import { V1_GROUP_OF } from '@/lib/design/v1Groups'
import { TEMPLATE_PRESETS } from '@/views/visualEditor/templatePresets'

/**
 * Corpus gate for the unified design model.
 *
 * Every design in the template presets (the starters the visual editor offers),
 * plus one design that sets a representative value for each group, must:
 *  - round-trip exactly: downgradeV1(upgradeV1(d)) equals d;
 *  - render identically: the v1 render functions give the same output for d and
 *    for its round trip;
 *  - keep the v1 render output unchanged (snapshot, below).
 */

type Rec = Record<string, unknown>

function collectDesigns(node: unknown, out: BlockStyle[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectDesigns(item, out)
    return
  }
  if (!node || typeof node !== 'object') return
  const rec = node as Rec
  if (rec.design && typeof rec.design === 'object' && !Array.isArray(rec.design)) out.push(rec.design as BlockStyle)
  if ('columns' in rec) collectDesigns(rec.columns, out)
  if ('blocks' in rec) collectDesigns(rec.blocks, out)
}

const corpus: { slug: string; design: BlockStyle }[] = []
for (const preset of TEMPLATE_PRESETS) {
  const designs: BlockStyle[] = []
  collectDesigns(preset.blocks(), designs)
  designs.forEach((design, i) => corpus.push({ slug: `${preset.slug}#${i}`, design }))
}

/** One value for each group, including device overrides, effects, hover, dividers, and reveal. */
const KITCHEN_SINK: BlockStyle = {
  bgType: 'gradient',
  bgGradientFrom: '#111827',
  bgGradientTo: '#4f46e5',
  bgGradientAngle: 135,
  bgOverlay: 30,
  overlayType: 'color',
  overlayColor: '#000000',
  overlayOpacity: 40,
  overlayBlend: 'multiply',
  noise: 20,
  paddingTop: 80,
  paddingBottom: 60,
  paddingLeft: 12,
  paddingRight: 12,
  paddingUnit: 'px',
  paddingTopMobile: 24,
  paddingBottomMobile: 24,
  marginTop: 8,
  marginBottom: 8,
  marginUnit: 'px',
  borderWidth: 2,
  borderStyle: 'solid',
  borderColor: '#ffffff',
  borderRadius: 12,
  radiusTl: 4,
  radiusLinked: false,
  boxShadow: 'md',
  fontFamily: 'var(--font-display)',
  textColor: '#ffffff',
  textAlign: 'center',
  fontSize: 42,
  fontSizeUnit: 'px',
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: 1,
  letterSpacingUnit: 'px',
  textTransform: 'uppercase',
  fontStyle: 'italic',
  textDecoration: 'underline',
  wordSpacing: 2,
  textShadow: 'sm',
  textFx: 'gradient',
  textFxColor: '#f59e0b',
  textFxColor2: '#ec4899',
  textFxAngle: 90,
  width: 'wide',
  minHeight: 480,
  minHeightUnit: 'px',
  dividerBottom: 'wave',
  dividerBottomColor: '#ffffff',
  dividerBottomHeight: 60,
  dividerBottomFlip: true,
  dividerBottomAnim: 'drift',
  dividerBottomSpeed: 8,
  bgEffect: 'aurora',
  bgEffectColor: '#22d3ee',
  bgEffectColor2: '#a855f7',
  bgEffectIntensity: 60,
  auroraBlur: 40,
  auroraSize: 50,
  auroraSpeed: 30,
  gradientAngle: 120,
  gradientSpeed: 20,
  grainOpacity: 15,
  grainSize: 200,
  gridSize: 40,
  gridLineWidth: 1,
  parallax: 'background',
  parallaxStrength: 40,
  kenBurns: 'zoom-in',
  kenBurnsDuration: 20,
  glass: true,
  glassBlur: 12,
  glassOpacity: 40,
  glassBorder: 30,
  borderFx: 'glow',
  borderFxColor: '#38bdf8',
  borderFxWidth: 2,
  borderFxSpeed: 6,
  reveal: 'fade-up',
  revealDistance: 40,
  revealDuration: 30,
  revealDelay: 10,
  revealEasing: 'ease-out',
  pointerFx: 'tilt',
  pointerFxStrength: 30,
  spotlightColor: '#ffffff',
  hover: 'lift',
  hoverLift: 8,
  hoverScale: 105,
  hoverBgColor: '#1e293b',
  hoverTextColor: '#f8fafc',
  hoverBorderColor: '#38bdf8',
  hoverBoxShadow: 'lg',
  hoverBorderRadius: 16,
  hoverTransitionMs: 300,
  hoverOpacity: 0.9,
  hoverTransform: 'scale',
  focusRing: '#2563eb',
  tfRotate: 2,
  tfScale: 110,
  tfTranslateX: 4,
  tfTranslateY: -4,
  tfSkewX: 1,
  tfDuration: 400,
  tfhRotate: 3,
  tfhScale: 102,
  position: 'relative',
  posTop: 0,
  zIndex: 2,
  opacity: 90,
  blendMode: 'screen',
  filterBlur: 1,
  filterBrightness: 110,
  filterSaturate: 120,
  layout: { display: 'tabs' } as never,
  selfAlign: 'center',
  selfWidth: 'custom',
  selfWidthPercent: 60,
  selfWidthPercentUnit: '%',
  showFrom: '2026-01-01',
  showUntil: '2027-01-01',
  showAuth: 'in',
  showRoles: 'admin',
  showUrl: '/offer',
  hideOnMobile: true,
  customClass: 'hero-band',
  anchorId: 'pricing',
  cssClasses: 'extra-class',
  customCss: 'selector h2 { color: #fff; }',
  tablet: { paddingTop: 40, hide: false, textAlign: 'left' },
  mobile: { paddingTop: 16, hide: true },
}

const corpusAndSink = [...corpus, { slug: 'kitchen-sink', design: KITCHEN_SINK }]

const renderAll = (design: BlockStyle) => ({
  inline: blockStyleToCss(design),
  css: blockStyleCss(design, 'corpus-scope'),
  classes: blockStyleClasses(design),
})

describe('v1 corpus from the template presets', () => {
  it('has a corpus to test against', () => {
    expect(corpus.length).toBeGreaterThan(20)
  })

  it('pins the v1 render output for every corpus design (snapshot)', () => {
    expect(corpus.map(({ slug, design }) => ({ slug, ...renderAll(design) }))).toMatchSnapshot()
  })

  it('every v1 key in the kitchen sink has a group', () => {
    for (const key of Object.keys(KITCHEN_SINK)) expect(V1_GROUP_OF).toHaveProperty([key])
  })

  it('round-trips every corpus design exactly (no value lost or changed)', () => {
    for (const { design } of corpusAndSink) {
      const round = downgradeV1(upgradeV1(design as Rec) as never)
      expect(round).toEqual(JSON.parse(JSON.stringify(design)))
    }
  })

  it('renders every corpus design identically after a round trip', () => {
    for (const { design } of corpusAndSink) {
      const round = downgradeV1(upgradeV1(design as Rec) as never) as BlockStyle
      expect(renderAll(round)).toEqual(renderAll(design))
    }
  })

  it('stores no corpus value in legacy (every key has a group)', () => {
    for (const { design } of corpusAndSink) {
      expect(upgradeV1(design as Rec).legacy ?? {}).toEqual({})
    }
  })

  it('upgradeV1 never mutates the stored v1 design', () => {
    for (const { design } of corpusAndSink) {
      const before = JSON.stringify(design)
      upgradeV1(design as Rec)
      expect(JSON.stringify(design)).toBe(before)
    }
  })

  it('upgradeV1 output does not share references with the input', () => {
    const input = { showRoles: ['admin'], tablet: { paddingTop: 3 } }
    const out = upgradeV1(input as Rec)
    expect(out.groups?.visibility?.showRoles).not.toBe(input.showRoles)
    expect(out.groups?.devices?.tablet).not.toBe(input.tablet)
  })

  it('keeps a "__proto__" key from a parsed document as data, not as a prototype change', () => {
    const parsed = JSON.parse('{"__proto__": {"polluted": true}, "paddingTop": 5}') as Rec
    const round = downgradeV1(upgradeV1(parsed) as never) as Rec
    expect(Object.prototype.hasOwnProperty.call(round, '__proto__')).toBe(true)
    expect(({} as Rec).polluted).toBeUndefined()
  })
})
