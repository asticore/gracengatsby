// @vitest-environment node
//
// See cms-db-faqs.int.spec.ts's header for why @/engage.config is imported
// first and why this suite opts out of the jsdom environment.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { countPreferences, createPreference, createUser, deletePreference, deleteUser, findPreferenceByID, findPreferences, updatePreference } from '@/cms/db'

/**
 * Proves this app's own `payload-preferences` reproduction (Stage 7 -
 * src/collections/PayloadPreferences.ts, src/cms/db/collections/preferences.ts)
 * agrees with real Payload's own internal collection on the columns both
 * sides actually share.
 *
 * FIDELITY NOTE, confirmed by reading real Payload's own
 * `payload/dist/preferences/config.js` directly: the real `user` field is
 * `relationTo: [...every auth-enabled collection]` (here, just `['users']`),
 * auto-populated by a `beforeValidate` hook from `req.user` - a hook this
 * app's own local API does not run (hooks are out of scope for this
 * cutover, tracked separately). So `user` is passed explicitly here instead
 * of relying on request context, and read back as `number[]` (this app's
 * own `topLevelRelsFieldTargets` convention - see preferences.ts's header)
 * rather than real Payload's `{relationTo, value}` object shape - these two
 * shapes are intentionally NOT compared for equality below, only
 * `key`/`value`, which both sides agree on exactly.
 */
describe('cms/db - payload-preferences (Stage 7)', () => {
  let engine: Engine
  let userId: number
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
    const user = await createUser({ email: `preferences-test-${Date.now()}@example.com` })
    userId = user.id
  })

  afterAll(async () => {
    for (const id of createdIds) {
      await deletePreference(id)
    }
    await deleteUser(userId)
  })

  it('reads a document written by Payload', async () => {
    const created = await engine.create({
      collection: 'payload-preferences',
      data: {
        user: { relationTo: 'users', value: userId },
        key: 'nav-collapsed',
        value: { collapsed: true },
      },
      overrideAccess: true,
    })
    createdIds.push(created.id as number)

    const viaOurs = await findPreferenceByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.key).toBe('nav-collapsed')
    expect(viaOurs?.value).toEqual({ collapsed: true })
  })

  it('writes a document Payload can read back', async () => {
    const ours = await createPreference({
      user: [userId] as unknown as number[],
      key: 'theme',
      value: { mode: 'dark' },
    })
    createdIds.push(ours.id)

    const viaPayload = (await engine.findByID({
      collection: 'payload-preferences',
      id: ours.id,
      overrideAccess: true,
    })) as { key?: string; value?: unknown }
    expect(viaPayload.key).toBe('theme')
    expect(viaPayload.value).toEqual({ mode: 'dark' })
  })

  it('updates and deletes a document', async () => {
    const ours = await createPreference({ user: [userId] as unknown as number[], key: 'sidebar', value: { width: 240 } })
    createdIds.push(ours.id)

    const updated = await updatePreference(ours.id, { value: { width: 300 } })
    expect(updated?.value).toEqual({ width: 300 })

    const viaPayload = (await engine.findByID({ collection: 'payload-preferences', id: ours.id, overrideAccess: true })) as { value?: unknown }
    expect(viaPayload.value).toEqual({ width: 300 })

    await deletePreference(ours.id)
    createdIds.splice(createdIds.indexOf(ours.id), 1)
    expect(await findPreferenceByID(ours.id)).toBeNull()
  })

  it('finds and counts by key', async () => {
    const ours = await createPreference({ user: [userId] as unknown as number[], key: 'find-me', value: { hit: true } })
    createdIds.push(ours.id)

    const found = await findPreferences({ where: { key: { equals: 'find-me' } } })
    expect(found.some((doc) => doc.id === ours.id)).toBe(true)

    const count = await countPreferences({ where: { key: { equals: 'find-me' } } })
    expect(count).toBeGreaterThanOrEqual(1)
  })
})
