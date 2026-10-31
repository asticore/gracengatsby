import { describe, expect, it } from 'vitest'

import { blockStyleClasses, blockStyleCss, blockStyleToCss, type BlockStyle } from '@/lib/blockStyle'
import { designToCss } from '@/lib/design/css'
import { upgradeDesign, isDesignError } from '@/lib/design/upgrade'
import { upgradeV1 } from '@/lib/design/upgradeV1'
import { TEMPLATE_PRESETS } from '@/views/visualEditor/templatePresets'

/**
 * Corpus guard for the v1 -> v2 design migration.
 *
 * The corpus is every design object in the built-in template presets (the
 * starters the visual editor offers). The v1 render path (blockStyle.ts) is
 * the one that renders today, so its output is pinned as a snapshot: any change
 * to it, or to the v2 model that would change a v1 page, fails here.
 *
 * upgradeV1 is NOT yet a full mapping. Fields listed in KNOWN_UNMAPPED are
 * still rendered by v1 but land in `legacy` after upgrade, so upgrade-on-read
 * would drop them. The read path must not use upgradeV1 for v1 data until
 * that list is empty (see the report in the PR description).
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

/** v1 keys that have a value in the corpus and that upgradeV1 does not map yet. */
const KNOWN_UNMAPPED = [
  'auroraBlur',
  'auroraSize',
  'auroraSpeed',
  'bgEffect',
  'bgEffectColor',
  'bgEffectColor2',
  'bgEffectIntensity',
  'dividerBottom',
  'dividerBottomAnim',
  'dividerBottomColor',
  'dividerBottomHeight',
  'dividerBottomSpeed',
  'fontSize',
  'fontSizeUnit',
  'gradientAngle',
  'gradientSpeed',
  'glass',
  'glassBlur',
  'glassBorder',
  'glassOpacity',
  'grainOpacity',
  'grainSize',
  'gridLineWidth',
  'gridSize',
  'hover',
  'hoverLift',
  'hoverTextColor',
  'hoverTransitionMs',
  'layout',
  'overlayType',
  'pointerFx',
  'pointerFxStrength',
  'reveal',
  'revealDistance',
  'revealDuration',
  'spotlightColor',
]

describe('v1 corpus from the template presets', () => {
  it('has a corpus to test against', () => {
    expect(corpus.length).toBeGreaterThan(20)
  })

  it('pins the v1 render output for every corpus design (snapshot)', () => {
    const rendered = corpus.map(({ slug, design }) => ({
      slug,
      inline: blockStyleToCss(design),
      css: blockStyleCss(design, 'corpus-scope'),
      classes: blockStyleClasses(design),
    }))
    expect(rendered).toMatchSnapshot()
  })

  it('lists exactly the v1 keys that upgradeV1 leaves unmapped', () => {
    const lost = new Set<string>()
    for (const { design } of corpus) {
      const up = upgradeV1(design as Rec)
      for (const key of Object.keys(up.legacy ?? {})) {
        if (design[key as keyof BlockStyle] !== undefined) lost.add(key)
      }
    }
    expect([...lost].sort()).toEqual([...KNOWN_UNMAPPED].sort())
  })

  it('mapped spacing renders the same declarations as v1 (corpus and unit variants)', () => {
    const SIDES = ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'marginTop', 'marginBottom'] as const
    const KEBAB: Record<string, string> = { paddingTop: 'padding-top', paddingBottom: 'padding-bottom', paddingLeft: 'padding-left', paddingRight: 'padding-right', marginTop: 'margin-top', marginBottom: 'margin-bottom' }
    const synthetic: BlockStyle[] = [
      { paddingTop: 2, paddingLeft: 3, paddingRight: 4, paddingUnit: 'em' },
      { paddingBottom: 10, paddingUnit: 'vh', marginTop: 5, marginUnit: '%' },
      { paddingLeft: 1, paddingUnit: 'nonsense' as never },
      { marginBottom: 7, paddingRight: 0 },
    ]
    for (const design of [...corpus.map((c) => c.design), ...synthetic]) {
      const v1 = blockStyleToCss(design) as Rec
      const v1Sides: Rec = {}
      for (const key of SIDES) if (v1[key] !== undefined) v1Sides[KEBAB[key]] = v1[key]
      const rules = designToCss(upgradeV1(design as Rec) as never, 'eq').match(/^\[data-eid="eq"\]\{([^}]*)\}/)
      const v2Sides: Rec = {}
      for (const decl of (rules?.[1] ?? '').split(';')) {
        const i = decl.indexOf(':')
        const prop = decl.slice(0, i)
        if (Object.values(KEBAB).includes(prop)) v2Sides[prop] = decl.slice(i + 1)
      }
      expect(v2Sides).toEqual(v1Sides)
    }
  })

  it('upgrade-on-read is not yet render-safe for the corpus (gate for the read-path change)', () => {
    const affected = corpus.filter(({ design }) => Object.keys(upgradeV1(design as Rec).legacy ?? {}).some((k) => KNOWN_UNMAPPED.includes(k)))
    expect(affected.length).toBeGreaterThan(0)
  })

  it('every corpus design upgrades to a valid v2 value that emits without throwing', () => {
    for (const { design } of corpus) {
      const v2 = upgradeDesign(upgradeV1(design as Rec))
      expect(isDesignError(v2)).toBe(false)
      expect(() => designToCss(v2 as never, 'corpus-scope')).not.toThrow()
    }
  })

  it('upgradeV1 is idempotent through upgradeDesign', () => {
    for (const { design } of corpus) {
      const once = upgradeDesign(upgradeV1(design as Rec))
      const twice = upgradeDesign(once)
      expect(twice).toEqual(once)
    }
  })

  it('upgradeV1 never mutates the stored v1 design', () => {
    for (const { design } of corpus) {
      const before = JSON.stringify(design)
      upgradeV1(design as Rec)
      expect(JSON.stringify(design)).toBe(before)
    }
  })
})
