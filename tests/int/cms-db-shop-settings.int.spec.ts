// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findShopSettings, updateShopSettings } from '@/cms/db'

const richText = (text: string) => ({
  root: {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', text, version: 1 }], version: 1 }],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
})

/**
 * ShopSettings: same shape as FaqSettings (see cms-db-faq-settings.int.spec.ts)
 * - a global with a page-builder `introBlocks` field plus scalar settings
 * alongside it. Confirmed against src/globals/ShopSettings.ts that it shares
 * the exact same `pageBuilderBlocks` library as FaqSettings' `introBlocks`,
 * so this exercises the same blocks + nested hasMany/polymorphic rels shape
 * against a different global's table.
 */
describe('cms/db - shop-settings global (proof of concept, not wired in)', () => {
  let engine: Engine

  it('reads a global updated by Payload: blocks with a nested hasMany subfield', async () => {
    engine = await getEngine()
    const faq = await engine.create({
      collection: 'faqs',
      data: { question: 'Does the shop intro support relationships?', answer: richText('Yes.') },
    })

    await engine.updateGlobal({
      slug: 'shop-settings',
      data: {
        archiveLayout: 'list',
        showCategoryFilters: false,
        productImageAspect: 'square',
        introBlocks: [
          { blockType: 'hero', heading: 'Shop hero' },
          { blockType: 'faq', faqs: [faq.id] },
        ],
      },
    })

    const viaOurs = await findShopSettings()
    expect(viaOurs?.archiveLayout).toBe('list')
    expect(viaOurs?.showCategoryFilters).toBe(false)
    expect(viaOurs?.productImageAspect).toBe('square')
    expect(viaOurs?.introBlocks).toHaveLength(2)
    expect(viaOurs?.introBlocks?.[0].blockType).toBe('hero')
    const faqBlock = viaOurs?.introBlocks?.find((b) => b.blockType === 'faq') as { faqs?: number[] } | undefined
    expect(faqBlock?.faqs).toEqual([faq.id])
  })

  it('writes a global (blocks + nested hasMany) Payload can read back', async () => {
    const faq = await engine.create({
      collection: 'faqs',
      data: { question: 'Can the clone adapter write shop settings blocks?', answer: richText('Yes.') },
    })

    const ours = await updateShopSettings({
      archiveLayout: 'grid-3',
      introBlocks: [
        { blockType: 'hero', heading: 'Clone hero' } as never,
        { blockType: 'faq', faqs: [faq.id] } as never,
      ],
    })
    expect(ours.archiveLayout).toBe('grid-3')
    expect(ours.introBlocks).toHaveLength(2)

    const viaPayload = await engine.findGlobal({ slug: 'shop-settings', depth: 0 })
    expect(viaPayload.archiveLayout).toBe('grid-3')
    const payloadFaqBlock = (viaPayload.introBlocks as { blockType: string; faqs?: number[] }[]).find((b) => b.blockType === 'faq')
    expect(payloadFaqBlock?.faqs).toEqual([faq.id])
  })

  it('replaces introBlocks wholesale on update', async () => {
    await updateShopSettings({ introBlocks: [{ blockType: 'hero', heading: 'Original' } as never] })

    const updated = await updateShopSettings({ introBlocks: [{ blockType: 'hero', heading: 'Replaced' } as never] })
    expect(updated.introBlocks).toHaveLength(1)
    expect((updated.introBlocks?.[0] as { heading?: string }).heading).toBe('Replaced')

    const viaPayload = await engine.findGlobal({ slug: 'shop-settings' })
    expect((viaPayload.introBlocks as { heading?: string }[])[0].heading).toBe('Replaced')
  })
})
