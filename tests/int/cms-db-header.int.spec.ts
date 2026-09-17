// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { describe, expect, it } from 'vitest'

import { findHeader, updateHeader } from '@/cms/db'

/**
 * Header: the one global with an array field (top-level `navigation`).
 * See src/cms/db/globals/header.ts's doc comment for the confirmed real DDL
 * this checks against.
 */
describe('cms/db - header global', () => {
  let engine: Engine

  it('reads a global updated by Payload: top-level array field', async () => {
    engine = await getEngine()
    await engine.updateGlobal({
      slug: 'header',
      data: {
        navigation: [
          { label: 'Home', url: '/' },
          { label: 'About', url: '/about' },
        ],
      },
    })

    const viaOurs = await findHeader()
    expect(viaOurs?.navigation).toHaveLength(2)
    expect(viaOurs?.navigation?.[0].label).toBe('Home')
    expect(viaOurs?.navigation?.[1].label).toBe('About')
  })

  it('writes a global Payload can read back', async () => {
    const ours = await updateHeader({
      navigation: [
        { label: 'Home', url: '/' },
        { label: 'Services', url: '/services' },
        { label: 'Contact', url: '/contact' },
      ],
    })
    expect(ours.navigation).toHaveLength(3)
    expect(ours.navigation?.[1].label).toBe('Services')

    const viaPayload = await engine.findGlobal({ slug: 'header', depth: 0 })
    expect((viaPayload.navigation as any)?.length).toBe(3)
    expect((viaPayload.navigation as any)?.[1].label).toBe('Services')
  })
})
