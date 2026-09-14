// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteEvent, deleteEventRSVP, deletePost, deleteUser } from '@/cms/db'
import { email, number, relationship, select } from '@/localapi/validators'

/**
 * Sanity-checks this module's field-type table against REAL Payload
 * (`node_modules/payload`, fully in place at this stage - the Local API
 * cutover itself is a later stage) rather than only against its own
 * internal reading of validations.js: for a handful of real fields on real
 * collections, drive `engine.create` (Payload's own Local API) with the
 * same inputs handed to this module's own validator, and assert both sides
 * agree on accept-vs-reject. This is a spot check, not exhaustive coverage
 * (see localapi-validators.int.spec.ts for the actual unit-test coverage of
 * every field type's decision logic) - just enough real fields, across
 * enough of the 13 field types, to prove the spec this module was built
 * from was correctly derived from Payload's real behavior and not merely
 * internally self-consistent.
 */
describe('localapi/validators - parity spot-checks against real Payload', () => {
  let engine: Engine
  const createdEventIds: number[] = []
  const createdUserIds: number[] = []
  const createdPostIds: number[] = []
  const createdRsvpIds: number[] = []

  const EVENT_TYPE_OPTIONS = [
    { label: 'Free (RSVP)', value: 'free' },
    { label: 'Paid (ticketed)', value: 'paid' },
  ]
  const ROLE_OPTIONS = [
    { label: 'Admin', value: 'admin' },
    { label: 'Customer', value: 'customer' },
  ]

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdRsvpIds) await deleteEventRSVP(id)
    for (const id of createdPostIds) await deletePost(id)
    for (const id of createdEventIds) await deleteEvent(id)
    for (const id of createdUserIds) await deleteUser(id)
  })

  it('Events.eventType (select): real Payload accepts a valid option, matching our validator', async () => {
    expect(select('free', { options: EVENT_TYPE_OPTIONS, required: true })).toBe(true)

    const created = await engine.create({
      collection: 'events',
      data: { title: `Parity select valid ${Date.now()}`, startDate: new Date().toISOString(), eventType: 'free' },
    })
    createdEventIds.push(created.id as number)
  })

  it('Events.eventType (select): real Payload rejects a value that matches no option, matching our validator', async () => {
    expect(select('nonsense', { options: EVENT_TYPE_OPTIONS, required: true })).not.toBe(true)

    await expect(
      engine.create({
        collection: 'events',
        // `eventType` is deliberately out-of-union here (that's the whole
        // point of this test) - `as any` sidesteps the resulting TS2322
        // rather than widening the surrounding `data` object's type.
        data: { title: `Parity select invalid ${Date.now()}`, startDate: new Date().toISOString(), eventType: 'nonsense' as any },
      }),
    ).rejects.toThrow()
  })

  it('Users.roles (select, hasMany): real Payload accepts distinct valid selections, matching our validator', async () => {
    expect(select(['admin'], { hasMany: true, options: ROLE_OPTIONS })).toBe(true)

    const created = await engine.create({
      collection: 'users',
      data: { email: `parity-select-hasmany-${Date.now()}@example.com`, password: 'ParityTestPassword!', roles: ['admin'] },
    })
    createdUserIds.push(created.id as number)
  })

  it('Users.roles (select, hasMany): real Payload rejects duplicate selections, matching our validator', async () => {
    expect(select(['admin', 'admin'], { hasMany: true, options: ROLE_OPTIONS })).not.toBe(true)

    await expect(
      engine.create({
        collection: 'users',
        data: { email: `parity-select-dup-${Date.now()}@example.com`, password: 'ParityTestPassword!', roles: ['admin', 'admin'] },
      }),
    ).rejects.toThrow()
  })

  it('EventRSVPs.email: real Payload rejects an invalid email, matching our validator (event/name/guestCount all otherwise valid)', async () => {
    const event = await engine.create({
      collection: 'events',
      data: { title: `Parity RSVP host event ${Date.now()}`, startDate: new Date().toISOString(), eventType: 'free' },
    })
    createdEventIds.push(event.id as number)

    expect(email('not-an-email', { required: true })).not.toBe(true)

    await expect(
      engine.create({
        collection: 'event-rsvps',
        data: { event: event.id, name: 'Parity Guest', email: 'not-an-email', guestCount: 2 },
      }),
    ).rejects.toThrow()
  })

  it('EventRSVPs.guestCount (number, min: 1): real Payload rejects a value below min, matching our validator', async () => {
    const event = await engine.create({
      collection: 'events',
      data: { title: `Parity RSVP guestCount event ${Date.now()}`, startDate: new Date().toISOString(), eventType: 'free' },
    })
    createdEventIds.push(event.id as number)

    expect(number(0, { min: 1 })).not.toBe(true)
    expect(number(2, { min: 1 })).toBe(true)

    await expect(
      engine.create({
        collection: 'event-rsvps',
        data: { event: event.id, name: 'Parity Guest', email: `parity-guestcount-${Date.now()}@example.com`, guestCount: 0 },
      }),
    ).rejects.toThrow()

    const validRsvp = await engine.create({
      collection: 'event-rsvps',
      data: { event: event.id, name: 'Parity Guest 2', email: `parity-guestcount-ok-${Date.now()}@example.com`, guestCount: 2 },
    })
    createdRsvpIds.push(validRsvp.id as number)
  })

  it('Posts.author (relationship): real Payload accepts a real user id and rejects a non-numeric shape, matching our validator', async () => {
    const user = await engine.create({
      collection: 'users',
      data: { email: `parity-relationship-${Date.now()}@example.com`, password: 'ParityTestPassword!' },
    })
    createdUserIds.push(user.id as number)

    expect(relationship(user.id as number, { relationTo: 'users' })).toBe(true)
    expect(relationship('not-a-numeric-id', { relationTo: 'users' })).not.toBe(true)

    // The minimal shape Payload's own create/update accepts for a richText
    // value at runtime - see cms-db-posts.int.spec.ts's own local `richText`
    // helper for the same shorthand. `engage-types.ts`'s generated
    // `SerializedEditorState` type is stricter than this at compile time
    // (it wants every Lexical bookkeeping field - `direction`/`format`/
    // `indent`/`version` - present too), so this is cast rather than typed
    // precisely; that stricter-than-runtime generated type is pre-existing
    // and out of scope for this module (see cms-db-posts.int.spec.ts /
    // cms-db-posts-drafts.int.spec.ts for the same cast-free mismatch
    // already present in this repo's TS baseline).
    const contentField = { root: { children: [{ type: 'paragraph', children: [{ text: 'Body.' }] }] } } as any

    const validPost = await engine.create({
      collection: 'posts',
      data: { title: `Parity relationship valid ${Date.now()}`, content: contentField, author: user.id },
    })
    createdPostIds.push(validPost.id as number)

    await expect(
      engine.create({
        collection: 'posts',
        // `author` is deliberately shape-invalid here (a non-numeric string
        // where this app's real idType is `'number'`) - see IDType's doc
        // comment on src/localapi/validators.ts for why.
        data: { title: `Parity relationship invalid ${Date.now()}`, content: contentField, author: 'not-a-numeric-id' as any },
      }),
    ).rejects.toThrow()
  })
})
