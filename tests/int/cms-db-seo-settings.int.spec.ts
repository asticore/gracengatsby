// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findSeoSettings, updateSeoSettings } from '@/cms/db'

/**
 * SeoSettings - the third GLOBAL this data layer models. Six of its seven
 * groups are plain-field groups (including two single-target `upload->media`
 * fields inside a group, `defaults.defaultOgImage`/`schema.logo` - already
 * proven, nothing new); `schema.sameAs` is a plain `array` field (a
 * single-subfield array of objects, the same shape MembershipTiers'
 * `benefits` already proved) nested inside a group - see
 * ../../src/cms/db/globals/seoSettings.ts's doc comment for why this is NOT
 * yet a fully-provable shape: `generateTable(SeoSettings)` throws today
 * ("group \"schema\" may only contain plain fields - \"sameAs\" (array)
 * inside a group is not supported yet"), confirmed by actually calling it -
 * this suite therefore only becomes runnable once ../../src/cms/db/schema/
 * generate.ts and ../../src/cms/db/generic.ts gain the proposed group-nested
 * array/select-table extension described there, and schema/index.ts is wired
 * accordingly. Kept in the same write-both-ways parity shape as every other
 * global/collection suite regardless, so it is ready to run unmodified once
 * that lands.
 */
describe('cms/db - seo-settings global (proof of concept, not wired in)', () => {
  let engine: Engine

  it('reads a global updated by Payload: plain groups + an array field nested in a group', async () => {
    engine = await getEngine()
    await engine.updateGlobal({
      slug: 'seo-settings',
      data: {
        defaults: { titleTemplate: '%page% - Parity Co', metaDescription: 'A parity-tested site.' },
        indexing: { allowIndexing: false },
        schema: {
          organisationName: 'Parity Co',
          type: 'organisation',
          sameAs: [{ url: 'https://instagram.com/parityco' }, { url: 'https://facebook.com/parityco' }],
        },
      },
    })

    const viaOurs = await findSeoSettings()
    expect(viaOurs?.defaults?.titleTemplate).toBe('%page% - Parity Co')
    expect(viaOurs?.indexing?.allowIndexing).toBe(false)
    expect(viaOurs?.schema?.organisationName).toBe('Parity Co')
    expect(viaOurs?.schema?.sameAs).toHaveLength(2)
    expect(viaOurs?.schema?.sameAs?.[0].url).toBe('https://instagram.com/parityco')
  })

  it('writes a global (plain groups + grouped array) Payload can read back', async () => {
    const ours = await updateSeoSettings({
      schema: {
        organisationName: 'Clone Co',
        sameAs: [{ url: 'https://linkedin.com/company/cloneco' }],
      },
      sitemap: { enabled: false, changeFrequency: 'monthly' },
    })
    expect(ours.schema?.organisationName).toBe('Clone Co')
    expect(ours.schema?.sameAs).toHaveLength(1)
    expect(ours.sitemap?.changeFrequency).toBe('monthly')

    const viaPayload = await engine.findGlobal({ slug: 'seo-settings', depth: 0 })
    const payloadSchema = viaPayload.schema as { organisationName?: string; sameAs?: { url?: string }[] }
    expect(payloadSchema.organisationName).toBe('Clone Co')
    expect(payloadSchema.sameAs?.[0]?.url).toBe('https://linkedin.com/company/cloneco')
  })

  it('replaces schema.sameAs wholesale on update', async () => {
    await updateSeoSettings({ schema: { sameAs: [{ url: 'https://x.com/original' }] } })
    const first = await findSeoSettings()
    expect(first?.schema?.sameAs).toHaveLength(1)

    const updated = await updateSeoSettings({ schema: { sameAs: [{ url: 'https://x.com/a' }, { url: 'https://x.com/b' }] } })
    expect(updated.schema?.sameAs).toHaveLength(2)

    const viaPayload = await engine.findGlobal({ slug: 'seo-settings' })
    const payloadSchema = viaPayload.schema as { sameAs?: { url?: string }[] }
    expect(payloadSchema.sameAs?.map((r) => r.url)).toEqual(['https://x.com/a', 'https://x.com/b'])
  })
})
