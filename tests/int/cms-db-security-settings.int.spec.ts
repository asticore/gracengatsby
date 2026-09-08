// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findSecuritySettings, updateSecuritySettings } from '@/cms/db'

/**
 * SecuritySettings: same shape class as member-settings (see
 * cms-db-member-settings.int.spec.ts's own doc comment) - six top-level
 * `group` fields, every leaf a plain scalar, no blocks/rels/array/
 * select-hasMany/join anywhere in the config. Every write below supplies
 * every subfield of every group it touches explicitly, for the same reason:
 * this data layer's own defaults-filling never recurses into a group's
 * subfields, only real Payload's validation layer does.
 *
 * `rateLimiting` and `auditLog` both declare their own field named `enabled`
 * - this suite deliberately sets them to DIFFERENT values in the same write
 * to prove processFields' `${groupName}${capitalize(subFieldName)}` column
 * keying keeps them distinct (`rateLimitingEnabled`/`auditLogEnabled`) rather
 * than silently colliding on one shared `enabled` column.
 *
 * No field here stores a 2FA secret/seed/token - `requireTwoFactorForAdmins`
 * is a plain on/off checkbox - so nothing in this suite touches the
 * encrypted-secret-field pattern another phase is covering elsewhere.
 */
describe('cms/db - security-settings global', () => {
  let engine: Engine

  it('reads a global updated by Payload: six groups flattened and reconstructed, including two same-named `enabled` fields', async () => {
    engine = await getEngine()

    await engine.updateGlobal({
      slug: 'security-settings',
      data: {
        loginProtection: { maxLoginAttempts: 10, lockoutMinutes: 30, requireTwoFactorForAdmins: true, sessionTimeoutMinutes: 60 },
        headers: {
          hsts: false,
          xFrameOptions: 'DENY',
          xContentTypeOptions: false,
          referrerPolicy: 'no-referrer',
          permissionsPolicy: 'camera=()',
          contentSecurityPolicy: "default-src 'self'",
        },
        rateLimiting: { enabled: false, requestsPerMinute: 60, applyToApi: false, applyToForms: true },
        hardening: { blockProbePaths: false, disableDirectoryListing: false, hideCmsFingerprint: true },
        auditLog: { enabled: true, retentionDays: 30 },
      },
    })

    const viaOurs = await findSecuritySettings()
    expect(viaOurs?.loginProtection).toEqual({
      maxLoginAttempts: 10,
      lockoutMinutes: 30,
      requireTwoFactorForAdmins: true,
      sessionTimeoutMinutes: 60,
    })
    expect(viaOurs?.headers).toEqual({
      hsts: false,
      xFrameOptions: 'DENY',
      xContentTypeOptions: false,
      referrerPolicy: 'no-referrer',
      permissionsPolicy: 'camera=()',
      contentSecurityPolicy: "default-src 'self'",
    })
    // The two same-named `enabled` fields must not collide.
    expect(viaOurs?.rateLimiting).toEqual({ enabled: false, requestsPerMinute: 60, applyToApi: false, applyToForms: true })
    expect(viaOurs?.auditLog).toEqual({ enabled: true, retentionDays: 30 })
    expect(viaOurs?.hardening).toEqual({ blockProbePaths: false, disableDirectoryListing: false, hideCmsFingerprint: true })
  })

  it('writes a global (six groups) Payload can read back, including two same-named `enabled` fields', async () => {
    const ours = await updateSecuritySettings({
      loginProtection: { maxLoginAttempts: 3, lockoutMinutes: 5, requireTwoFactorForAdmins: false, sessionTimeoutMinutes: 480 },
      headers: {
        hsts: true,
        xFrameOptions: 'SAMEORIGIN',
        xContentTypeOptions: true,
        referrerPolicy: 'strict-origin',
        permissionsPolicy: '',
        contentSecurityPolicy: '',
      },
      rateLimiting: { enabled: true, requestsPerMinute: 200, applyToApi: true, applyToForms: false },
      hardening: { blockProbePaths: true, disableDirectoryListing: true, hideCmsFingerprint: false },
      auditLog: { enabled: false, retentionDays: 180 },
    })
    expect(ours.rateLimiting).toEqual({ enabled: true, requestsPerMinute: 200, applyToApi: true, applyToForms: false })
    expect(ours.auditLog).toEqual({ enabled: false, retentionDays: 180 })

    const viaPayload = await engine.findGlobal({ slug: 'security-settings', depth: 0 })
    expect(viaPayload.rateLimiting).toEqual({ enabled: true, requestsPerMinute: 200, applyToApi: true, applyToForms: false })
    expect(viaPayload.auditLog).toEqual({ enabled: false, retentionDays: 180 })
    expect(viaPayload.loginProtection).toEqual({
      maxLoginAttempts: 3,
      lockoutMinutes: 5,
      requireTwoFactorForAdmins: false,
      sessionTimeoutMinutes: 480,
    })
  })

  it('replaces a group wholesale on update - an omitted subfield comes back null, not the old value', async () => {
    await updateSecuritySettings({ hardening: { blockProbePaths: true, disableDirectoryListing: true, hideCmsFingerprint: true } })

    const updated = await updateSecuritySettings({ hardening: { blockProbePaths: false } })
    expect(updated.hardening).toEqual({ blockProbePaths: false, disableDirectoryListing: null, hideCmsFingerprint: null })

    const viaPayload = await engine.findGlobal({ slug: 'security-settings' })
    expect(viaPayload.hardening).toEqual({ blockProbePaths: false, disableDirectoryListing: null, hideCmsFingerprint: null })
  })
})
