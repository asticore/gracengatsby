// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
//
// STAGE 6a PROOF: `src/localapi/registry.ts`'s `readRegistry`/`writeRegistry`
// wire ALL 21 real collections and ALL 17 real globals (not just the 5-7
// covered by the existing `localapi-operations-parity`/`localapi-read-
// operations-parity` suites this generalizes). Two things are proven here:
//
// 1. BROAD, SHALLOW: for every one of the 38 registry entries, `find`/`count`
//    (collections) or `findGlobal` (globals) through the registry returns the
//    same shape/count as the real, live `getEngine()` - proves every slug key,
//    every config import, and every `src/cms/db` function reference in the
//    registry actually points at the right real entity (a wrong wiring - e.g.
//    a copy-paste slug mismatch - would show up as a 404/NotFound or a
//    mismatched count here, not a TypeScript error, since the registry's
//    types are intentionally loose - see registry.ts's own header).
// 2. NARROW, DEEP: one full write-path round trip (create/update/delete)
//    through `writeRegistry.collections.translations` and
//    `createDocument`/`updateDocument`/`deleteDocument`, proving the
//    registry's write-side entries (not just the read-side ones already
//    exercised in (1)) are wired correctly too - `translations` chosen
//    because it's a plain, non-drafts, admin-only collection not already
//    covered by any other parity test in this project.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteTranslation } from '@/cms/db'
import { Forbidden } from '@/localapi/access'
import { createDocument, deleteDocument, updateDocument, ValidationError } from '@/localapi/operations'
import { count, find, findGlobal } from '@/localapi/read-operations'
import { readRegistry, writeRegistry } from '@/localapi/registry'

const admin = { id: 999902, roles: ['admin'] }

function reqWith(user: typeof admin | null, engine: Engine) {
  return { user, payload: engine, t: (key: string) => key }
}

// shopPlugin() is REMOVED (payload-removal-plan.md: ecommerce cutover).
// Only 'products' is still registered as a real Payload collection (a stub
// reusing the exact same @/features/ecommerce/collections/Products object
// the shadow REST/GraphQL dispatchers use, purely to satisfy
// InvalidFieldRelationship for Events/Courses/Forms's real
// `relationTo: 'products'` fields - see engage.config.ts's comment above
// its `collections:` array). 'orders'/'carts'/'transactions'/'addresses'
// no longer exist in real Payload's config at all, so
// `engine.find({collection: 'orders', ...})` against the REAL engine would
// now throw `APIError: The collection with slug orders can't be found.` -
// there is no real-Payload behavior left to compare those 4 against, so
// they're excluded from this parity loop. (Their own read/write behavior
// is still covered directly by tests/int/cms-db-addresses.int.spec.ts and
// tests/int/cms-db-carts-orders-transactions.int.spec.ts.)
const REMOVED_FROM_REAL_PAYLOAD = new Set(['orders', 'carts', 'transactions', 'addresses'])
const REAL_PARITY_COLLECTION_SLUGS = Object.keys(readRegistry.collections).filter((slug) => !REMOVED_FROM_REAL_PAYLOAD.has(slug))

describe('localapi/registry - parity vs real Payload (all real-Payload-backed collections, read side)', () => {
  let engine: Engine

  beforeAll(async () => {
    engine = await getEngine()
  })

  it.each(REAL_PARITY_COLLECTION_SLUGS)(
    'collection `%s`: registry find()/count() match real engine.find()/count()',
    async (slug) => {
      // Explicit `sort: 'id'` on BOTH sides (rather than relying on either
      // implementation's own default ordering) makes which 5 rows come back
      // deterministic and identical on both sides, so a table with more than
      // 5 rows can't produce a false failure from the two sides picking a
      // different top-N page.
      const viaPayload = (await engine.find({ collection: slug as never, overrideAccess: true, sort: 'id', limit: 5 })) as { docs: { id: number }[]; totalDocs: number }
      const viaOurs = await find(readRegistry, slug, { req: { user: admin }, overrideAccess: true, sort: 'id', limit: 5 })
      expect(viaOurs.totalDocs).toBe(viaPayload.totalDocs)
      expect(viaOurs.docs.map((d) => d.id).sort()).toEqual(viaPayload.docs.map((d) => d.id).sort())

      const viaPayloadCount = await engine.count({ collection: slug as never, overrideAccess: true })
      const viaOursCount = await count(readRegistry, slug, { req: { user: admin }, overrideAccess: true })
      expect(viaOursCount.totalDocs).toBe(viaPayloadCount.totalDocs)
    },
    20_000,
  )
})

describe('localapi/registry - parity vs real Payload (all 17 globals, read side)', () => {
  let engine: Engine

  beforeAll(async () => {
    engine = await getEngine()
  })

  it.each(Object.keys(readRegistry.globals))('global `%s`: registry findGlobal() matches real engine.findGlobal()', async (slug) => {
    const viaPayload = await engine.findGlobal({ slug: slug as never, overrideAccess: true })
    const viaOurs = await findGlobal(readRegistry, slug, { req: { user: admin }, overrideAccess: true })
    // Globals are a single upserted row - both sides return either the same
    // real row (same id) or both `null`/a fresh default row when nothing has
    // ever been saved yet (a genuinely un-configured global on this dev DB).
    if (viaPayload && (viaPayload as { id?: unknown }).id !== undefined) {
      expect((viaOurs as { id?: unknown } | null)?.id).toBe((viaPayload as { id?: unknown }).id)
    }
  })
})

describe('localapi/registry - write-side wiring proof (translations)', () => {
  let engine: Engine
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) await deleteTranslation(id).catch(() => {})
  })

  const Translations = readRegistry.collections.translations!.config
  const translationsDb = writeRegistry.collections.translations!

  it('rejects a missing required field identically (ValidationError vs real Payload)', async () => {
    await expect(createDocument({ collection: Translations, db: translationsDb, data: {}, req: reqWith(admin, engine), overrideAccess: true })).rejects.toThrow(ValidationError)
  })

  it('denies an anonymous create identically (Forbidden - collection is admin-only)', async () => {
    await expect(
      createDocument({
        collection: Translations,
        db: translationsDb,
        data: { locale: 'fr', sourceKind: 'interface', sourceId: 'ui', fieldPath: 'nav.home' },
        req: reqWith(null, engine),
      }),
    ).rejects.toThrow(Forbidden)
  })

  it('creates, updates, and deletes a real row through the registry-wired ops', async () => {
    const created = await createDocument({
      collection: Translations,
      db: translationsDb,
      data: { locale: 'fr', sourceKind: 'interface', sourceId: 'ui', fieldPath: 'nav.home', value: 'Accueil' },
      req: reqWith(admin, engine),
      overrideAccess: true,
    })
    createdIds.push(created.id)
    expect(created.locale).toBe('fr')
    expect(created.value).toBe('Accueil')

    const updated = await updateDocument({ collection: Translations, db: translationsDb, id: created.id, data: { value: 'Accueil (v2)' }, req: reqWith(admin, engine), overrideAccess: true })
    expect(updated.value).toBe('Accueil (v2)')
    expect(updated.fieldPath).toBe('nav.home')

    const deleted = await deleteDocument({ collection: Translations, db: translationsDb, id: created.id, req: reqWith(admin, engine), overrideAccess: true })
    expect(deleted.id).toBe(created.id)
  })
})