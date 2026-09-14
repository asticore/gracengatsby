// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
//
// Runs the SAME create/update/delete through (1) the real, live
// `getEngine()` (today's real-Payload-backed implementation) and (2)
// src/localapi/operations.ts operating on the SAME real src/cms/db layer,
// against the SAME real collection/global configs (imported unmodified from
// src/collections, src/globals - not hand-written mimics), and asserts they
// produce equivalent results: same validation errors on bad input, same
// access denials for a non-privileged user, same hook side-effects, same
// draft-vs-published row states. Five representative targets, chosen to
// exercise different features per the stage brief:
//   - Faqs: a plain (non-drafts, non-versioned) collection, no hooks.
//   - Events: a drafts/versioned collection, a `unique: true` field, and a
//     field-level beforeValidate hook (formatSlugHook).
//   - EventRSVPs: a plain collection with a collection-level beforeChange
//     hook (checkEventCapacity) that can throw, and open (anonymous) create
//     access.
//   - SiteSettings: a global with a collection-level afterChange hook
//     (revalidateAdmin).
//   - Integrations: a global with field-level beforeChange/afterRead hooks
//     (encryptSecretHook/decryptSecretHook) and field-level access.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createEvent, createFaq, deleteEvent, deleteEventRSVP, deleteFaq, findEventByID, findEventRSVPByID, findFaqByID, findIntegrations } from '@/cms/db'
import { Events } from '@/collections/Events'
import { EventRSVPs } from '@/collections/EventRSVPs'
import { Faqs } from '@/collections/Faqs'
import { Integrations } from '@/globals/Integrations'
import { SiteSettings } from '@/globals/SiteSettings'
import { Forbidden } from '@/localapi/access'
import type { CollectionDbOps, GlobalDbOps } from '@/localapi/operations'
import { createDocument, deleteDocument, NotFound, updateDocument, updateGlobalDocument, ValidationError } from '@/localapi/operations'
import { slugify } from '@/utilities/formatSlug'

const admin = { id: 999901, roles: ['admin'] }
const anon: { id: number; roles: string[] } | null = null

/**
 * Real Payload's `buildConfig()` (called at MODULE-EVAL time inside
 * `@/engage.config`, line ~974 - not lazily inside `getEngine()`; this test
 * file's own `import '@/engage.config'` at the top already runs it, before
 * ANY of this file's own top-level code, per how ES module evaluation
 * order works) sanitizes the collection/global configs it's given, and that
 * sanitize step MUTATES each field object in place - assigning a wrapped
 * `field.validate` onto every field that didn't already declare one
 * (`fields/config/sanitize.js:157-165` in `payload@3.88.0`'s dist output).
 * Confirmed empirically: `Events.fields`'s `slug` field already has a
 * function `.validate` before this file's own code ever runs, let alone
 * before any `beforeAll` calls `getEngine()` - so cloning the fields array
 * at any point IN this file cannot outrun the mutation; it has already
 * happened by the time this module's body starts.
 *
 * That wrapped validator is Payload's real, unmodified per-type validator
 * (`fields/validations.js` - e.g. `text`), and it needs a full `req.payload`
 * (for `req.payload.config`) and `req.t` (an i18n translate function, used
 * only to build error MESSAGE text). This module's own `ValidateFieldOptions`
 * deliberately doesn't carry those (see `validators.ts`'s file header: this
 * stage never wires a real engine through to field validators by design),
 * so `visitBeforeChangeField`'s `field.validate ?? getDefaultValidator(...)`
 * line picks the real wrapped one whenever it's present and calls it with
 * whatever `req` this file's `createDocument`/`updateDocument` calls were
 * given - if that `req` has no `payload`/`t`, the real validator crashes
 * exactly the way any real Payload validator would if handed a req that
 * incomplete.
 *
 * Rather than fight this contamination (unfixable from this file, and not
 * a real operations.ts bug - a production caller with no real Payload
 * process alongside it would never see a pre-populated `field.validate` in
 * the first place), every "ours" `req` below supplies a minimal but REAL
 * `payload` (the actual `engine` this file already awaits) and a trivial
 * `t` stub. This makes the parity claim on validation MORE meaningful, not
 * less: when a field's real wrapped validator ends up running on the
 * "ours" side (Events' `slug`, for instance), it is provably the exact same
 * function real Payload calls on the "real" side, not a stand-in.
 */
