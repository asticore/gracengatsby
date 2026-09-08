// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findBlogSettings, updateBlogSettings } from '@/cms/db'

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
 * BlogSettings: same shape as FaqSettings (see cms-db-faq-settings.int.spec.ts)
 * - a global with a page-builder `introBlocks` field plus scalar settings
 * alongside it. Confirmed against src/globals/BlogSettings.ts that it shares
 * the exact same `pageBuilderBlocks` library as FaqSettings' `introBlocks`,
 * so this exercises the same blocks + nested hasMany/polymorphic rels shape
 * against a different global's table.
 */
describe('cms/db - blog-settings global (proof of concept, not wired in)', () => {
  let engine: Engine

  it('reads a global updated by Payload: blocks with a nested hasMany subfield', async () => {
    engine = await getEngine()
    const faq = await engine.create({
      collection: 'faqs',
      data: { question: 'Does the blog intro support relationships?', answer: richText('Yes.') },
    })

    await engine.updateGlobal({
      slug: 'blog-settings',
      data: {
        archiveTitle: 'Parity Blog settings A',
        archiveLayout: 'list',
        postsPerPage: 6,
        showAuthor: false,
        introBlocks: [
          { blockType: 'hero', heading: 'Blog hero' },
          { blockType: 'faq', faqs: [faq.id] },
        ],
      },
    })

    const viaOurs = await findBlogSettings()
    expect(viaOurs?.archiveTitle).toBe('Parity Blog settings A')
    expect(viaOurs?.archiveLayout).toBe('list')
    expect(viaOurs?.postsPerPage).toBe(6)
    expect(viaOurs?.showAuthor).toBe(false)
    expect(viaOurs?.introBlocks).toHaveLength(2)
    expect(viaOurs?.introBlocks?.[0].blockType).toBe('hero')
    const faqBlock = viaOurs?.introBlocks?.find((b) => b.blockType === 'faq') as { faqs?: number[] } | undefined
    expect(faqBlock?.faqs).toEqual([faq.id])
  })

  it('writes a global (blocks + nested hasMany) Payload can read back', async () => {
    const faq = await engine.create({
      collection: 'faqs',
      data: { question: 'Can the clone adapter write blog settings blocks?', answer: richText('Yes.') },
    })

    const ours = await updateBlogSettings({
      archiveTitle: 'Parity Blog settings B',
      introBlocks: [
        { blockType: 'hero', heading: 'Clone hero' } as never,
        { blockType: 'faq', faqs: [faq.id] } as never,
      ],
    })
    expect(ours.archiveTitle).toBe('Parity Blog settings B')
    expect(ours.introBlocks).toHaveLength(2)

    const viaPayload = await engine.findGlobal({ slug: 'blog-settings', depth: 0 })
    expect(viaPayload.archiveTitle).toBe('Parity Blog settings B')
    const payloadFaqBlock = (viaPayload.introBlocks as { blockType: string; faqs?: number[] }[]).find((b) => b.blockType === 'faq')
    expect(payloadFaqBlock?.faqs).toEqual([faq.id])
  })

  it('replaces introBlocks wholesale on update', async () => {
    await updateBlogSettings({ introBlocks: [{ blockType: 'hero', heading: 'Original' } as never] })

    const updated = await updateBlogSettings({ introBlocks: [{ blockType: 'hero', heading: 'Replaced' } as never] })
    expect(updated.introBlocks).toHaveLength(1)
    expect((updated.introBlocks?.[0] as { heading?: string }).heading).toBe('Replaced')

    const viaPayload = await engine.findGlobal({ slug: 'blog-settings' })
    expect((viaPayload.introBlocks as { heading?: string }[])[0].heading).toBe('Replaced')
  })
})
