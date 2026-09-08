// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, describe, expect, it } from 'vitest'

import { findSiteSettings, updateSiteSettings } from '@/cms/db'

// A real, minimal 1x1 transparent PNG - see tests/int/cms-db-media.int.spec.ts:
// Payload's local API needs an actual decodable image for Media's `file`
// option, a bare `Buffer.from('x')` is not enough.
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

/**
 * SiteSettings: the second GLOBAL this data layer models (see
 * ../../src/cms/db/globals/faqSettings.ts for the first, FaqSettings, and
 * ../../src/cms/db/generic.ts's createGlobalOps doc comment for why a
 * global's find/update is really one upsert against a bare `SELECT * LIMIT
 * 1` row rather than a caller-supplied `WHERE id = ...`).
 *
 * Unlike FaqSettings, SiteSettings has no `blocks` field and no
 * hasMany/polymorphic relationship anywhere, so its ops file passes no
 * `relsTable`/`blocksFields` to createGlobalOps at all - see
 * ../../src/cms/db/globals/siteSettings.ts. What it DOES exercise, and
 * FaqSettings didn't: `group` fields (`theme`, `seo`, `features`) that need
 * `groupFields` wired through for nested-object reconstruction (see
 * generic.ts's nestGroups/flattenGroups), and single (non-hasMany) `upload`
 * fields (`logo`, `favicon`, `seo.defaultOgImage`) - confirmed to be plain
 * `<name>_id` FK columns, exactly like a single `relationship` field, per
 * ../../src/cms/db/schema/generate.ts's columnFor.
 */
describe('cms/db - site-settings global (proof of concept, not wired in)', () => {
  let engine: Engine
  const mediaIds: number[] = []

  afterAll(async () => {
    for (const id of mediaIds) {
      await engine.delete({ collection: 'media', id })
    }
  })

  it('reads a global updated by Payload: group fields + a single upload field', async () => {
    engine = await getEngine()
    const logo = await engine.create({
      collection: 'media',
      data: { alt: 'Parity logo A' },
      file: { data: onePixelPng, mimetype: 'image/png', name: 'parity-logo-a.png', size: onePixelPng.length },
    })
    mediaIds.push(logo.id as number)

    await engine.updateGlobal({
      slug: 'site-settings',
      data: {
        siteName: 'Parity Site A',
        logo: logo.id,
        theme: { primaryColor: '#111111', accentColor: '#222222', headingFont: 'playfair' },
        seo: { titleTemplate: '%s | Parity A', siteIndexable: false },
      },
    })

    const viaOurs = await findSiteSettings()
    expect(viaOurs?.siteName).toBe('Parity Site A')
    expect(viaOurs?.logo).toBe(logo.id)
    expect(viaOurs?.theme?.primaryColor).toBe('#111111')
    expect(viaOurs?.theme?.accentColor).toBe('#222222')
    expect(viaOurs?.theme?.headingFont).toBe('playfair')
    expect(viaOurs?.seo?.titleTemplate).toBe('%s | Parity A')
    expect(viaOurs?.seo?.siteIndexable).toBe(false)
  })

  it('writes a global (group fields + a single upload field) Payload can read back', async () => {
    const favicon = await engine.create({
      collection: 'media',
      data: { alt: 'Parity favicon B' },
      file: { data: onePixelPng, mimetype: 'image/png', name: 'parity-favicon-b.png', size: onePixelPng.length },
    })
    mediaIds.push(favicon.id as number)

    const ours = await updateSiteSettings({
      siteName: 'Parity Site B',
      favicon: favicon.id,
      theme: { primaryColor: '#333333', buttonStyle: 'outline', cornerStyle: 'sharp' },
      seo: { defaultDescription: 'Parity default description B' },
    })
    expect(ours.siteName).toBe('Parity Site B')
    expect(ours.favicon).toBe(favicon.id)
    expect(ours.theme?.primaryColor).toBe('#333333')
    expect(ours.theme?.buttonStyle).toBe('outline')
    expect(ours.seo?.defaultDescription).toBe('Parity default description B')

    const viaPayload = await engine.findGlobal({ slug: 'site-settings', depth: 0 })
    expect(viaPayload.siteName).toBe('Parity Site B')
    expect(viaPayload.favicon).toBe(favicon.id)
    expect((viaPayload.theme as { primaryColor?: string })?.primaryColor).toBe('#333333')
    expect((viaPayload.theme as { buttonStyle?: string })?.buttonStyle).toBe('outline')
    expect((viaPayload.seo as { defaultDescription?: string })?.defaultDescription).toBe('Parity default description B')
  })

  it('supports repeated updates to the same group, each one visible to Payload', async () => {
    const first = await updateSiteSettings({
      theme: { primaryColor: '#444444', accentColor: '#555555', headingFont: 'cinzel' },
    })
    expect(first.theme?.primaryColor).toBe('#444444')

    const second = await updateSiteSettings({
      theme: { primaryColor: '#666666', accentColor: '#555555', headingFont: 'cinzel' },
    })
    expect(second.theme?.primaryColor).toBe('#666666')
    expect(second.theme?.headingFont).toBe('cinzel')

    const viaPayload = await engine.findGlobal({ slug: 'site-settings' })
    expect((viaPayload.theme as { primaryColor?: string })?.primaryColor).toBe('#666666')
  })
})
