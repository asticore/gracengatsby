import { describe, expect, it } from 'vitest'

import { TEMPLATE_PRESETS } from '@/views/visualEditor/templatePresets'
import { renderTemplateThumbnail, renderTemplateThumbnailSvg } from '@/views/visualEditor/templateThumbnail'

describe('renderTemplateThumbnail', () => {
  it('is deterministic for the same tree', () => {
    for (const preset of TEMPLATE_PRESETS) {
      expect(renderTemplateThumbnail(preset.blocks())).toBe(renderTemplateThumbnail(preset.blocks()))
    }
  })

  it('returns an svg data url that is ASCII and has no script', () => {
    for (const preset of TEMPLATE_PRESETS) {
      const url = renderTemplateThumbnail(preset.blocks())
      expect(url.startsWith('data:image/svg+xml')).toBe(true)
      const svg = renderTemplateThumbnailSvg(preset.blocks())
      expect(svg).toMatch(/^<svg /)
      expect(svg.toLowerCase()).not.toContain('<script')
      expect(svg.toLowerCase()).not.toContain('onload')
      expect(/^[\x00-\x7f]*$/.test(url)).toBe(true)
    }
  })

  it('draws different pictures for different block types', () => {
    const hero = renderTemplateThumbnailSvg([{ blockType: 'hero' }])
    const gallery = renderTemplateThumbnailSvg([{ blockType: 'gallery' }])
    const faq = renderTemplateThumbnailSvg([{ blockType: 'faq' }])
    expect(new Set([hero, gallery, faq]).size).toBe(3)
  })

  it('uses site colour variables with fallbacks and accepts a palette', () => {
    expect(renderTemplateThumbnailSvg([{ blockType: 'ctaBanner' }])).toContain('var(--tpl-accent,#3b6fd4)')
    expect(renderTemplateThumbnailSvg([{ blockType: 'ctaBanner' }], { accent: '#ff0000' })).toContain('var(--tpl-accent,#ff0000)')
  })

  it('handles empty, unknown and deeply nested trees', () => {
    expect(renderTemplateThumbnailSvg([])).toContain('<svg')
    expect(renderTemplateThumbnailSvg([{ blockType: 'nope' }, { blockType: 'element', elementType: 'pricing-table' }])).toContain('<svg')
    let node: Record<string, unknown> = { blockType: 'richText' }
    for (let i = 0; i < 10; i += 1) node = { blockType: 'section', columns: [{ width: 12, blocks: [node] }] }
    expect(renderTemplateThumbnailSvg([node as never])).toContain('<svg')
  })

  it('keeps the starter presets valid', () => {
    const slugs = TEMPLATE_PRESETS.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of ['hero-simple', 'hero-story-cta', 'three-up-features', 'gallery-cta', 'shop-landing']) expect(slugs).toContain(slug)
    expect(TEMPLATE_PRESETS.length).toBeGreaterThanOrEqual(16)
  })
})
