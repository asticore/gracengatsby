// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { describe, expect, it } from 'vitest'

import { findMediaSettings, updateMediaSettings } from '@/cms/db'

describe('cms/db - media-settings global', () => {
  let engine: Engine

  it('reads a global updated by Payload: max file size field', async () => {
    engine = await getEngine()
    await engine.updateGlobal({
      slug: 'media-settings',
      data: {
        maxFileSize: 10485760, // 10MB
      },
    })

    const viaOurs = await findMediaSettings()
    expect(viaOurs?.maxFileSize).toBe(10485760)
  })

  it('writes a global Payload can read back', async () => {
    const ours = await updateMediaSettings({
      maxFileSize: 5242880, // 5MB
    })
    expect(ours.maxFileSize).toBe(5242880)

    const viaPayload = await engine.findGlobal({ slug: 'media-settings', depth: 0 })
    expect((viaPayload as any).maxFileSize).toBe(5242880)
  })
})
