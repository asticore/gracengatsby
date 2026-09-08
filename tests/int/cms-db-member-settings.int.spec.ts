// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findMemberSettings, updateMemberSettings } from '@/cms/db'

/**
 * MemberSettings: a global made entirely of top-level `group` fields
 * containing only rows/plain scalars - no blocks/rels/array/select-hasMany -
 * so this suite only needs to prove the same group-flatten/reconstruct
 * mechanism cms-db-courses.int.spec.ts already proved for `seo`, now against
 * a global's upsert-only find/update (see ../../src/cms/db/generic.ts's
 * createGlobalOps doc comment for why a global has no separate id-scoped
 * create()/update(), just one find()/update() pair).
 *
 * Every write below supplies every subfield of every group it touches
 * explicitly, on purpose: ../../src/cms/db/generic.ts's own `defaults` object
 * (both createCollectionOps' and createGlobalOps') is built by walking only
 * the collection/global's TOP-LEVEL `fields` list, never recursing into a
 * group's own subfields - so a leaf field's `defaultValue` declared INSIDE a
 * group (which is every single field in this global) is never auto-filled by
 * this data layer's own create-branch of update(), only by real Payload's own
 * validation layer. cms-db-courses.int.spec.ts already proved this exact gap
 * for `seo.noIndex` (see its "writes a version row Payload can read back"
 * test, which documents an omitted defaulted subfield coming back `null`
 * rather than its declared default via a path that bypasses this data
 * layer's own defaults entirely) - MemberSettings just has the gap on every
 * field instead of one, since nothing here is a top-level field, so every
 * write here supplies full group objects to avoid depending on it either way.
 */
describe('cms/db - member-settings global', () => {
  let engine: Engine

  it('reads a global updated by Payload: four groups flattened and reconstructed', async () => {
    engine = await getEngine()

    await engine.updateGlobal({
      slug: 'member-settings',
      data: {
        registration: { allowSignup: true, requireEmailVerification: false, defaultTier: 'silver' },
        access: { redirectAfterLogin: '/dashboard', membersOnlyRedirect: '/join', teaserMode: 'full-hide' },
        billing: { currency: 'USD', allowCancellation: false, proration: true },
        emails: { welcomeSubject: 'Hi there', welcomeBody: 'Thanks for joining.', expiryReminderDays: 3 },
      },
    })

    const viaOurs = await findMemberSettings()
    expect(viaOurs?.registration).toEqual({ allowSignup: true, requireEmailVerification: false, defaultTier: 'silver' })
    expect(viaOurs?.access).toEqual({ redirectAfterLogin: '/dashboard', membersOnlyRedirect: '/join', teaserMode: 'full-hide' })
    expect(viaOurs?.billing).toEqual({ currency: 'USD', allowCancellation: false, proration: true })
    expect(viaOurs?.emails).toEqual({ welcomeSubject: 'Hi there', welcomeBody: 'Thanks for joining.', expiryReminderDays: 3 })
  })

  it('writes a global (four groups) Payload can read back', async () => {
    const ours = await updateMemberSettings({
      registration: { allowSignup: false, requireEmailVerification: true, defaultTier: 'gold' },
      access: { redirectAfterLogin: '/account', membersOnlyRedirect: '/membership', teaserMode: 'blur' },
      billing: { currency: 'GBP', allowCancellation: true, proration: false },
      emails: { welcomeSubject: 'Welcome aboard', welcomeBody: 'Glad to have you.', expiryReminderDays: 14 },
    })
    expect(ours.registration).toEqual({ allowSignup: false, requireEmailVerification: true, defaultTier: 'gold' })
    expect(ours.emails).toEqual({ welcomeSubject: 'Welcome aboard', welcomeBody: 'Glad to have you.', expiryReminderDays: 14 })

    const viaPayload = await engine.findGlobal({ slug: 'member-settings', depth: 0 })
    expect(viaPayload.access).toEqual({ redirectAfterLogin: '/account', membersOnlyRedirect: '/membership', teaserMode: 'blur' })
    expect(viaPayload.billing).toEqual({ currency: 'GBP', allowCancellation: true, proration: false })
  })

  it('replaces a group wholesale on update - an omitted subfield comes back null, not the old value', async () => {
    await updateMemberSettings({ billing: { currency: 'EUR', allowCancellation: true, proration: true } })

    const updated = await updateMemberSettings({ billing: { currency: 'NZD', allowCancellation: false, proration: false } })
    expect(updated.billing).toEqual({ currency: 'NZD', allowCancellation: false, proration: false })

    const replacedAgain = await updateMemberSettings({ billing: { currency: 'AUD' } })
    expect(replacedAgain.billing).toEqual({ currency: 'AUD', allowCancellation: null, proration: null })

    const viaPayload = await engine.findGlobal({ slug: 'member-settings' })
    expect(viaPayload.billing).toEqual({ currency: 'AUD', allowCancellation: null, proration: null })
  })
})
