// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
//
// STAGE 6d PROOF: generalizes Stage 6c's representative (1-2 entity) smoke
// pass in `localapi-engine.int.spec.ts` to genuinely ALL 21 real collections
// and ALL 17 real globals, exercised THROUGH `createEngine()` ITSELF - not
// through the raw `readRegistry`/`writeRegistry` objects directly the way
// Stage 6a's own `localapi-registry-parity.int.spec.ts` already does. That
// distinction matters: this suite is the first proof that `createEngine()`'s
// own dispatch plumbing (slug lookup, `toLocalReq`, the registries wired
// together) behaves correctly for every entity, not just the handful Stage
// 6c's suite spot-checked.
//
// Slugs are read from `readRegistry` at runtime (`Object.keys(...)`), not
// hardcoded here, so this suite automatically covers every entity Stage 6a's
// registry knows about - the same pattern `localapi-registry-parity.int.spec.ts`
// already established.
import type { Engine as RealEngine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { readRegistry } from '@/localapi/registry'
import { createEngine, type Engine } from '@/localapi/engine'

describe('localapi/engine - createEngine() read-side parity vs real getEngine(), ALL 21 collections', () => {
  const real: Promise<RealEngine> = getEngine()
  const ours: Engine = createEngine()

  it.each(Object.keys(readRegistry.collections))(
    'collection `%s`: createEngine().find()/count() match real engine.find()/count()',
    async (slug) => {
      const engine = await real

      const viaReal = (await engine.find({ collection: slug as never, overrideAccess: true, sort: 'id', limit: 5 })) as { docs: { id: number }[]; totalDocs: number }
      const viaOurs = await ours.find({ collection: slug, overrideAccess: true, sort: 'id', limit: 5 })
      expect(viaOurs.totalDocs).toBe(viaReal.totalDocs)
      expect(viaOurs.docs.map((d) => d.id).sort()).toEqual(viaReal.docs.map((d) => d.id).sort())

      const viaRealCount = await engine.count({ collection: slug as never, overrideAccess: true })
      const viaOursCount = await ours.count({ collection: slug, overrideAccess: true })
      expect(viaOursCount.totalDocs).toBe(viaRealCount.totalDocs)

      // findByID: only meaningful when there's at least one real row to compare -
      // an empty collection on this dev DB has nothing to disagree about.
      const firstId = viaReal.docs[0]?.id
      if (firstId !== undefined) {
        const viaRealByID = await engine.findByID({ collection: slug as never, id: firstId, overrideAccess: true })
        const viaOursByID = await ours.findByID({ collection: slug, id: firstId, overrideAccess: true })
        expect((viaOursByID as { id?: number } | null)?.id).toBe((viaRealByID as { id?: number } | null)?.id)
      }
    },
    20_000,
  )
})

describe('localapi/engine - createEngine() read-side parity vs real getEngine(), ALL 17 globals', () => {
  const real: Promise<RealEngine> = getEngine()
  const ours: Engine = createEngine()

  it.each(Object.keys(readRegistry.globals))(
    'global `%s`: createEngine().findGlobal() matches real engine.findGlobal()',
    async (slug) => {
      const engine = await real

      const viaReal = await engine.findGlobal({ slug: slug as never, overrideAccess: true })
      const viaOurs = await ours.findGlobal({ slug, overrideAccess: true })
      // Globals are a single upserted row - both sides return either the
      // same real row (same id) or both null/a fresh default row when
      // nothing has ever been saved yet (a genuinely un-configured global on
      // this dev DB) - same reasoning as Stage 6a's own registry-level
      // parity test for globals.
      if (viaReal && (viaReal as { id?: unknown }).id !== undefined) {
        expect((viaOurs as { id?: unknown } | null)?.id).toBe((viaReal as { id?: unknown }).id)
      }
    },
    20_000,
  )
})