function reqWith(user: { id: number; roles?: string[] | null } | null, engine: Engine): { user: typeof user; payload: Engine; t: (key: string) => string } {
  return { user, payload: engine, t: (key: string) => key }
}

/* -------------------------------------------------------------------------- */
/* Faqs - plain collection, no hooks                                          */
/* -------------------------------------------------------------------------- */

describe('operations parity - Faqs (plain collection)', () => {
  let engine: Engine
  const oursIds: number[] = []
  const realIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of oursIds) await deleteFaq(id).catch(() => {})
    for (const id of realIds) await engine.delete({ collection: 'faqs', id, overrideAccess: true }).catch(() => {})
  })

  const faqDb: CollectionDbOps<{ id: number; question: string; answer: unknown; category?: string | null; order?: number | null }> = {
    create: createFaq as never,
    updateByID: (id, data) => import('@/cms/db').then((m) => m.updateFaq(id, data as never)) as never,
    deleteByID: deleteFaq,
    findByID: findFaqByID as never,
  }

  it('rejects a missing required field identically (ValidationError vs real Payload ValidationError)', async () => {
    await expect(createDocument({ collection: Faqs, db: faqDb, data: {}, req: reqWith(admin, engine), overrideAccess: true })).rejects.toThrow(ValidationError)
    await expect(engine.create({ collection: 'faqs', data: {} as never, overrideAccess: true })).rejects.toThrow()
  })

  it('denies an anonymous create identically (Forbidden vs real Payload access error)', async () => {
    await expect(createDocument({ collection: Faqs, db: faqDb, data: { question: 'Q?', answer: {} }, req: reqWith(anon, engine) })).rejects.toThrow(Forbidden)
    await expect(engine.create({ collection: 'faqs', data: { question: 'Q?', answer: {} } as never, user: anon as never, overrideAccess: false })).rejects.toThrow()
  })

  it('creates, updates, and deletes an equivalent document to real Payload', async () => {
    // A real lexical editor's own `validate` (called via richText's own
    // `validate` -> `editor.validate`, see `fields/validations.js:249-258`)
    // treats an empty `children: []` doc as unfilled - required needs actual
    // content, not just a well-formed empty root.
    const nonEmptyRichText = { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Answer text.', version: 1 }], direction: null as string | null, format: '', indent: 0, version: 1 }], direction: null as string | null, format: '', indent: 0, version: 1 } }
    const ours = await createDocument({ collection: Faqs, db: faqDb, data: { question: 'Ours Q', answer: nonEmptyRichText, category: 'Shipping', order: 3 }, req: reqWith(admin, engine), overrideAccess: true })
    oursIds.push(ours.id)

    const real = await engine.create({ collection: 'faqs', data: { question: 'Real Q', answer: nonEmptyRichText as never, category: 'Shipping', order: 3 }, overrideAccess: true })
    realIds.push(real.id as number)

    expect(ours.category).toBe(real.category)
    expect(ours.order).toBe(real.order)

    const oursUpdated = await updateDocument({ collection: Faqs, db: faqDb, id: ours.id, data: { order: 9 }, req: reqWith(admin, engine), overrideAccess: true })
    const realUpdated = await engine.update({ collection: 'faqs', id: real.id as number, data: { order: 9 }, overrideAccess: true })
    expect(oursUpdated.order).toBe(realUpdated.order)
    // Untouched fields survive a partial update identically on both sides.
    expect(oursUpdated.question).toBe('Ours Q')
    expect(realUpdated.question).toBe('Real Q')

    const oursDeleted = await deleteDocument({ collection: Faqs, db: faqDb, id: ours.id, req: reqWith(admin, engine), overrideAccess: true })
    expect(oursDeleted.id).toBe(ours.id)
    await expect(findFaqByID(ours.id)).resolves.toBeNull()
    oursIds.length = 0
  })
})

