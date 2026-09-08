// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findFaqSettings, updateFaqSettings } from '@/cms/db'

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
 * Phase 18: the first GLOBAL this data layer models. Confirmed against
 * Payload's own real global adapter (@payloadcms/drizzle's findGlobal.js/
 * updateGlobal.js/createGlobal.js - see ../../src/cms/db/generic.ts's
 * createGlobalOps doc comment) that `findGlobal` is a bare
 * `SELECT * LIMIT 1` and `updateGlobal`/`createGlobal` are really one upsert
 * (find the existing row's id first, update if found, else insert) - no
 * `WHERE id = ...` a caller ever supplies, unlike every other collection this
 * data layer has modeled. FaqSettings was picked as the first because it
 * exercises the same page-builder `blocks` field + hasMany/polymorphic rels
 * shape PageTemplates (Phase 4) already proved, just against a global's
 * table instead of a collection's - confirmed schema-identical via real
 * `pragma table_info(eg_faq_settings)`/`eg_faq_settings_rels` dumps.
 *
 * A global always exists conceptually (Payload returns `{}` if the row is
 * genuinely absent, never null/undefined) - this data layer's own `find()`
 * returns `null` in that case instead (consistent with every other `findByID`
 * in this data layer), so this suite works either way rather than assuming
 * which state the shared row starts in.
 */
describe('cms/db - faq-settings global (proof of concept, not wired in)', () => {
  let engine: Engine

  it('reads a global updated by Payload: blocks with a nested hasMany subfield', async () => {
    engine = await getEngine()
    const faq = await engine.create({
      collection: 'faqs',
      data: { question: 'Does the FAQ page support relationships?', answer: richText('Yes.') },
    })

    await engine.updateGlobal({
      slug: 'faq-settings',
      data: {
        pageTitle: 'Parity FAQ settings A',
        layout: 'list',
        groupByCategory: false,
        introBlocks: [
          { blockType: 'hero', heading: 'FAQ hero' },
          { blockType: 'faq', faqs: [faq.id] },
        ],
      },
    })

    const viaOurs = await findFaqSettings()
    expect(viaOurs?.pageTitle).toBe('Parity FAQ settings A')
    expect(viaOurs?.layout).toBe('list')
    expect(viaOurs?.groupByCategory).toBe(false)
    expect(viaOurs?.introBlocks).toHaveLength(2)
    expect(viaOurs?.introBlocks?.[0].blockType).toBe('hero')
    const faqBlock = viaOurs?.introBlocks?.find((b) => b.blockType === 'faq') as { faqs?: number[] } | undefined
    expect(faqBlock?.faqs).toEqual([faq.id])
  })

  it('writes a global (blocks + nested hasMany) Payload can read back', async () => {
    const faq = await engine.create({
      collection: 'faqs',
      data: { question: 'Can the clone adapter write global blocks?', answer: richText('Yes.') },
    })

    const ours = await updateFaqSettings({
      pageTitle: 'Parity FAQ settings B',
      introBlocks: [
        { blockType: 'hero', heading: 'Clone hero' } as never,
        { blockType: 'faq', faqs: [faq.id] } as never,
      ],
    })
    expect(ours.pageTitle).toBe('Parity FAQ settings B')
    expect(ours.introBlocks).toHaveLength(2)

    const viaPayload = await engine.findGlobal({ slug: 'faq-settings', depth: 0 })
    expect(viaPayload.pageTitle).toBe('Parity FAQ settings B')
    const payloadFaqBlock = (viaPayload.introBlocks as { blockType: string; faqs?: number[] }[]).find((b) => b.blockType === 'faq')
    expect(payloadFaqBlock?.faqs).toEqual([faq.id])
  })

  it('replaces introBlocks wholesale on update', async () => {
    await updateFaqSettings({ introBlocks: [{ blockType: 'hero', heading: 'Original' } as never] })

    const updated = await updateFaqSettings({ introBlocks: [{ blockType: 'hero', heading: 'Replaced' } as never] })
    expect(updated.introBlocks).toHaveLength(1)
    expect((updated.introBlocks?.[0] as { heading?: string }).heading).toBe('Replaced')

    const viaPayload = await engine.findGlobal({ slug: 'faq-settings' })
    expect((viaPayload.introBlocks as { heading?: string }[])[0].heading).toBe('Replaced')
  })
})
