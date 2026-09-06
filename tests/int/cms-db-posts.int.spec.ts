// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { createPost, createPostVersion, deletePost, findLatestPostVersion, findPostByID, updatePost } from '@/cms/db'
import { getDb } from '@/cms/db/connect'

const richText = (text: string) => ({ root: { children: [{ type: 'paragraph', children: [{ text }] }] } })

/**
 * Phase 7: versioned `array` fields - the last schema-generation gap
 * generateVersionsTable had (Phase 6 already proved versioned `blocks`/
 * `_rels` against Pages). Posts was picked because `categories` is this
 * app's only top-level array field on a versioned collection, and Posts'
 * `layout` field also exercises the already-proven versioned blocks/rels
 * path (same page-builder library as Pages/PageTemplates) - so this is the
 * fullest single collection this data layer models yet.
 *
 * Confirmed by creating real documents through Payload's own engine.create()
 * and inspecting the resulting D1 tables directly (not guessed):
 *
 *  - A versioned array table's name gets a "version_" infix before the
 *    field name (`_eg_posts_v_version_categories`, not
 *    `_eg_posts_v_categories`) - unlike blocks tables, which never get that
 *    infix at all. Its subfield COLUMNS stay unprefixed regardless
 *    (`.name`, not `.version_name`) - only the table name carries it.
 *  - Row identity is the same scheme Phase 6 established for blocks: an
 *    integer autoincrement `id` plus an extra `_uuid` text column, and
 *    `_parent_id` points at the VERSION ROW's own id, not the live
 *    document's - see ../../src/cms/db/schema/generate.ts's
 *    generateArrayTable `versioned` param doc comment.
 *
 * Same pre-existing Payload bug as cms-db-events.int.spec.ts/
 * cms-db-pages.int.spec.ts: engine.update() on this local dev D1 hits
 * checkDocumentLockStatus's unrelated schema-drift bug on every update to a
 * lockable collection - so "update" and "cleanup" below use this module's
 * own updatePost/raw SQL instead.
 */
describe('cms/db - posts (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  afterAll(async () => {
    const db = await getDb()
    for (const id of createdIds) {
      await db.run(sql`delete from _eg_posts_v where parent_id = ${id}`)
      await deletePost(id)
    }
  })

  it('reads a post written by Payload: array field, blocks with a nested hasMany subfield, group fields', async () => {
    engine = await getEngine()
    const faq = await engine.create({ collection: 'faqs', data: { question: 'Do posts support relationships in blocks?', answer: richText('Yes.') } })

    const created = await engine.create({
      collection: 'posts',
      data: {
        title: `Parity post A ${Date.now()}`,
        content: richText('Body.'),
        categories: [{ name: 'News' }, { name: 'Updates' }],
        layout: [
          { blockType: 'hero', heading: 'Hero heading' },
          { blockType: 'faq', faqs: [faq.id] },
        ],
        seo: { metaTitle: 'Parity post A - SEO title' },
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findPostByID(created.id as number)
    expect(viaOurs?.categories?.length).toBe(2)
    expect(viaOurs?.categories?.map((c) => c.name)).toEqual(['News', 'Updates'])
    expect(viaOurs?.layout?.length).toBe(2)
    const faqBlock = viaOurs?.layout?.find((b) => b.blockType === 'faq') as { faqs?: number[] } | undefined
    expect(faqBlock?.faqs).toEqual([faq.id])
    expect(viaOurs?.seo?.metaTitle).toBe('Parity post A - SEO title')
    expect(viaOurs?._status).toBe((created as { _status?: string })._status)
  })

  it('writes a post (array + blocks) Payload can read back', async () => {
    const ours = await createPost({
      title: `Written by clone adapter ${Date.now()}`,
      content: richText('Body.'),
      categories: [{ name: 'Clone Category' } as never],
      layout: [{ blockType: 'hero', heading: 'Clone hero' } as never],
    })
    createdIds.push(ours.id)
    expect(ours.categories?.length).toBe(1)
    expect(ours.layout?.length).toBe(1)

    const viaPayload = await engine.findByID({ collection: 'posts', id: ours.id, depth: 0 })
    expect((viaPayload.categories as { name: string }[]).map((c) => c.name)).toEqual(['Clone Category'])
    expect(viaPayload.layout?.length).toBe(1)
  })

  it('replaces categories and blocks wholesale on update', async () => {
    const created = await createPost({
      title: `Temp ${Date.now()}`,
      content: richText('Body.'),
      categories: [{ name: 'Original' } as never],
    })
    createdIds.push(created.id)

    const updated = await updatePost(created.id, { categories: [{ name: 'Replaced A' } as never, { name: 'Replaced B' } as never] })
    expect(updated?.categories?.map((c) => c.name)).toEqual(['Replaced A', 'Replaced B'])

    const viaPayload = await engine.findByID({ collection: 'posts', id: created.id, depth: 0 })
    expect((viaPayload.categories as { name: string }[]).map((c) => c.name)).toEqual(['Replaced A', 'Replaced B'])
  })

  it('reads the version row Payload created on write, array + blocks + nested hasMany included', async () => {
    const faq = await engine.create({ collection: 'faqs', data: { question: 'Do versions carry arrays too?', answer: richText('Yes.') } })

    const created = await engine.create({
      collection: 'posts',
      data: {
        title: `Versioned post ${Date.now()}`,
        content: richText('Body.'),
        categories: [{ name: 'Versioned Category' }],
        layout: [
          { blockType: 'hero', heading: 'Version Hall hero' },
          { blockType: 'faq', faqs: [faq.id] },
        ],
      },
    })
    createdIds.push(created.id as number)

    const ourVersion = await findLatestPostVersion(created.id as number)
    expect(ourVersion?.latest).toBe(true)
    expect(ourVersion?.categories?.map((c) => c.name)).toEqual(['Versioned Category'])
    expect(ourVersion?.layout?.length).toBe(2)
    const ourVersionFaqBlock = ourVersion?.layout?.find((b) => b.blockType === 'faq') as { faqs?: number[] } | undefined
    expect(ourVersionFaqBlock?.faqs).toEqual([faq.id])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadVersions = await (engine as any).findVersions({ collection: 'posts', where: { parent: { equals: created.id } }, depth: 0 })
    expect(payloadVersions.docs[0].version.categories?.map((c: { name: string }) => c.name)).toEqual(['Versioned Category'])
    expect(payloadVersions.docs[0].version.layout?.length).toBe(2)
  })

  it('writes a version (array + blocks + nested hasMany) Payload can read back', async () => {
    const faq = await engine.create({ collection: 'faqs', data: { question: 'Can the clone adapter write versioned arrays?', answer: richText('Yes.') } })
    const created = await createPost({ title: `Has a version added ${Date.now()}`, content: richText('Body.') })
    createdIds.push(created.id)

    await createPostVersion(created.id, {
      title: 'Written by clone adapter',
      content: richText('Body.'),
      categories: [{ name: 'Clone Version Category' } as never],
      layout: [{ blockType: 'faq', faqs: [faq.id] } as never],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadVersions = await (engine as any).findVersions({
      collection: 'posts',
      where: { parent: { equals: created.id } },
      sort: '-createdAt',
      depth: 0,
    })
    const latest = payloadVersions.docs[0].version
    expect(latest.title).toBe('Written by clone adapter')
    expect(latest.categories?.map((c: { name: string }) => c.name)).toEqual(['Clone Version Category'])
    const payloadFaqBlock = (latest.layout as { blockType: string; faqs?: number[] }[]).find((b) => b.blockType === 'faq')
    expect(payloadFaqBlock?.faqs).toEqual([faq.id])
  })
})
