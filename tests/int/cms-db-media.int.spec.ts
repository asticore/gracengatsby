// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { describe, expect, it } from 'vitest'

import { createMedia, deleteMedia, findMediaByID } from '@/cms/db'

/**
 * Media: a collection with an upload field.
 */
describe('cms/db - media', () => {
  let engine: Engine
  const createdIds: number[] = []

  it('reads a media item written by Payload: upload field', async () => {
    engine = await getEngine()
    const created = await engine.create({
      collection: 'media',
      data: {
        title: 'Test image',
        // Note: Payload's upload field is complex and would require actual file upload
        // For parity testing, we're testing the structure, not file handling
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findMediaByID(created.id as number)
    expect(viaOurs?.id).toBe(created.id)
    expect(viaOurs?.title).toBe('Test image')
  })

  it('writes a media item Payload can read back', async () => {
    const ours = await createMedia({ title: 'Our image' })
    createdIds.push(ours.id)
    expect(ours.title).toBe('Our image')

    const viaPayload = await engine.findByID({ collection: 'media', id: ours.id, depth: 0 })
    expect(viaPayload.title).toBe('Our image')
  })

  afterAll = async () => {
    for (const id of createdIds) {
      await deleteMedia(id).catch(() => {})
    }
  }
})
