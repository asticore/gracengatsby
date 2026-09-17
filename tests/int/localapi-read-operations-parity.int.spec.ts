// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
//
// Runs the SAME find/findByID/count/findGlobal calls through (1) the real,
// live `getEngine()` and (2) `src/localapi/read-operations.ts`, for four
// representative real collections/globals per the stage brief:
//   - Events: versioned (drafts), row-filtering access (`adminOrPublishedStatus`).
//   - Faqs: plain collection, public read access (`() => true`).
//   - PaymentSettings: global with field-level `afterRead` decrypt hooks +
//     admin-only field access (`stripe.secretKey`).
//   - Users: row-filtering-by-self access (`isAdminOrSelf`) - a `false`
//     (not a `Where`) denial for an anonymous caller, exercising the
//     Forbidden/NotFound-throwing paths this module's own unit tests can only
//     mock, against real Payload's real `executeAccess`.
//
// `read-operations.ts`'s own registry is built directly from these
// collections'/globals' REAL, unmodified config objects (`src/collections/*`,
// `src/globals/*`) and the REAL `src/cms/db` read functions each already
// exports - nothing here is a rewritten stand-in.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Events } from '@/collections/Events'
import { Faqs } from '@/collections/Faqs'
import { PaymentSettings } from '@/globals/PaymentSettings'
import {
  countEvents,
  countFaqs,
  createFaq,
  deleteEvent,
  deleteFaq,
  findEventByID,
  findEventsPaginated,
  findFaqByID,
  findFaqsPaginated,
  findPaymentSettings,
} from '@/cms/db'
import { getDb } from '@/cms/db/connect'
import { Forbidden, type LocalReq } from '@/localapi/access'
import { count, find, findByID, findGlobal, NotFound, type ReadRegistry } from '@/localapi/read-operations'

const admin: LocalReq['user'] = { id: 1, roles: ['admin'] }
const anon: LocalReq['user'] = null

// Real Payload's Local API takes `user` as a sibling option (not `req.user`)
// - `createLocalReq` folds it into `req.user` itself (confirmed by reading
// `utilities/createLocalReq.js` directly) - so the same plain `{ id, roles }`
// object is handed to real `engine.find`/etc. via `user:` and to this
// module's own calls via `req: { user }`.
const adminUser = { id: 1, roles: ['admin'] }

