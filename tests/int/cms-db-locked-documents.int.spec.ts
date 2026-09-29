// @vitest-environment node
//
// See cms-db-faqs.int.spec.ts's header for why @/engage.config is imported
// first and why this suite opts out of the jsdom environment.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createLockedDocument, createUser, deleteLockedDocument, deleteUser, findLockedDocumentByID, updateLockedDocument } from '@/cms/db'

/**
 * Proves this app's own `payload-locked-documents` reproduction (Stage 7 -
 * src/collections/PayloadLockedDocuments.ts,
 * src/cms/db/collections/lockedDocuments.ts) agrees with real Payload's own
 * internal collection on the columns both sides actually share.
 *
 * CONFIRMED, DELIBERATE GAP - `document` is not modeled (see
 * PayloadLockedDocuments.ts's header for the full reasoning: genuinely
 * per-row polymorphic, zero known caller in this app, and reproducing it
 * would mean extending shared `../cms/db/generic.ts` machinery used by
 * every other collection). Every assertion below sticks to `globalSlug` and
 * `user`'s presence, never `document`.
 *
 * Same `user`-field shape divergence as cms-db-preferences.int.spec.ts
 * (real Payload's `{relationTo, value}` vs. this app's `number[]` via
 * `topLevelRelsFieldTargets`) - `user` values are written explicitly here
 * (no `beforeValidate` hook runs in this app's local API) and never
 * compared for exact shape equality between the two sides.
 */
describe('cms/db - payload-locked-documents (Stage 7)', () => {
  let engine: Engine
  let userId: number
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
    const user = await createUser({ email: `locked-documents-test-${Date.now()}@example.com` })
    userId = user.id
  })

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteLockedDocument(id)
    }
    await deleteUser(userId)
  })

  it('reads a document written by Payload', async () => {
    const created = await engine.create({
      collection: 'payload-locked-documents',
      data: {
        globalSlug: 'site-settings',
        user: { relationTo: 'users', value: userId },
      },
      overrideAccess: true,
    })
    createdIds.push(created.id as number)

    const viaOurs = await findLockedDocumentByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.globalSlug).toBe('site-settings')
  })

  it('writes a document Payload can read back', async () => {
    const ours = await createLockedDocument({
      globalSlug: 'faq-settings',
      user: [userId] as unknown as number[],
    })
    createdIds.push(ours.id)

    const viaPayload = (await engine.findByID({
      collection: 'payload-locked-documents',
      id: ours.id,
      overrideAccess: true,
    })) as { globalSlug?: string }
    expect(viaPayload.globalSlug).toBe('faq-settings')
  })

  it('updates and deletes a document', async () => {
    const ours = await createLockedDocument({ globalSlug: 'blog-settings', user: [userId] as unknown as number[] })
    createdIds.push(ours.id)

    const updated = await updateLockedDocument(ours.id, { globalSlug: 'shop-settings' })
    expect(updated?.globalSlug).toBe('shop-settings')

    const viaPayload = (await engine.findByID({ collection: 'payload-locked-documents', id: ours.id, overrideAccess: true })) as { globalSlug?: string }
    expect(viaPayload.globalSlug).toBe('shop-settings')

    await deleteLockedDocument(ours.id)
    createdIds.splice(createdIds.indexOf(ours.id), 1)
    expect(await findLockedDocumentByID(ours.id)).toBeNull()
  })
})
