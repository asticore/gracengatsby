// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findSpeedSettings, updateSpeedSettings } from '@/cms/db'

/**
 * SpeedSettings: the first global whose schema-generation wiring is not a
 * straight generateTable() call - see ../../src/cms/db/globals/speedSettings.ts's
 * own doc comment. `caching`/`assets`/`media`/`fonts` are plain scalar groups
 * (SiteSettings' `theme`/`seo` mechanism, unchanged); `advanced` additionally
 * has two `array` fields living INSIDE that top-level group
 * (`preconnectOrigins`, `prefetchDns`) - a shape only ../../src/cms/db/schema/index.ts's
 * hand-built generateArrayTable wiring (plus a synthetic `arrayFieldNames`
 * patch onto the group's own metadata) makes possible without touching
 * generate.ts/generic.ts. This suite proves every field type in the config
 * round-trips both ways - Payload writes, this data layer reads, and back -
 * with particular attention on `advanced`'s two arrays, since that's the one
 * genuinely new wiring shape.
 */
describe('cms/db - speed-settings global', () => {
  let engine: Engine

  it('reads a global updated by Payload: scalar groups plus arrays nested inside a group', async () => {
    engine = await getEngine()

    await engine.updateGlobal({
      slug: 'speed-settings',
      data: {
        caching: { pageCache: true, cacheTtlSeconds: 7200, cacheLoggedInUsers: false, purgeOnPublish: false },
        assets: {
          minifyCss: true,
          minifyJs: true,
          combineCss: false,
          deferJs: true,
          removeUnusedCss: false,
          preloadCriticalCss: true,
        },
        media: { lazyLoadImages: false, lazyLoadIframes: false, addImageDimensions: false, disableEmojiScript: true },
        fonts: { preloadFonts: true, fontDisplaySwap: false },
        advanced: {
          preconnectOrigins: [{ url: 'https://fonts.gstatic.com' }, { url: 'https://cdn.example.com' }],
          prefetchDns: [{ domain: 'analytics.example.com' }],
          delayJsExecution: true,
        },
      },
    })

    const viaOurs = await findSpeedSettings()
    expect(viaOurs?.caching?.pageCache).toBe(true)
    expect(viaOurs?.caching?.cacheTtlSeconds).toBe(7200)
    expect(viaOurs?.assets?.minifyCss).toBe(true)
    expect(viaOurs?.assets?.preloadCriticalCss).toBe(true)
    expect(viaOurs?.media?.disableEmojiScript).toBe(true)
    expect(viaOurs?.fonts?.preloadFonts).toBe(true)
    expect(viaOurs?.advanced?.delayJsExecution).toBe(true)
    expect(viaOurs?.advanced?.preconnectOrigins).toHaveLength(2)
    expect(viaOurs?.advanced?.preconnectOrigins?.map((o: { url?: string | null }) => o.url)).toEqual([
      'https://fonts.gstatic.com',
      'https://cdn.example.com',
    ])
    expect(viaOurs?.advanced?.prefetchDns).toEqual([expect.objectContaining({ domain: 'analytics.example.com' })])
  })

  it('writes a global (scalar groups plus arrays nested inside a group) Payload can read back', async () => {
    const ours = await updateSpeedSettings({
      caching: { pageCache: false, cacheTtlSeconds: 1800, cacheLoggedInUsers: true, purgeOnPublish: true },
      advanced: {
        preconnectOrigins: [{ url: 'https://clone.example.com' }],
        prefetchDns: [{ domain: 'clone-dns.example.com' }, { domain: 'clone-dns-2.example.com' }],
        delayJsExecution: false,
      },
    })
    expect(ours.caching?.cacheTtlSeconds).toBe(1800)
    expect(ours.advanced?.preconnectOrigins).toEqual([expect.objectContaining({ url: 'https://clone.example.com' })])
    expect(ours.advanced?.prefetchDns).toHaveLength(2)

    const viaPayload = await engine.findGlobal({ slug: 'speed-settings', depth: 0 })
    expect(viaPayload.caching.cacheTtlSeconds).toBe(1800)
    expect(viaPayload.advanced.preconnectOrigins).toEqual([expect.objectContaining({ url: 'https://clone.example.com' })])
    expect(viaPayload.advanced.prefetchDns).toHaveLength(2)
  })

  it('replaces advanced.preconnectOrigins/prefetchDns wholesale on update', async () => {
    await updateSpeedSettings({
      advanced: {
        preconnectOrigins: [{ url: 'https://original.example.com' }],
        prefetchDns: [{ domain: 'original-dns.example.com' }],
        delayJsExecution: true,
      },
    })

    const updated = await updateSpeedSettings({
      advanced: {
        preconnectOrigins: [{ url: 'https://replaced.example.com' }],
        prefetchDns: [],
        delayJsExecution: true,
      },
    })
    expect(updated.advanced?.preconnectOrigins).toEqual([expect.objectContaining({ url: 'https://replaced.example.com' })])
    expect(updated.advanced?.prefetchDns).toEqual([])

    const viaPayload = await engine.findGlobal({ slug: 'speed-settings' })
    expect(viaPayload.advanced.preconnectOrigins).toEqual([expect.objectContaining({ url: 'https://replaced.example.com' })])
    expect(viaPayload.advanced.prefetchDns).toEqual([])
  })
})