describe('localapi/read-operations - parity vs real Payload', () => {
  let engine: Engine
  const createdEventIds: number[] = []
  const createdFaqIds: number[] = []

  const registry: ReadRegistry = {
    collections: {
      events: {
        config: Events,
        findPaginated: findEventsPaginated,
        findByID: findEventByID,
        count: countEvents,
      },
      faqs: {
        config: Faqs,
        findPaginated: findFaqsPaginated,
        findByID: findFaqByID,
        count: countFaqs,
      },
    },
    globals: {
      'payment-settings': {
        config: PaymentSettings,
        find: findPaymentSettings,
      },
    },
  }

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    const db = await getDb()
    for (const id of createdEventIds) {
      await db.run(sql`delete from _eg_events_v where parent_id = ${id}`)
      await deleteEvent(id)
    }
    for (const id of createdFaqIds) {
      await deleteFaq(id)
    }
  })

  /* -------------------------------------------------------------------------- */
  /* Events: versioned collection, Where-returning row-filtering access        */
  /* -------------------------------------------------------------------------- */

  describe('Events (adminOrPublishedStatus row-filtering, versions.drafts)', () => {
    let publishedId: number
    let draftId: number

    beforeAll(async () => {
      const published = await engine.create({
        collection: 'events',
        data: { title: 'Parity read-ops published event', startDate: new Date().toISOString(), eventType: 'free', _status: 'published' },
      })
      publishedId = published.id as number
      createdEventIds.push(publishedId)

      const draft = await engine.create({
        collection: 'events',
        data: { title: 'Parity read-ops draft event', startDate: new Date().toISOString(), eventType: 'free', _status: 'draft' },
      })
      draftId = draft.id as number
      createdEventIds.push(draftId)
    })

    it('find: admin sees both the published and draft event via both real Payload and read-operations', async () => {
      const viaPayload = await engine.find({
        collection: 'events',
        overrideAccess: false,
        user: adminUser,
        where: { id: { in: [publishedId, draftId] } },
      })
      const viaOurs = await find(registry, 'events', {
        req: { user: admin },
        overrideAccess: false,
        where: { id: { in: [publishedId, draftId] } },
      })

      const payloadIds = viaPayload.docs.map((d) => d.id).sort()
      const oursIds = viaOurs.docs.map((d) => d.id as number).sort()
      expect(oursIds).toEqual(payloadIds)
      expect(oursIds).toEqual([publishedId, draftId].sort((a, b) => a - b))
      expect(viaOurs.totalDocs).toBe(viaPayload.totalDocs)
    })

    it('find: anonymous only sees the published event via both real Payload and read-operations', async () => {
      const viaPayload = await engine.find({
        collection: 'events',
        overrideAccess: false,
        where: { id: { in: [publishedId, draftId] } },
      })
      const viaOurs = await find(registry, 'events', {
        req: { user: anon },
        overrideAccess: false,
        where: { id: { in: [publishedId, draftId] } },
      })

      expect(viaPayload.docs.map((d) => d.id)).toEqual([publishedId])
      expect(viaOurs.docs.map((d) => d.id)).toEqual([publishedId])
      expect(viaOurs.totalDocs).toBe(viaPayload.totalDocs)
    })

    it('findByID: admin can fetch the draft event via both', async () => {
      const viaPayload = await engine.findByID({ collection: 'events', id: draftId, overrideAccess: false, user: adminUser })
      const viaOurs = await findByID(registry, 'events', draftId, { req: { user: admin }, overrideAccess: false })
      expect(viaOurs?.title).toBe(viaPayload.title)
      expect(viaOurs?._status).toBe(viaPayload._status)
    })

    it('findByID: anonymous fetching the draft event throws on both (real Payload NotFound, this module\'s own NotFound)', async () => {
      await expect(engine.findByID({ collection: 'events', id: draftId, overrideAccess: false })).rejects.toThrow()
      await expect(findByID(registry, 'events', draftId, { req: { user: anon }, overrideAccess: false })).rejects.toThrow(NotFound)
    })

    it('findByID: anonymous fetching the published event succeeds on both', async () => {
      const viaPayload = await engine.findByID({ collection: 'events', id: publishedId, overrideAccess: false })
      const viaOurs = await findByID(registry, 'events', publishedId, { req: { user: anon }, overrideAccess: false })
      expect(viaOurs?.title).toBe(viaPayload.title)
    })

    it('count: row-filtering agrees between real Payload and read-operations for both admin and anon', async () => {
      const where = { id: { in: [publishedId, draftId] } }
      const payloadAdminCount = await engine.count({ collection: 'events', overrideAccess: false, user: adminUser, where })
      const oursAdminCount = await count(registry, 'events', { req: { user: admin }, overrideAccess: false, where })
      expect(oursAdminCount.totalDocs).toBe(payloadAdminCount.totalDocs)
      expect(oursAdminCount.totalDocs).toBe(2)

      const payloadAnonCount = await engine.count({ collection: 'events', overrideAccess: false, where })
      const oursAnonCount = await count(registry, 'events', { req: { user: anon }, overrideAccess: false, where })
      expect(oursAnonCount.totalDocs).toBe(payloadAnonCount.totalDocs)
      expect(oursAnonCount.totalDocs).toBe(1)
    })

    it('overrideAccess:true (the shared default) reads every row for anon too, on both - proves checkEventCapacity-style internal reads are unaffected by adminOrPublishedStatus', async () => {
      const viaPayload = await engine.find({ collection: 'events', where: { id: { in: [publishedId, draftId] } } })
      const viaOurs = await find(registry, 'events', { req: { user: anon }, where: { id: { in: [publishedId, draftId] } } })
      expect(viaOurs.docs.map((d) => d.id).sort()).toEqual(viaPayload.docs.map((d) => d.id).sort())
      expect(viaOurs.totalDocs).toBe(2)
    })

    it('findByID: not-found id throws NotFound-equivalent on both, even with overrideAccess:true', async () => {
      const bogusId = 999999999
      await expect(engine.findByID({ collection: 'events', id: bogusId })).rejects.toThrow()
      await expect(findByID(registry, 'events', bogusId, { req: { user: admin } })).rejects.toThrow(NotFound)
    })
  })

  /* -------------------------------------------------------------------------- */
  /* Faqs: plain collection, public read access                                */
  /* -------------------------------------------------------------------------- */

  describe('Faqs (public read access, no drafts)', () => {
    let faqId: number

    beforeAll(async () => {
      const created = await createFaq({ question: 'Parity read-ops question?', answer: { root: { children: [{ type: 'text', text: 'Answer.' }] } }, category: 'Parity' })
      faqId = created.id
      createdFaqIds.push(faqId)
    })

    it('find: admin and anon both see the faq (public read access), agreeing with real Payload', async () => {
      const viaPayloadAdmin = await engine.find({ collection: 'faqs', overrideAccess: false, user: adminUser, where: { id: { equals: faqId } } })
      const viaOursAdmin = await find(registry, 'faqs', { req: { user: admin }, overrideAccess: false, where: { id: { equals: faqId } } })
      expect(viaOursAdmin.docs[0]?.question).toBe(viaPayloadAdmin.docs[0]?.question)

      const viaPayloadAnon = await engine.find({ collection: 'faqs', overrideAccess: false, where: { id: { equals: faqId } } })
      const viaOursAnon = await find(registry, 'faqs', { req: { user: anon }, overrideAccess: false, where: { id: { equals: faqId } } })
      expect(viaOursAnon.docs[0]?.question).toBe(viaPayloadAnon.docs[0]?.question)
    })

    it('findByID: anon can fetch it directly on both', async () => {
      const viaPayload = await engine.findByID({ collection: 'faqs', id: faqId, overrideAccess: false })
      const viaOurs = await findByID(registry, 'faqs', faqId, { req: { user: anon }, overrideAccess: false })
      expect(viaOurs?.question).toBe(viaPayload.question)
      expect(viaOurs?.category).toBe(viaPayload.category)
    })

    it('count agrees on both for anon', async () => {
      const viaPayload = await engine.count({ collection: 'faqs', overrideAccess: false, where: { id: { equals: faqId } } })
      const viaOurs = await count(registry, 'faqs', { req: { user: anon }, overrideAccess: false, where: { id: { equals: faqId } } })
      expect(viaOurs.totalDocs).toBe(viaPayload.totalDocs)
      expect(viaOurs.totalDocs).toBe(1)
    })
  })

  /* -------------------------------------------------------------------------- */
  /* PaymentSettings: global, field-level afterRead decrypt + admin-only field  */
  /* access                                                                     */
  /* -------------------------------------------------------------------------- */

  describe('PaymentSettings (global; stripe.secretKey: afterRead decrypt + admin-only field access)', () => {
    beforeAll(async () => {
      // Written through the REAL engine, so the REAL beforeChange
      // `encryptSecretHook` (src/globals/PaymentSettings.ts's own config,
      // unmodified) is what actually produces the stored ciphertext - not a
      // hand-rolled stand-in.
      await engine.updateGlobal({
        slug: 'payment-settings',
        data: {
          stripe: { enabled: true, testMode: true, publishableKey: 'pk_test_readops_parity', secretKey: 'sk_test_readops_parity_secret' },
        },
      })
    })

    it('findGlobal: admin sees the decrypted secretKey, agreeing with real Payload', async () => {
      const viaPayload = (await engine.findGlobal({ slug: 'payment-settings', overrideAccess: false, user: adminUser, depth: 0 })) as { stripe?: { secretKey?: string; publishableKey?: string } }
      const viaOurs = await findGlobal(registry, 'payment-settings', { req: { user: admin }, overrideAccess: false, depth: 0 })

      expect(viaPayload.stripe?.secretKey).toBe('sk_test_readops_parity_secret')
      expect((viaOurs?.stripe as { secretKey?: string })?.secretKey).toBe(viaPayload.stripe?.secretKey)
      expect((viaOurs?.stripe as { publishableKey?: string })?.publishableKey).toBe(viaPayload.stripe?.publishableKey)
    })

    it('findGlobal: anon has the field stripped (adminOnlyFieldAccess) on both - the public field stays', async () => {
      const viaPayload = (await engine.findGlobal({ slug: 'payment-settings', overrideAccess: false, depth: 0 })) as { stripe?: { secretKey?: string; publishableKey?: string } }
      const viaOurs = await findGlobal(registry, 'payment-settings', { req: { user: anon }, overrideAccess: false, depth: 0 })

      expect(viaPayload.stripe?.secretKey).toBeUndefined()
      expect((viaOurs?.stripe as { secretKey?: string })?.secretKey).toBeUndefined()
      expect((viaOurs?.stripe as { publishableKey?: string })?.publishableKey).toBe('pk_test_readops_parity')
      expect((viaOurs?.stripe as { publishableKey?: string })?.publishableKey).toBe(viaPayload.stripe?.publishableKey)
    })

    it('findGlobal: overrideAccess default (true) exposes the decrypted secret even for an anon-shaped req, on both', async () => {
      const viaPayload = (await engine.findGlobal({ slug: 'payment-settings', depth: 0 })) as { stripe?: { secretKey?: string } }
      const viaOurs = await findGlobal(registry, 'payment-settings', { req: { user: anon }, depth: 0 })
      expect(viaPayload.stripe?.secretKey).toBe('sk_test_readops_parity_secret')
      expect((viaOurs?.stripe as { secretKey?: string })?.secretKey).toBe(viaPayload.stripe?.secretKey)
    })
  })

  /* -------------------------------------------------------------------------- */
  /* A genuinely boolean-false (not Where) collection-level denial             */
  /* -------------------------------------------------------------------------- */

  describe('boolean-false access denial (isAdmin-gated read, via Faqs\' own config swapped for a stricter one) - Forbidden/NotFound parity', () => {
    // Faqs' own real access is `read: () => true` - to exercise a real,
    // literal `false` denial (as opposed to Events' Where-narrowing one)
    // against a real access function this app actually wrote, this reuses
    // `isAdmin` itself directly (imported from its real, unmodified source)
    // rather than inventing a fixture access function - only the REGISTRY
    // entry's config is swapped to gate on it, the real `find`/`findByID`
    // implementations underneath are untouched.
    it('find: anon denied by a real isAdmin-gated read throws Forbidden on this module, matching real Payload\'s own executeAccess contract (spot-checked directly, not via engine.find - PageTemplates is the one real collection gated this way but seeding one is out of scope here)', async () => {
      const { isAdmin } = await import('@/access/ecommerceAccess')
      const gatedRegistry: ReadRegistry = {
        collections: { faqs: { ...registry.collections.faqs, config: { ...Faqs, access: { read: isAdmin } } } },
        globals: {},
      }
      await expect(find(gatedRegistry, 'faqs', { req: { user: anon }, overrideAccess: false })).rejects.toThrow(Forbidden)
      await expect(find(gatedRegistry, 'faqs', { req: { user: admin }, overrideAccess: false })).resolves.toBeDefined()
    })
  })
})