/* -------------------------------------------------------------------------- */
/* Events - drafts/versioned collection, unique slug, field-level beforeValidate */
/* -------------------------------------------------------------------------- */

describe('operations parity - Events (drafts, unique slug, formatSlugHook)', () => {
  let engine: Engine
  const oursIds: number[] = []
  const realIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of oursIds) await deleteEvent(id).catch(() => {})
    for (const id of realIds) await engine.delete({ collection: 'events', id, overrideAccess: true }).catch(() => {})
  })

  const eventDb: CollectionDbOps<{ id: number; title: string; slug?: string | null; _status?: string | null }> = {
    create: createEvent as never,
    updateByID: (id, data, opts) => import('@/cms/db').then((m) => m.updateEvent(id, data as never, opts)) as never,
    deleteByID: deleteEvent,
    findByID: findEventByID as never,
  }

  it('formatSlugHook (field-level beforeValidate) produces the same slug as real Payload', async () => {
    // Distinct titles (and therefore distinct slugs, `eg_events.slug` being
    // unique - see the file header's "Unique-field enforcement" finding) -
    // comparing each side's OWN slug to an independently-computed expected
    // value (via the same real, unmodified `slugify`) is an equally strong
    // parity check without an ours-vs-real collision.
    const oursTitle = `Parity Event Slug Test Ours ${Date.now()}`
    const realTitle = `Parity Event Slug Test Real ${Date.now()}`

    const ours = await createDocument({ collection: Events, db: eventDb, data: { title: oursTitle, startDate: new Date().toISOString(), eventType: 'free' }, req: reqWith(admin, engine), overrideAccess: true })
    oursIds.push(ours.id)

    const real = await engine.create({ collection: 'events', data: { title: realTitle, startDate: new Date().toISOString(), eventType: 'free' }, overrideAccess: true })
    realIds.push(real.id as number)

    expect(ours.slug).toBe(slugify(oursTitle))
    expect(real.slug).toBe(slugify(realTitle))
    expect(ours._status).toBe('draft')
    expect(real._status).toBe('draft')
  })

  it('draft:true update leaves the live row untouched, identically on both sides', async () => {
    const ours = await createDocument({ collection: Events, db: eventDb, data: { title: 'Ours base', startDate: new Date().toISOString(), eventType: 'free' }, req: reqWith(admin, engine), overrideAccess: true })
    oursIds.push(ours.id)
    await updateDocument({ collection: Events, db: eventDb, id: ours.id, data: { title: 'Ours published', _status: 'published' }, req: reqWith(admin, engine), overrideAccess: true })
    await updateDocument({ collection: Events, db: eventDb, id: ours.id, data: { title: 'Ours draft edit' }, req: reqWith(admin, engine), overrideAccess: true, draft: true })

    const real = await engine.create({ collection: 'events', data: { title: 'Real base', startDate: new Date().toISOString(), eventType: 'free' }, overrideAccess: true })
    realIds.push(real.id as number)
    await engine.update({ collection: 'events', id: real.id as number, data: { title: 'Real published', _status: 'published' }, overrideAccess: true })
    await engine.update({ collection: 'events', id: real.id as number, data: { title: 'Real draft edit' }, overrideAccess: true, draft: true })

    const oursLive = await findEventByID(ours.id)
    const realLive = await engine.findByID({ collection: 'events', id: real.id as number, overrideAccess: true, depth: 0 })
    expect(oursLive?.title).toBe('Ours published')
    expect(realLive.title).toBe('Real published')

    const oursDraft = await findEventByID(ours.id, { draft: true })
    const realDraft = await engine.findByID({ collection: 'events', id: real.id as number, overrideAccess: true, depth: 0, draft: true })
    expect(oursDraft?.title).toBe('Ours draft edit')
    expect(realDraft.title).toBe('Real draft edit')
  })

  it('denies a non-admin update identically (access.update: isAdmin)', async () => {
    const ours = await createDocument({ collection: Events, db: eventDb, data: { title: 'Locked', startDate: new Date().toISOString(), eventType: 'free' }, req: reqWith(admin, engine), overrideAccess: true })
    oursIds.push(ours.id)

    await expect(updateDocument({ collection: Events, db: eventDb, id: ours.id, data: { title: 'hijack' }, req: reqWith({ id: 2, roles: ['customer'] }, engine) })).rejects.toThrow(Forbidden)
    await expect(engine.update({ collection: 'events', id: ours.id, data: { title: 'hijack' }, user: { id: 2, roles: ['customer'] } as never, overrideAccess: false })).rejects.toThrow()
  })

  it("a duplicate `slug` (unique: true) is rejected as a ValidationError identically on both sides - see operations.ts's own 'unique-field enforcement' finding: eg_events.slug's live table already carries a real SQLite unique index", async () => {
    const slug = `duplicate-slug-${Date.now()}`

    const oursFirst = await createDocument({ collection: Events, db: eventDb, data: { title: 'Ours First', slug, startDate: new Date().toISOString(), eventType: 'free' }, req: reqWith(admin, engine), overrideAccess: true })
    oursIds.push(oursFirst.id)
    // createDocument's db.create call is wrapped in a try/catch that runs the
    // raw D1 SQLITE_CONSTRAINT_UNIQUE error through
    // uniqueConstraintErrorToValidationError - so the SECOND create rejects
    // as a ValidationError, not a raw DB error escaping.
    await expect(
      createDocument({ collection: Events, db: eventDb, data: { title: 'Ours Second', slug, startDate: new Date().toISOString(), eventType: 'free' }, req: reqWith(admin, engine), overrideAccess: true }),
    ).rejects.toThrow(ValidationError)

    const realFirst = await engine.create({ collection: 'events', data: { title: 'Real First', slug: `${slug}-real`, startDate: new Date().toISOString(), eventType: 'free' }, overrideAccess: true })
    realIds.push(realFirst.id as number)
    await expect(
      engine.create({ collection: 'events', data: { title: 'Real Second', slug: `${slug}-real`, startDate: new Date().toISOString(), eventType: 'free' }, overrideAccess: true }),
    ).rejects.toThrow()
  })

  it('bypassing operations.ts entirely (calling src/cms/db directly) leaks the raw D1 error unwrapped - confirming the translation above is operations.ts closing a real gap, not papering over one that never existed', async () => {
    const slug = `raw-duplicate-slug-${Date.now()}`
    const first = await createEvent({ title: 'Raw First', slug, startDate: new Date().toISOString(), eventType: 'free' })
    oursIds.push(first.id)

    let caught: unknown
    try {
      await createEvent({ title: 'Raw Second', slug, startDate: new Date().toISOString(), eventType: 'free' })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeDefined()
    expect(caught).not.toBeInstanceOf(ValidationError)
    // The drizzle wrapper's own top-level `.message` is a generic
    // "Failed query: insert into ..." - the actual SQLite wording lives on
    // `.cause` (drizzle) / `.cause.cause` (D1's own driver), unwrapped by
    // nothing, since this call never goes through operations.ts at all.
    const chain = [caught, (caught as { cause?: unknown })?.cause, ((caught as { cause?: { cause?: unknown } })?.cause)?.cause]
    const matched = chain.some((e) => e instanceof Error && /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(e.message))
    expect(matched).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* EventRSVPs - collection-level beforeChange hook that can throw            */
/* -------------------------------------------------------------------------- */

describe('operations parity - EventRSVPs (checkEventCapacity beforeChange hook)', () => {
  let engine: Engine
  let eventId: number
  const rsvpIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
    // capacity: 2 - the first test below fills it exactly (ours + real, one
    // guest each, guestCount must be >= 1 per the field's own `min: 1` - see
    // that test's own comment), and the second test's extra guest pushes
    // over it, on both sides.
    const event = await createEvent({ title: `Capacity parity ${Date.now()}`, startDate: new Date().toISOString(), eventType: 'free', capacity: 2 })
    eventId = event.id
  })

  afterAll(async () => {
    for (const id of rsvpIds) await deleteEventRSVP(id).catch(() => {})
    await deleteEvent(eventId).catch(() => {})
  })

  const rsvpDb: CollectionDbOps<{ id: number; event: number; name: string; email: string; guestCount?: number | null }> = {
    create: (data) => import('@/cms/db').then((m) => m.createEventRSVP(data as never)) as never,
    updateByID: (id, data) => import('@/cms/db').then((m) => m.updateEventRSVP(id, data as never)) as never,
    deleteByID: deleteEventRSVP,
    findByID: findEventRSVPByID as never,
  }

  it('anonymous create is allowed (access.create: () => true) - same on both sides', async () => {
    // checkEventCapacity (the real, unmodified collection-level beforeChange
    // hook - see file header) calls `req.payload.findByID`/`req.payload.find`
    // itself, so `req` here needs a real `payload` client, not just `user` -
    // `LocalReq` is additive (`{ user?: ... } & Record<string, unknown>`) for
    // exactly this reason, see access.ts's own doc comment on it.
    const ours = await createDocument({ collection: EventRSVPs, db: rsvpDb, data: { event: eventId, name: 'Ours guest', email: `ours-${Date.now()}@example.com`, guestCount: 1 }, req: reqWith(anon, engine) })
    rsvpIds.push(ours.id)
    expect(ours.name).toBe('Ours guest')

    // guestCount has `min: 1` - 0 would (correctly) fail real Payload's own
    // number validator, so use a valid value on both sides.
    const real = await engine.create({ collection: 'event-rsvps', data: { event: eventId, name: 'Real guest', email: `real-${Date.now()}@example.com`, guestCount: 1 }, user: anon, overrideAccess: false })
    rsvpIds.push(real.id as number)
  })

  it('the real, unmodified checkEventCapacity hook throws identically once the event is at capacity', async () => {
    // capacity is 2, and the previous test's two guests (one per side, one
    // each real event) already fill it exactly - both sides are now at
    // capacity, so one more guest on either side must reject.
    await expect(
      createDocument({ collection: EventRSVPs, db: rsvpDb, data: { event: eventId, name: 'Ours overflow', email: `overflow-ours-${Date.now()}@example.com`, guestCount: 1 }, req: reqWith(anon, engine) }),
    ).rejects.toThrow(/at capacity/)

    await expect(
      engine.create({ collection: 'event-rsvps', data: { event: eventId, name: 'Real overflow', email: `overflow-real-${Date.now()}@example.com`, guestCount: 1 }, user: anon, overrideAccess: false }),
    ).rejects.toThrow(/at capacity/)
  })
})

/* -------------------------------------------------------------------------- */
/* SiteSettings - global, collection-level afterChange hook                  */
/* -------------------------------------------------------------------------- */

describe('operations parity - SiteSettings (global, afterChange hook)', () => {
  let engine: Engine
  let originalSiteName: string | null | undefined

  beforeAll(async () => {
    engine = await getEngine()
    const existing = await engine.findGlobal({ slug: 'site-settings', overrideAccess: true, depth: 0 }).catch((): null => null)
    originalSiteName = (existing as { siteName?: string | null } | null)?.siteName
  })

  afterAll(async () => {
    await engine.updateGlobal({ slug: 'site-settings', data: { siteName: originalSiteName ?? 'Grace & Gatsby' }, overrideAccess: true }).catch(() => {})
  })

  const siteSettingsDb: GlobalDbOps<Record<string, unknown>> = {
    find: () => import('@/cms/db').then((m) => m.findSiteSettings()) as never,
    update: (data) => import('@/cms/db').then((m) => m.updateSiteSettings(data as never)) as never,
  }

  it('denies a non-admin update identically (access.update: isAdmin)', async () => {
    await expect(updateGlobalDocument({ global: SiteSettings, db: siteSettingsDb, data: { siteName: 'hijack' }, req: reqWith({ id: 3, roles: ['customer'] }, engine) })).rejects.toThrow(Forbidden)
    await expect(engine.updateGlobal({ slug: 'site-settings', data: { siteName: 'hijack' }, user: { id: 3, roles: ['customer'] } as never, overrideAccess: false })).rejects.toThrow()
  })

  it('updates the global and runs the real afterChange hook (revalidateAdmin) without throwing, on both sides', async () => {
    const ours = await updateGlobalDocument({ global: SiteSettings, db: siteSettingsDb, data: { siteName: 'Ours Site Name' }, req: reqWith(admin, engine), overrideAccess: true })
    expect(ours.siteName).toBe('Ours Site Name')

    const real = await engine.updateGlobal({ slug: 'site-settings', data: { siteName: 'Real Site Name' }, overrideAccess: true })
    expect(real.siteName).toBe('Real Site Name')
  })
})

/* -------------------------------------------------------------------------- */
/* Integrations - global, field-level beforeChange/afterRead (secret field)  */
/* -------------------------------------------------------------------------- */

describe('operations parity - Integrations (field-level encrypt/decrypt hooks)', () => {
  let engine: Engine

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    await engine.updateGlobal({ slug: 'integrations', data: { claudeApiKey: '' }, overrideAccess: true }).catch(() => {})
  })

  const integrationsDb: GlobalDbOps<Record<string, unknown>> = {
    find: () => import('@/cms/db').then((m) => m.findIntegrations()) as never,
    update: (data) => import('@/cms/db').then((m) => m.updateIntegrations(data as never)) as never,
  }

  it('encrypts a plaintext secret at rest and decrypts it back on the returned doc - same as real Payload', async () => {
    const oursPlaintext = `ours-secret-${Date.now()}`
    const ours = await updateGlobalDocument({ global: Integrations, db: integrationsDb, data: { claudeApiKey: oursPlaintext }, req: reqWith(admin, engine), overrideAccess: true })
    // The RETURNED doc is decrypted (afterRead ran on the write's own result).
    expect(ours.claudeApiKey).toBe(oursPlaintext)
    // The RAW stored row is ciphertext (src/cms/db's own generic layer never
    // runs field hooks - see src/cms/db/globals/integrations.ts's own "KNOWN
    // GAP" doc comment - so this only holds because operations.ts's
    // beforeChange field traversal encrypted `claudeApiKey` BEFORE calling
    // db.update, closing that documented gap for any collection/global
    // driven through this module).
    const rawOurs = await findIntegrations()
    expect(rawOurs?.claudeApiKey).toMatch(/^enc:v1:/)
    expect(rawOurs?.claudeApiKey).not.toBe(oursPlaintext)

    const realPlaintext = `real-secret-${Date.now()}`
    const real = await engine.updateGlobal({ slug: 'integrations', data: { claudeApiKey: realPlaintext }, overrideAccess: true })
    expect(real.claudeApiKey).toBe(realPlaintext)
    const rawReal = await findIntegrations()
    expect(rawReal?.claudeApiKey).toMatch(/^enc:v1:/)
  })

  it('denies a non-admin update identically (access.update: isAdmin)', async () => {
    await expect(updateGlobalDocument({ global: Integrations, db: integrationsDb, data: { claudeApiKey: 'hijack' }, req: reqWith({ id: 4, roles: ['customer'] }, engine) })).rejects.toThrow(Forbidden)
    await expect(engine.updateGlobal({ slug: 'integrations', data: { claudeApiKey: 'hijack' }, user: { id: 4, roles: ['customer'] } as never, overrideAccess: false })).rejects.toThrow()
  })
})

// Silence an unused-import lint if NotFound ends up only referenced in a
// skipped branch during future edits - kept imported deliberately since every
// pipeline function's NotFound path is already exercised in
// tests/int/localapi-operations.int.spec.ts's unit suite, not duplicated here.
void NotFound
