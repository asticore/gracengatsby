// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findMediaSettings, updateMediaSettings } from '@/cms/db'

/**
 * MediaSettings: same new wiring shape as SpeedSettings (see
 * ../../src/cms/db/globals/mediaSettings.ts's own doc comment) - a plain
 * scalar `array` field (`responsiveWidths`) living inside a top-level
 * `group` (`resizing`), alongside three ordinary scalar-only groups
 * (`optimisation`, `delivery`, `bulk`) that need no wiring beyond
 * generateTable(). `resizing.generateResponsiveSizes` is an admin-only
 * `condition` gate on `responsiveWidths` (see MediaSettings.ts) - it does not
 * affect storage, so this suite writes/reads `responsiveWidths` regardless of
 * that flag's value.
 */
describe('cms/db - media-settings global', () => {
  let engine: Engine

  it('reads a global updated by Payload: scalar groups plus an array nested inside a group', async () => {
    engine = await getEngine()

    await engine.updateGlobal({
      slug: 'media-settings',
      data: {
        optimisation: {
          provider: 'cloudflare-images',
          quality: 90,
          convertToWebp: true,
          convertToAvif: true,
          stripMetadata: false,
        },
        resizing: {
          maxWidth: 1920,
          maxHeight: 1080,
          generateResponsiveSizes: true,
          responsiveWidths: [{ width: 320 }, { width: 768 }, { width: 1440 }],
        },
        delivery: { cloudflareAccountHash: 'abc123', deliveryUrlPrefix: 'https://imagedelivery.net/abc123' },
        bulk: { batchSize: 50 },
      },
    })

    const viaOurs = await findMediaSettings()
    expect(viaOurs?.optimisation?.provider).toBe('cloudflare-images')
    expect(viaOurs?.optimisation?.quality).toBe(90)
    expect(viaOurs?.optimisation?.convertToAvif).toBe(true)
    expect(viaOurs?.resizing?.maxWidth).toBe(1920)
    expect(viaOurs?.resizing?.generateResponsiveSizes).toBe(true)
    expect(viaOurs?.resizing?.responsiveWidths).toHaveLength(3)
    expect(viaOurs?.resizing?.responsiveWidths?.map((w: { width?: number | null }) => w.width)).toEqual([320, 768, 1440])
    expect(viaOurs?.delivery?.cloudflareAccountHash).toBe('abc123')
    expect(viaOurs?.bulk?.batchSize).toBe(50)
  })

  it('writes a global (scalar groups plus an array nested inside a group) Payload can read back', async () => {
    const ours = await updateMediaSettings({
      optimisation: { provider: 'none', quality: 82, convertToWebp: true, convertToAvif: false, stripMetadata: true },
      resizing: {
        maxWidth: 2560,
        maxHeight: 2560,
        generateResponsiveSizes: false,
        responsiveWidths: [{ width: 640 }, { width: 1024 }],
      },
    })
    expect(ours.optimisation?.provider).toBe('none')
    expect(ours.resizing?.responsiveWidths).toHaveLength(2)
    expect(ours.resizing?.responsiveWidths?.map((w: { width?: number | null }) => w.width)).toEqual([640, 1024])

    const viaPayload = await engine.findGlobal({ slug: 'media-settings', depth: 0 })
    expect(viaPayload.optimisation.provider).toBe('none')
    expect(viaPayload.resizing.responsiveWidths).toHaveLength(2)
    expect((viaPayload.resizing.responsiveWidths as { width: number }[]).map((w: { width?: number | null }) => w.width)).toEqual([640, 1024])
  })

  it('replaces resizing.responsiveWidths wholesale on update', async () => {
    await updateMediaSettings({
      resizing: { maxWidth: 2560, maxHeight: 2560, generateResponsiveSizes: true, responsiveWidths: [{ width: 400 }] },
    })

    const updated = await updateMediaSettings({
      resizing: { maxWidth: 2560, maxHeight: 2560, generateResponsiveSizes: true, responsiveWidths: [{ width: 800 }, { width: 1200 }] },
    })
    expect(updated.resizing?.responsiveWidths?.map((w: { width?: number | null }) => w.width)).toEqual([800, 1200])

    const viaPayload = await engine.findGlobal({ slug: 'media-settings' })
    expect((viaPayload.resizing.responsiveWidths as { width: number }[]).map((w: { width?: number | null }) => w.width)).toEqual([800, 1200])
  })
})
